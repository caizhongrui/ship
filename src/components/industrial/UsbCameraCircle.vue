<template>
  <div class="usb-camera-circle" :class="cameraState" @click="reconnectCamera">
    <video
      ref="videoRef"
      autoplay
      muted
      playsinline
      aria-label="螺旋桨 USB 摄像头实时画面"
    ></video>

    <div v-if="cameraState !== 'playing'" class="camera-placeholder">
      <span class="camera-icon">▣</span>
      <strong>{{ cameraStatusText }}</strong>
      <small>点击重连</small>
    </div>

  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';

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
      ? {
          deviceId: parsed.deviceId,
          label: typeof parsed.label === 'string' ? parsed.label : ''
        }
      : null;
  } catch {
    return null;
  }
}

const rememberedCamera = readRememberedCamera();
const videoRef = ref<HTMLVideoElement>();
const selectedDeviceId = ref(rememberedCamera?.deviceId ?? '');
const rememberedCameraLabel = ref(rememberedCamera?.label ?? '');
const cameraState = ref<CameraState>('idle');
let cameraStream: MediaStream | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const cameraStatusText = computed(() => {
  const labels: Record<CameraState, string> = {
    idle: '等待摄像头',
    starting: '正在连接',
    playing: '实时监测',
    error: '摄像头未连接'
  };
  return labels[cameraState.value];
});

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

async function rememberActiveCamera() {
  const activeDeviceId = cameraStream?.getVideoTracks()[0]?.getSettings().deviceId;
  if (!activeDeviceId) return;
  selectedDeviceId.value = activeDeviceId;

  try {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
      device => device.kind === 'videoinput'
    );
    const activeDevice = devices.find(device => device.deviceId === activeDeviceId);
    const label = activeDevice?.label || rememberedCameraLabel.value;
    rememberedCameraLabel.value = label;
    localStorage.setItem(
      CAMERA_STORAGE_KEY,
      JSON.stringify({ deviceId: activeDeviceId, label })
    );
  } catch {
    // 无法读取设备列表或本机存储时，实时画面仍可继续显示。
  }
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraState.value = 'error';
    return;
  }

  releaseCamera();
  cameraState.value = 'starting';

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        deviceId: selectedDeviceId.value
          ? { ideal: selectedDeviceId.value }
          : undefined,
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      }
    });

    const activeTrack = cameraStream.getVideoTracks()[0];
    activeTrack?.addEventListener('ended', scheduleReconnect, { once: true });

    await nextTick();
    if (!videoRef.value) throw new Error('camera element unavailable');
    videoRef.value.srcObject = cameraStream;
    await videoRef.value.play();
    cameraState.value = 'playing';
    await rememberActiveCamera();
  } catch {
    releaseCamera();
    cameraState.value = 'error';
  }
}

function reconnectCamera() {
  if (cameraState.value === 'starting') return;
  clearReconnectTimer();
  void startCamera();
}

function handleDeviceChange() {
  if (!cameraStream?.active) scheduleReconnect();
}

onMounted(() => {
  navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);
  void startCamera();
});

onUnmounted(() => {
  navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
  clearReconnectTimer();
  releaseCamera();
});
</script>

<style scoped>
.usb-camera-circle {
  position: relative;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  border: 4px solid #6c6881;
  border-radius: 50%;
  background:
    radial-gradient(circle at center, #343445 0%, #161721 70%),
    #161721;
  box-shadow:
    0 5px 16px rgba(45, 42, 63, 0.24),
    inset 0 0 0 2px rgba(255, 255, 255, 0.35);
  cursor: pointer;
}

.usb-camera-circle.playing {
  border: 0;
  box-shadow: 0 5px 16px rgba(45, 42, 63, 0.24);
}

video {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  background: #080910;
}

.camera-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  color: #e3e3e9;
  text-align: center;
}

.camera-icon {
  margin-bottom: 2px;
  font-size: 24px;
  opacity: 0.8;
}

.camera-placeholder strong {
  font-size: 11px;
  letter-spacing: 0.5px;
}

.camera-placeholder small {
  color: #a5a5b3;
  font-size: 9px;
}

.starting .camera-icon {
  animation: camera-pulse 1s ease-in-out infinite;
}

@keyframes camera-pulse {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 1; }
}
</style>
