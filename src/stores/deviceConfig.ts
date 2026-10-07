import { acceptHMRUpdate, defineStore, getActivePinia } from 'pinia';
import { computed, ref } from 'vue';
import { invoke, isTauri } from '@tauri-apps/api/core';

export type SensorTransport = 'modbus-tcp' | 'rtu-over-tcp';
export type SensorType = 'single-axis' | 'three-axis';

export interface SensorDeviceConfig {
  ip: string;
  port: number;
  transport: SensorTransport;
  sensorType: SensorType;
  unitId: number;
  functionCode: number;
  timeoutMs: number;
  baudRate: number | null;
}

export interface SensorMeasurement {
  key: string;
  label: string;
  value: number;
  unit: string;
  displacementMm: number | null;
}

export interface SensorTestReport {
  ok: boolean;
  action: 'connection' | 'read';
  endpoint: string;
  transport: SensorTransport;
  sensorType: SensorType;
  elapsedMs: number;
  connectionReused: boolean;
  sampledAt: number;
  message: string;
  errorStage: string | null;
  measurements: SensorMeasurement[];
  registers: { address: number; raw: number }[];
  frames: { startAddress: number; count: number; request: string; response: string }[];
}

export interface DeviceConnectionState {
  status: 'idle' | 'connecting' | 'connected' | 'failed' | 'unavailable';
  message: string;
  retryCount: number;
  reconnecting: boolean;
  lastCheckedAt: number | null;
  nextRetryAt: number | null;
}

export function defaultSensorConfig(): SensorDeviceConfig {
  return {
    ip: '192.168.0.177', port: 20108, transport: 'modbus-tcp', sensorType: 'single-axis',
    unitId: 1, functionCode: 3, timeoutMs: 2000, baudRate: 4800
  };
}

const PREVIEW_KEY = 'ship.sensor-device.v1';
const RECONNECT_DELAY_MS = 3000;

function configFields(value: SensorDeviceConfig): SensorDeviceConfig {
  // 兼容旧配置，只保留仍在使用的字段，移除已废弃的采集间隔。
  return {
    ip: value.ip, port: value.port, transport: value.transport, sensorType: value.sensorType,
    unitId: value.unitId, functionCode: value.functionCode, timeoutMs: value.timeoutMs, baudRate: value.baudRate
  };
}

function initialConnectionState(): DeviceConnectionState {
  return {
    status: 'idle', message: '', retryCount: 0, reconnecting: false,
    lastCheckedAt: null, nextRetryAt: null
  };
}

export const useDeviceConfigStore = defineStore('deviceConfig', () => {
  const config = ref<SensorDeviceConfig>(defaultSensorConfig());
  const loaded = ref(false);
  const connection = ref<DeviceConnectionState>(initialConnectionState());
  const latestRead = ref<SensorTestReport | null>(null);
  const latestReport = ref<SensorTestReport | null>(null);
  const vibrationMeasurement = computed(() => {
    if (connection.value.status !== 'connected') return null;
    // 单轴传感器使用位移寄存器；三轴型号使用 X 轴，并在监测页标明来源。
    const key = config.value.sensorType === 'three-axis' ? 'displacement-x' : 'displacement';
    return latestRead.value?.measurements.find(item => item.key === key
      && item.unit === 'μm' && Number.isFinite(item.value)
      && item.displacementMm !== null && Number.isFinite(item.displacementMm)) ?? null;
  });
  const vibrationDisplacementMm = computed(() => vibrationMeasurement.value?.displacementMm ?? null);
  const vibrationDisplacementUm = computed(() => vibrationMeasurement.value?.value ?? null);
  let loading: Promise<void> | null = null;
  let configRevision = 0;
  let monitoring = false;
  let generation = 0;
  let monitorTimer: ReturnType<typeof setTimeout> | undefined;
  let monitorRead: { config: SensorDeviceConfig; generation: number; promise: Promise<SensorTestReport> } | null = null;
  // 后台检测、单次测试和自动读取共用串行队列，避免争抢同一条 RS485 总线。
  let communicationTail: Promise<void> = import.meta.hot?.data.deviceCommunicationTail ?? Promise.resolve();

  async function load() {
    if (loaded.value) return;
    if (loading) return loading;
    const revision = configRevision;
    loading = (async () => {
      let restored = defaultSensorConfig();
      if (isTauri()) {
        restored = await invoke<SensorDeviceConfig>('load_device_config');
      } else {
        const text = localStorage.getItem(PREVIEW_KEY);
        if (text) restored = { ...restored, ...JSON.parse(text) };
      }
      // 保存新参数后，较早开始的加载请求不能覆盖新配置。
      if (revision === configRevision) {
        config.value = configFields(restored);
        loaded.value = true;
      }
    })();
    try { await loading; }
    finally { loading = null; }
  }

  async function save(value: SensorDeviceConfig) {
    const normalized = configFields({ ...value, ip: value.ip.trim() });
    if (isTauri()) {
      await invoke('save_device_config', { config: normalized });
    } else {
      localStorage.setItem(PREVIEW_KEY, JSON.stringify(normalized));
    }
    configRevision++;
    config.value = normalized;
    loaded.value = true;
    if (monitoring) restartMonitoring();
  }

  function queuedTest(value: SensorDeviceConfig, action: 'connection' | 'read', isCurrent?: () => boolean) {
    const normalized = configFields({ ...value, ip: value.ip.trim() });
    const request = communicationTail.then(() => {
      if (isCurrent && !isCurrent()) throw new Error('连接检测已取消');
      return invoke<SensorTestReport>('test_sensor_device', { config: normalized, action });
    });
    communicationTail = request.then(() => undefined, () => undefined);
    return request;
  }

  async function test(value: SensorDeviceConfig, action: 'connection' | 'read') {
    if (!isTauri()) throw new Error('请在桌面客户端测试设备连接，浏览器预览不能直接连接 Modbus 网口。');
    // A manual read of the monitored device joins the current request rather
    // than issuing another one on the same RS485 bus.
    if (action === 'read' && monitoring && monitorRead?.generation === generation
      && JSON.stringify(configFields({ ...value, ip: value.ip.trim() })) === JSON.stringify(monitorRead.config)) {
      return monitorRead.promise;
    }
    return queuedTest(value, action);
  }

  async function checkConnection(currentGeneration: number) {
    const isCurrent = () => monitoring && currentGeneration === generation;
    if (!isCurrent()) return;
    connection.value.reconnecting = connection.value.status === 'failed';
    connection.value.nextRetryAt = null;
    let attempt: SensorTestReport | null = null;
    try {
      await load();
      if (!isCurrent()) return;
      const request = { config: configFields(config.value), generation: currentGeneration,
        promise: queuedTest(config.value, 'read', isCurrent) };
      monitorRead = request;
      let result: SensorTestReport;
      try { result = await request.promise; }
      finally { if (monitorRead === request) monitorRead = null; }
      if (!isCurrent()) return;
      attempt = result;
      latestReport.value = result;
      if (!result.ok || result.measurements.length === 0) {
        throw new Error(result.message || '未收到有效传感器数据');
      }
      latestRead.value = result;
      connection.value = {
        status: 'connected', message: '传感器响应有效，设备连接成功', retryCount: 0,
        reconnecting: false, lastCheckedAt: Date.now(), nextRetryAt: null
      };
    } catch (error) {
      if (!isCurrent()) return;
      latestReport.value = attempt;
      latestRead.value = null;
      connection.value = {
        status: 'failed', message: error instanceof Error ? error.message : String(error),
        retryCount: connection.value.retryCount + 1, reconnecting: false,
        lastCheckedAt: Date.now(), nextRetryAt: Date.now() + RECONNECT_DELAY_MS
      };
    }
    if (!isCurrent()) return;
    if (connection.value.status === 'failed') {
      monitorTimer = setTimeout(() => void checkConnection(currentGeneration), RECONNECT_DELAY_MS);
    } else {
      // 成功响应后直接继续，不加固定等待；串行队列保证上一条结束后才发送下一条。
      void checkConnection(currentGeneration);
    }
  }

  function startMonitoring() {
    if (monitoring) return;
    if (!isTauri()) {
      connection.value = { ...initialConnectionState(), status: 'unavailable', message: '浏览器不能连接 Modbus 设备，请使用桌面客户端' };
      return;
    }
    monitoring = true;
    const currentGeneration = ++generation;
    connection.value = { ...initialConnectionState(), status: 'connecting', message: '正在连接设备并校验传感器响应' };
    void checkConnection(currentGeneration);
  }

  function stopMonitoring() {
    const wasMonitoring = monitoring;
    monitoring = false;
    generation++;
    if (monitorTimer !== undefined) clearTimeout(monitorTimer);
    monitorTimer = undefined;
    latestRead.value = null;
    latestReport.value = null;
    connection.value = initialConnectionState();
    if (wasMonitoring && isTauri()) {
      // Close only after any in-flight read finishes. A restart queues its
      // first read behind this close, so the new connection cannot be closed.
      const close = communicationTail.then(() => invoke('close_sensor_connection'));
      communicationTail = close.then(() => undefined, () => undefined);
    }
  }

  function restartMonitoring() {
    stopMonitoring();
    startMonitoring();
  }

  if (import.meta.hot) import.meta.hot.dispose(() => {
    import.meta.hot!.data.deviceMonitoring = monitoring;
    stopMonitoring();
    import.meta.hot!.data.deviceCommunicationTail = communicationTail;
  });

  return {
    config, loaded, connection, latestRead, latestReport, vibrationMeasurement, vibrationDisplacementMm, vibrationDisplacementUm,
    load, save, test, startMonitoring, stopMonitoring
  };
});

if (import.meta.hot) {
  const hot = import.meta.hot;
  const acceptUpdate = acceptHMRUpdate(useDeviceConfigStore, hot);
  hot.accept(module => {
    acceptUpdate(module);
    if (hot.data.deviceMonitoring && getActivePinia()) useDeviceConfigStore().startMonitoring();
  });
}
