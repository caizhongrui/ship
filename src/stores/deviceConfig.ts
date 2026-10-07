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
  pollIntervalMs: number;
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
    unitId: 1, functionCode: 3, timeoutMs: 2000, pollIntervalMs: 1000, baudRate: 4800
  };
}

const PREVIEW_KEY = 'ship.sensor-device.v1';
const RECONNECT_DELAY_MS = 3000;

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
  const vibrationMeasurement = computed(() => {
    if (connection.value.status !== 'connected') return null;
    // 单轴传感器使用位移寄存器；三轴型号使用 X 轴，并在监测页标明来源。
    const key = config.value.sensorType === 'three-axis' ? 'displacement-x' : 'displacement';
    return latestRead.value?.measurements.find(item => item.key === key
      && item.displacementMm !== null && Number.isFinite(item.displacementMm)) ?? null;
  });
  const vibrationDisplacementMm = computed(() => vibrationMeasurement.value?.displacementMm ?? null);
  let loading: Promise<void> | null = null;
  let configRevision = 0;
  let monitoring = false;
  let generation = 0;
  let monitorTimer: ReturnType<typeof setTimeout> | undefined;
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
        config.value = restored;
        loaded.value = true;
      }
    })();
    try { await loading; }
    finally { loading = null; }
  }

  async function save(value: SensorDeviceConfig) {
    const normalized = { ...value, ip: value.ip.trim() };
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
    const normalized = { ...value, ip: value.ip.trim() };
    const request = communicationTail.then(() => {
      if (isCurrent && !isCurrent()) throw new Error('连接检测已取消');
      return invoke<SensorTestReport>('test_sensor_device', { config: normalized, action });
    });
    communicationTail = request.then(() => undefined, () => undefined);
    return request;
  }

  async function test(value: SensorDeviceConfig, action: 'connection' | 'read') {
    if (!isTauri()) throw new Error('请在桌面客户端测试设备连接，浏览器预览不能直接连接 Modbus 网口。');
    return queuedTest(value, action);
  }

  async function checkConnection(currentGeneration: number) {
    const isCurrent = () => monitoring && currentGeneration === generation;
    if (!isCurrent()) return;
    connection.value.reconnecting = connection.value.status === 'failed';
    connection.value.nextRetryAt = null;
    try {
      await load();
      if (!isCurrent()) return;
      const result = await queuedTest(config.value, 'read', isCurrent);
      if (!isCurrent()) return;
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
      latestRead.value = null;
      connection.value = {
        status: 'failed', message: error instanceof Error ? error.message : String(error),
        retryCount: connection.value.retryCount + 1, reconnecting: false,
        lastCheckedAt: Date.now(), nextRetryAt: Date.now() + RECONNECT_DELAY_MS
      };
    }
    if (!isCurrent()) return;
    const delay = connection.value.status === 'failed'
      ? RECONNECT_DELAY_MS : Math.max(1000, config.value.pollIntervalMs);
    monitorTimer = setTimeout(() => void checkConnection(currentGeneration), delay);
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
    monitoring = false;
    generation++;
    if (monitorTimer !== undefined) clearTimeout(monitorTimer);
    monitorTimer = undefined;
    latestRead.value = null;
    connection.value = initialConnectionState();
  }

  function restartMonitoring() {
    stopMonitoring();
    startMonitoring();
  }

  if (import.meta.hot) import.meta.hot.dispose(() => {
    import.meta.hot!.data.deviceMonitoring = monitoring;
    import.meta.hot!.data.deviceCommunicationTail = communicationTail;
    stopMonitoring();
  });

  return {
    config, loaded, connection, latestRead, vibrationMeasurement, vibrationDisplacementMm,
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
