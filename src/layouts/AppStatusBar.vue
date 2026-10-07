<template>
  <footer class="app-statusbar">
    <span class="seg">{{ now }}</span>
    <span class="seg rate-seg">
      速率：
      <select class="rate-select" v-model.number="rate">
        <option v-for="v in rates" :key="v" :value="v">{{ v }}×</option>
      </select>
    </span>
    <span class="seg">学员：{{ session.user }}</span>
    <span class="seg">用时：{{ session.elapsedFmt }}</span>
    <span class="seg flex-grow" :class="{ 'alarm-active': hasActiveAlarm }">
      <template v-if="hasActiveAlarm">
        <span class="alarm-dot blink" :class="`L${activeAlarm!.level}`"></span>
        <span class="alarm-label">⚠ 报警 L{{ activeAlarm!.level }}</span>
        <span v-if="alarms.activeUnacked.length > 1" class="alarm-seq num">
          {{ (alarms.cycleIndex % alarms.activeUnacked.length) + 1 }}/{{ alarms.activeUnacked.length }}
        </span>
        <span class="alarm-message">{{ activeAlarm!.message }}</span>
      </template>
      <template v-else-if="lastAlarm">
        <span class="alarm-dot" :class="`L${lastAlarm.level}`"></span>
        最新报警：{{ lastAlarm.message }}
      </template>
      <template v-else>
        <span class="ok-dot"></span>
        系统正常
      </template>
    </span>
    <router-link
      to="/devices"
      class="seg device-connection"
      :class="device.connection.status"
      :title="connectionTooltip"
      :aria-label="connectionTooltip"
    >
      <span class="device-dot"></span>
      <span role="status" aria-live="polite">{{ connectionLabel }}</span>
    </router-link>
    <span class="seg">v2.0.5</span>
  </footer>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useSessionStore } from '@/stores/session';
import { useAlarmStore } from '@/stores/alarms';
import { useDeviceConfigStore } from '@/stores/deviceConfig';
import { simSetTimeScale } from '@/engine/simRuntime';

const session = useSessionStore();
const alarms = useAlarmStore();
const device = useDeviceConfigStore();

const connectionLabel = computed(() => {
  switch (device.connection.status) {
    case 'connected': return '设备连接成功';
    case 'failed': return device.connection.reconnecting ? '设备连接失败 · 正在重连' : '设备连接失败 · 自动重连';
    case 'connecting': return '设备连接中…';
    case 'unavailable': return '设备连接：仅桌面客户端';
    default: return '设备未连接';
  }
});
const connectionTooltip = computed(() => {
  const endpoint = `${device.config.ip}:${device.config.port}`;
  const retries = device.connection.retryCount ? `；已连续失败 ${device.connection.retryCount} 次，每 3 秒自动重连` : '';
  return `${connectionLabel.value} · ${endpoint}；${device.connection.message}${retries}。点击打开设备配置`;
});

const rates = [1, 2, 5, 8, 10];
const rate = ref<number>(session.timeScale);

watch(rate, v => {
  session.setTimeScale(v);
  simSetTimeScale(v);
});

const now = ref('');
let t: number | undefined;
function refresh() {
  const d = new Date();
  now.value =
    d.toISOString().slice(0, 10) + ' ' + d.toTimeString().slice(0, 8);
}
onMounted(() => {
  refresh();
  t = window.setInterval(refresh, 1000);
  device.startMonitoring();
});
onUnmounted(() => {
  if (t) clearInterval(t);
  device.stopMonitoring();
});

const lastAlarm = computed(() =>
  alarms.history.length ? alarms.history[alarms.history.length - 1] : null
);
const activeAlarm = computed(() => alarms.displayed);
const hasActiveAlarm = computed(() => activeAlarm.value !== null);
</script>

<style scoped>
.app-statusbar {
  height: var(--status-h);
  background: var(--c-bg-header);
  color: var(--c-text-inv);
  border-top: 1px solid var(--c-border);
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 18px;
  font-size: 12px;
  flex-shrink: 0;
}
.seg {
  white-space: nowrap;
}
.flex-grow {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
  color: #fff;
}
.device-connection {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  color: inherit;
  text-decoration: none;
  border-radius: 3px;
}
.device-connection:hover { text-decoration: underline; }
.device-connection:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
.device-dot { width: 8px; height: 8px; flex-shrink: 0; border-radius: 50%; background: #d0ceda; }
.device-connection.connected { color: #d2f2d1; }
.connected .device-dot { background: var(--c-ok); }
.device-connection.failed { color: #ffd3d3; }
.failed .device-dot { background: #ff7676; }
.connecting .device-dot { background: #f0ce72; }
.device-connection.unavailable { color: #d0ceda; }
.alarm-message { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.rate-seg {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.rate-select {
  background: var(--c-bg-panel);
  color: var(--c-text);
  border: 1px solid var(--c-border-soft);
  padding: 0 4px;
  font-size: 12px;
  height: 20px;
  outline: none;
  font-family: var(--font-num);
}
/* 活跃报警：整段放大 + 红底闪烁 */
.flex-grow.alarm-active {
  background: var(--c-accent);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 1px;
  margin: 0 -8px;
  padding: 0 12px;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  animation: sb-flash 0.9s steps(1) infinite;
}
.alarm-label {
  background: #fff;
  color: var(--c-accent);
  padding: 1px 8px;
  border-radius: 3px;
  font-size: 12px;
}
.alarm-seq {
  background: rgba(255, 255, 255, 0.25);
  padding: 1px 7px;
  border-radius: 9px;
  font-size: 11px;
}
.blink {
  animation: dot-blink 0.6s steps(1) infinite;
}
@keyframes sb-flash {
  0%, 100% { background: var(--c-accent); }
  50% { background: #8a1f1f; }
}
@keyframes dot-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.2; }
}
.alarm-dot,
.ok-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
  vertical-align: middle;
}
.alarm-dot.L1 {
  background: var(--c-alarm-1);
}
.alarm-dot.L2 {
  background: var(--c-alarm-2);
}
.alarm-dot.L3 {
  background: var(--c-alarm-3);
}
.ok-dot {
  background: var(--c-ok);
}
@media (max-width: 1200px) {
  .app-statusbar { height: auto; min-height: var(--status-h); flex-wrap: wrap; padding: 4px 8px; gap: 5px 12px; }
  .flex-grow { flex-basis: 140px; }
  .flex-grow.alarm-active { height: 24px; margin: 0; font-size: 12px; padding: 0 6px; }
}
</style>
