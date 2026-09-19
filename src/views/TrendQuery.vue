<template>
  <div class="trend page">
    <div class="ind-panel">
      <div class="ind-panel__title">螺 旋 桨 监 测</div>
      <div class="ind-panel__body monitor-body">
        <div class="camera-toolbar">
          <span class="lbl">USB 摄像头：</span>
          <el-select
            v-model="selectedDeviceId"
            size="small"
            class="camera-select"
            placeholder="选择摄像头"
            popper-class="usb-camera-popper"
            :disabled="cameraState === 'starting'"
            @change="onCameraChange"
          >
            <template #prefix>
              <span class="camera-select-icon">▣</span>
            </template>
            <el-option
              v-for="(device, index) in videoDevices"
              :key="device.deviceId"
              :label="cameraDeviceLabel(device, index)"
              :value="device.deviceId"
            >
              <div class="camera-option">
                <span class="camera-option-icon">▣</span>
                <span class="camera-option-name">{{ cameraDeviceLabel(device, index) }}</span>
                <span v-if="selectedDeviceId === device.deviceId" class="camera-option-check">✓</span>
              </div>
            </el-option>
          </el-select>
          <el-button
            size="small"
            type="primary"
            :loading="cameraState === 'starting'"
            @click="reconnectCamera"
          >
            重新连接
          </el-button>
          <span class="toolbar-spacer"></span>
          <span class="camera-status" :class="cameraState">
            <i></i>{{ cameraStatusText }}
          </span>
        </div>

        <div class="monitor-grid">
          <section class="sub-panel camera-panel">
            <div class="sub-title">
              <span>螺旋桨实时画面</span>
              <span v-if="cameraState === 'playing'" class="live-badge">LIVE</span>
            </div>
            <div class="video-stage">
              <video
                ref="videoRef"
                autoplay
                muted
                playsinline
                aria-label="USB 摄像头实时画面"
              ></video>
              <div v-if="cameraState !== 'playing'" class="video-placeholder">
                <div class="camera-symbol">▣</div>
                <strong>{{ cameraStatusText }}</strong>
                <span>{{ cameraError || '连接 USB 摄像头后，系统将自动显示实时画面' }}</span>
              </div>
              <div v-else class="video-overlay">
                <span class="video-source">
                  <span class="record-dot"></span>
                  USB CAMERA
                </span>
                <time class="video-time">{{ currentVideoTime }}</time>
              </div>
            </div>
          </section>

          <div class="right-column">
            <section class="sub-panel vision-panel">
              <div class="sub-title">工业视觉监测状态</div>
              <div class="vision-content">
                <div class="vision-state" :class="{ online: cameraState === 'playing' }">
                  <span class="vision-icon">◎</span>
                  <div>
                    <strong>{{ cameraState === 'playing' ? '实时监测中' : '等待视频信号' }}</strong>
                    <p>{{ visualStatusText }}</p>
                  </div>
                </div>
                <div class="metric-row">
                  <div><span>主机转速</span><b class="num">{{ t.state.rpm.toFixed(1) }}</b><em>rpm</em></div>
                  <div><span>螺旋桨转速</span><b class="num">{{ (t.state.rpm * 0.9875).toFixed(1) }}</b><em>rpm</em></div>
                  <div><span>视频状态</span><b>{{ cameraState === 'playing' ? '正常' : '未连接' }}</b></div>
                </div>
              </div>
            </section>

            <section class="sub-panel trend-panel">
              <div class="sub-title trend-title">
                <span>运行参数趋势</span>
                <div class="trend-controls">
                  <el-select
                    v-model="selectedTags"
                    multiple
                    size="small"
                    placeholder="选择测点"
                    collapse-tags
                    collapse-tags-tooltip
                  >
                    <el-option
                      v-for="opt in tagOptions"
                      :key="opt.key"
                      :label="opt.label"
                      :value="opt.key"
                    />
                  </el-select>
                  <el-select v-model="windowSec" size="small" class="window-select">
                    <el-option label="近 60 秒" :value="60" />
                    <el-option label="近 5 分钟" :value="300" />
                    <el-option label="近 10 分钟" :value="600" />
                  </el-select>
                </div>
              </div>
              <div class="chart-wrap">
                <TrendChart :series="series" />
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import TrendChart from '@/components/industrial/TrendChart.vue';
import { useTelemetryStore } from '@/stores/telemetry';

const t = useTelemetryStore();

type CameraState = 'idle' | 'starting' | 'playing' | 'error';
interface RememberedCamera {
  deviceId: string;
  label: string;
}

const CAMERA_STORAGE_KEY = 'ship-digital-twin:selected-usb-camera';

function readRememberedCamera(): RememberedCamera | null {
  try {
    const value = localStorage.getItem(CAMERA_STORAGE_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<RememberedCamera>;
    return typeof parsed.deviceId === 'string'
      ? { deviceId: parsed.deviceId, label: typeof parsed.label === 'string' ? parsed.label : '' }
      : null;
  } catch {
    return null;
  }
}

const rememberedCamera = readRememberedCamera();

const videoRef = ref<HTMLVideoElement>();
const videoDevices = ref<MediaDeviceInfo[]>([]);
const selectedDeviceId = ref(rememberedCamera?.deviceId ?? '');
const rememberedCameraLabel = ref(rememberedCamera?.label ?? '');
const cameraState = ref<CameraState>('idle');
const cameraError = ref('');
const currentVideoTime = ref('');
let cameraStream: MediaStream | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let videoClockTimer: ReturnType<typeof setInterval> | null = null;

function updateVideoTime() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  currentVideoTime.value =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function cameraDeviceLabel(device: MediaDeviceInfo, index: number) {
  return device.label || `USB 摄像头 ${index + 1}`;
}

function rememberCamera(deviceId: string) {
  if (!deviceId) return;
  const device = videoDevices.value.find(item => item.deviceId === deviceId);
  const label = device?.label || rememberedCameraLabel.value;
  rememberedCameraLabel.value = label;
  try {
    localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify({ deviceId, label }));
  } catch {
    // 本机存储不可用时不影响摄像头实时显示。
  }
}

const cameraStatusText = computed(() => {
  const labels: Record<CameraState, string> = {
    idle: '摄像头未启动',
    starting: '正在连接摄像头…',
    playing: 'USB 摄像头已连接',
    error: '摄像头连接失败'
  };
  return labels[cameraState.value];
});

const visualStatusText = computed(() =>
  cameraState.value === 'playing'
    ? '实时画面传输正常，可监看螺旋桨运转、缠绕物及外观异常。'
    : '请连接 USB 摄像头并授权访问，系统将显示螺旋桨实时画面。'
);

function releaseCamera() {
  cameraStream?.getTracks().forEach(track => {
    track.removeEventListener('ended', scheduleReconnect);
    track.stop();
  });
  cameraStream = null;
  if (videoRef.value) videoRef.value.srcObject = null;
}

function clearReconnectTimer() {
  if (!reconnectTimer) return;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function scheduleReconnect() {
  clearReconnectTimer();
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void startCamera();
  }, 1000);
}

function cameraErrorMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return '摄像头权限未授权，请在 Windows 权限设置中允许本应用访问摄像头。';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return '未检测到 USB 摄像头，请检查设备连接。';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return '摄像头正被其他程序占用，请关闭占用程序后重试。';
  }
  return error instanceof Error ? error.message : '无法打开摄像头。';
}

async function refreshDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    videoDevices.value = [];
    return;
  }
  try {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
      device => device.kind === 'videoinput'
    );
    videoDevices.value = devices;
    if (
      selectedDeviceId.value &&
      !devices.some(device => device.deviceId === selectedDeviceId.value)
    ) {
      const matchingDevice = rememberedCameraLabel.value
        ? devices.find(device => device.label === rememberedCameraLabel.value)
        : undefined;
      selectedDeviceId.value = matchingDevice?.deviceId ?? '';
      if (matchingDevice) rememberCamera(matchingDevice.deviceId);
    }
  } catch {
    videoDevices.value = [];
  }
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraState.value = 'error';
    cameraError.value = '当前系统不支持摄像头访问。';
    return;
  }

  releaseCamera();
  cameraState.value = 'starting';
  cameraError.value = '';

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        deviceId: selectedDeviceId.value
          ? { ideal: selectedDeviceId.value }
          : undefined,
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 }
      }
    });

    const activeTrack = cameraStream.getVideoTracks()[0];
    activeTrack?.addEventListener('ended', scheduleReconnect, { once: true });

    await nextTick();
    if (!videoRef.value) throw new Error('视频显示组件尚未就绪。');
    videoRef.value.srcObject = cameraStream;
    await videoRef.value.play();
    cameraState.value = 'playing';

    const activeDeviceId = cameraStream.getVideoTracks()[0]?.getSettings().deviceId;
    if (activeDeviceId) selectedDeviceId.value = activeDeviceId;
    await refreshDevices();
    rememberCamera(selectedDeviceId.value);
  } catch (error) {
    releaseCamera();
    cameraState.value = 'error';
    cameraError.value = cameraErrorMessage(error);
  }
}

function reconnectCamera() {
  clearReconnectTimer();
  void startCamera();
}

function onCameraChange() {
  rememberCamera(selectedDeviceId.value);
  void startCamera();
}

async function handleDeviceChange() {
  await refreshDevices();
  if (!cameraStream?.active) scheduleReconnect();
}

onMounted(() => {
  navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);
  updateVideoTime();
  videoClockTimer = setInterval(updateVideoTime, 1000);
  void startCamera();
});

onUnmounted(() => {
  navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
  if (videoClockTimer) clearInterval(videoClockTimer);
  clearReconnectTimer();
  releaseCamera();
});

interface TagOpt {
  key: string;
  label: string;
  color: string;
  pick: (s: any) => number;
}

const tagOptions: TagOpt[] = [
  { key: 'rpm', label: '主机转速 rpm', color: '#FF2D2D', pick: s => s.rpm },
  { key: 'load', label: '主机负荷 %', color: '#FFD000', pick: s => s.loadPct },
  { key: 'power', label: '主机功率 kW', color: '#FF8800', pick: s => s.power },
  { key: 'manifold', label: '排烟总管温度 ℃', color: '#22CC55', pick: s => s.exhaustManifold },
  { key: 'bearing', label: '中间轴承温度 ℃', color: '#33A8FF', pick: s => s.bearingTemp },
  { key: 'scav', label: '扫气压力 bar', color: '#B14EFF', pick: s => s.scavPressure },
  { key: 'vib', label: '轴系振动位移 mm', color: '#00E0E0', pick: s => s.shaftVibration },
  { key: 'volt', label: '电网电压 V', color: '#FFFFFF', pick: s => s.busVoltage },
  { key: 'freq', label: '电网频率 Hz', color: '#FF99CC', pick: s => s.busFrequency }
];

const selectedTags = ref<string[]>(['rpm', 'load', 'bearing']);
const windowSec = ref(300);

const series = computed(() => {
  // 以单调时间轴 monoT 为 x，确保故障修复后剧本重放也能在曲线上连续显示
  const lastMono =
    t.history.length > 0 ? t.history[t.history.length - 1].monoT : 0;
  const min = lastMono - windowSec.value;
  const filtered = t.history.filter(h => h.monoT >= min);
  return selectedTags.value
    .map(k => tagOptions.find(o => o.key === k))
    .filter((x): x is TagOpt => !!x)
    .map(opt => ({
      name: opt.label,
      color: opt.color,
      data: filtered.map(h => [h.monoT, opt.pick(h)] as [number, number])
    }));
});
</script>

<style scoped>
.page {
  padding: 8px;
  height: 100%;
  overflow: hidden;
}

.ind-panel {
  height: 100%;
}

.monitor-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
}

.camera-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  flex-shrink: 0;
  font-size: 12px;
}

.lbl {
  color: var(--c-text-2);
  white-space: nowrap;
}

.camera-select {
  width: min(360px, 32vw);
}

.camera-select-icon {
  display: inline-grid;
  width: 20px;
  height: 20px;
  place-items: center;
  border-radius: 4px;
  background: linear-gradient(145deg, #77738f, #5e5a76);
  color: #fff;
  font-size: 11px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

.camera-select :deep(.el-select__wrapper) {
  min-height: 34px;
  padding: 4px 10px;
  border: 1px solid #aaa8b7;
  border-radius: 6px;
  background: linear-gradient(180deg, #ffffff 0%, #f2f1f5 100%);
  box-shadow:
    inset 0 1px 0 #fff,
    0 1px 3px rgba(53, 50, 72, 0.12);
  transition: border-color 0.16s, box-shadow 0.16s;
}

.camera-select :deep(.el-select__wrapper:hover) {
  border-color: #817c9b;
}

.camera-select :deep(.el-select__wrapper.is-focused) {
  border-color: var(--c-bg-header);
  box-shadow:
    0 0 0 2px rgba(110, 106, 140, 0.15),
    inset 0 1px 0 #fff;
}

.camera-select :deep(.el-select__selected-item) {
  color: #343146;
  font-size: 13px;
  font-weight: 600;
}

.camera-select :deep(.el-select__caret) {
  color: #66627d;
  font-size: 16px;
}

:global(.usb-camera-popper.el-popper) {
  overflow: hidden;
  border: 1px solid #aaa6ba;
  border-radius: 7px;
  box-shadow: 0 8px 22px rgba(49, 45, 70, 0.24);
}

:global(.usb-camera-popper .el-select-dropdown__list) {
  padding: 5px;
}

:global(.usb-camera-popper .el-select-dropdown__item) {
  height: 38px;
  padding: 0 10px;
  border-radius: 4px;
  color: #454157;
  line-height: 38px;
}

:global(.usb-camera-popper .el-select-dropdown__item:hover),
:global(.usb-camera-popper .el-select-dropdown__item.is-hovering) {
  background: #eceaf2;
}

:global(.usb-camera-popper .el-select-dropdown__item.is-selected) {
  background: #e2dfe9;
  color: var(--c-bg-header);
  font-weight: 700;
}

.camera-option {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
}

.camera-option-icon {
  display: inline-grid;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  place-items: center;
  border-radius: 4px;
  background: #77738f;
  color: #fff;
  font-size: 11px;
}

.camera-option-name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.camera-option-check {
  color: var(--c-accent);
  font-size: 15px;
  font-weight: 700;
}

.toolbar-spacer {
  flex: 1;
}

.camera-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  color: var(--c-text-2);
  white-space: nowrap;
}

.camera-status i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #8c8a98;
}

.camera-status.starting i {
  background: #d6a520;
  animation: status-pulse 1s infinite;
}

.camera-status.playing {
  color: #277947;
  font-weight: 600;
}

.camera-status.playing i {
  background: #34a85f;
  box-shadow: 0 0 5px rgba(52, 168, 95, 0.6);
}

.camera-status.error {
  color: var(--c-accent);
}

.camera-status.error i {
  background: var(--c-accent);
}

.monitor-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(440px, 1fr);
  gap: 8px;
}

.sub-panel {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--c-bg-panel);
  border: 1px solid var(--c-border-soft);
  border-radius: 2px;
}

.sub-title {
  min-height: 34px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
  color: var(--c-text);
  background: var(--c-bg-panel-alt);
  border-bottom: 1px solid var(--c-border-soft);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 1px;
}

.live-badge {
  padding: 2px 7px;
  border-radius: 2px;
  background: var(--c-accent);
  color: #fff;
  font-family: var(--font-num);
  font-size: 10px;
  letter-spacing: 1px;
}

.camera-panel {
  background: #090b12;
}

.video-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background:
    radial-gradient(circle at center, rgba(55, 60, 76, 0.65), transparent 58%),
    #090b12;
}

.video-stage video {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
  background: #05060a;
}

.video-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 28px;
  text-align: center;
  color: #c9cbd5;
}

.video-placeholder strong {
  font-size: 17px;
  letter-spacing: 1px;
}

.video-placeholder span {
  max-width: 480px;
  color: #9095a5;
  font-size: 12px;
  line-height: 1.7;
}

.camera-symbol {
  width: 64px;
  height: 48px;
  display: grid;
  place-items: center;
  border: 2px solid #7d8190;
  border-radius: 5px;
  color: #a6aab9;
  font-size: 28px;
}

.video-overlay {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #fff;
  font-family: var(--font-num);
  font-size: 10px;
  letter-spacing: 1px;
  pointer-events: none;
}

.video-source,
.video-time {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 9px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 3px;
  background: rgba(8, 10, 16, 0.68);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.28);
  text-shadow: 0 1px 2px #000;
}

.video-time {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.7px;
}

.record-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #f13c3c;
  box-shadow: 0 0 5px #f13c3c;
}

.right-column {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(175px, 0.65fr) minmax(260px, 1.35fr);
  gap: 8px;
}

.vision-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 14px;
  padding: 14px;
}

.vision-state {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-left: 4px solid #8c8a98;
  background: var(--c-bg-active);
}

.vision-state.online {
  border-left-color: #34a85f;
}

.vision-state strong {
  display: block;
  margin-bottom: 4px;
  font-size: 14px;
}

.vision-state p {
  margin: 0;
  color: var(--c-text-2);
  font-size: 12px;
  line-height: 1.55;
}

.vision-icon {
  flex-shrink: 0;
  color: #8c8a98;
  font-size: 30px;
}

.vision-state.online .vision-icon {
  color: #34a85f;
}

.metric-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.metric-row > div {
  min-width: 0;
  padding: 10px 8px;
  text-align: center;
  background: var(--c-bg-panel-alt);
  border: 1px solid var(--c-border-soft);
}

.metric-row span {
  display: block;
  margin-bottom: 6px;
  color: var(--c-text-2);
  font-size: 11px;
}

.metric-row b {
  color: var(--c-text);
  font-size: 18px;
}

.metric-row em {
  margin-left: 4px;
  color: var(--c-text-2);
  font-size: 10px;
  font-style: normal;
}

.trend-title {
  min-height: 42px;
}

.trend-controls {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.trend-controls > .el-select:first-child {
  width: 230px;
}

.window-select {
  width: 105px;
}

.chart-wrap {
  flex: 1;
  min-height: 0;
}

@keyframes status-pulse {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 1; }
}

@media (max-width: 1360px) {
  .monitor-grid {
    grid-template-columns: minmax(0, 1.2fr) minmax(400px, 1fr);
  }

  .camera-select {
    width: 270px;
  }

  .trend-controls > .el-select:first-child {
    width: 190px;
  }

  .vision-content {
    gap: 9px;
    padding: 10px;
  }
}
</style>
