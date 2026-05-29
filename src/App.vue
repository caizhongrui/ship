<template>
  <LoginView v-if="!session.authenticated" />
  <div v-else class="app-shell">
    <AppHeader />

    <!-- 全局报警横幅（所有页面可见，红色闪烁；多条自动轮播） -->
    <transition name="ga-slide">
      <div
        v-if="activeAlarm"
        class="global-alarm"
        @click="ackAll"
      >
        <span class="ga-icon">⚠</span>
        <span class="ga-level">报警 L{{ activeAlarm.level }}</span>
        <span v-if="alarms.activeUnacked.length > 1" class="ga-seq num">
          {{ (alarms.cycleIndex % alarms.activeUnacked.length) + 1 }}/{{ alarms.activeUnacked.length }}
        </span>
        <span class="ga-text">{{ activeAlarm.message }}</span>
        <span class="ga-meta num">{{ activeAlarm.tag }} = {{ activeAlarm.value }}</span>
        <span class="ga-ack">点击确认全部 ✕</span>
      </div>
    </transition>

    <div class="app-body">
      <AppSidebar />
      <main class="app-main">
        <router-view v-slot="{ Component }">
          <component :is="Component" />
        </router-view>
      </main>
    </div>
    <AppStatusBar />
  </div>
</template>

<script setup lang="ts">
import { watch, computed, onMounted, onUnmounted } from 'vue';
import AppHeader from '@/layouts/AppHeader.vue';
import AppSidebar from '@/layouts/AppSidebar.vue';
import AppStatusBar from '@/layouts/AppStatusBar.vue';
import LoginView from '@/views/LoginView.vue';
import { useSessionStore } from '@/stores/session';
import { useAlarmStore } from '@/stores/alarms';
import { useTelemetryStore } from '@/stores/telemetry';
import { playAlarmBeep } from '@/utils/alarmSound';
import { updateEngineSound, stopEngineSound } from '@/utils/engineSound';
import {
  bootSimRuntime,
  simSetTimeScale,
  simSetMode
} from '@/engine/simRuntime';

const session = useSessionStore();
const alarms = useAlarmStore();
const telemetry = useTelemetryStore();

// 主机运行背景音：随运行状态与转速变化
watch(
  () => [session.running, telemetry.state.rpm] as [boolean, number],
  ([running, rpm]) => updateEngineSound(running, rpm)
);
// 退出登录时停止引擎声
watch(
  () => session.authenticated,
  authed => {
    if (!authed) stopEngineSound();
  }
);

// 当前轮播展示的活跃报警（驱动全局横幅）
const activeAlarm = computed(() => alarms.displayed);

function ackAll() {
  alarms.ackAll();
}

// 多条活跃报警轮播（每 2.5 秒切换）
let cycleTimer: number | undefined;
onMounted(() => {
  cycleTimer = window.setInterval(() => alarms.cycle(), 2500);
});
onUnmounted(() => cycleTimer && clearInterval(cycleTimer));

// 新报警触发音效
watch(
  () => alarms.history.length,
  (n, old) => {
    if (n > old) playAlarmBeep(3);
  }
);

// 登录后才初始化仿真运行时
watch(
  () => session.authenticated,
  authed => {
    if (authed) {
      bootSimRuntime();
      simSetTimeScale(session.timeScale);
      simSetMode(session.mode);
    }
  }
);

// 速率/模式联动
watch(
  () => session.timeScale,
  v => simSetTimeScale(v)
);
watch(
  () => session.mode,
  v => simSetMode(v)
);
</script>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  background: var(--c-bg);
  color: var(--c-text);
}
.app-body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.app-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  background: var(--c-bg);
}

/* === 全局报警横幅 === */
.global-alarm {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 20px;
  background: var(--c-accent);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 1px;
  cursor: pointer;
  flex-shrink: 0;
  border-bottom: 2px solid #fff;
  animation: ga-flash 0.9s steps(1) infinite;
  z-index: 50;
}
.ga-icon {
  font-size: 22px;
  line-height: 1;
}
.ga-level {
  background: #fff;
  color: var(--c-accent);
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 13px;
}
.ga-seq {
  background: rgba(255, 255, 255, 0.25);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 700;
}
.ga-text {
  flex-shrink: 0;
}
.ga-meta {
  flex: 1;
  font-size: 13px;
  font-weight: 400;
  opacity: 0.92;
}
.ga-ack {
  font-size: 12px;
  font-weight: 400;
  border: 1px solid rgba(255, 255, 255, 0.7);
  padding: 3px 10px;
  border-radius: 3px;
}
@keyframes ga-flash {
  0%,
  100% {
    background: var(--c-accent);
  }
  50% {
    background: #8a1f1f;
  }
}
.ga-slide-enter-active,
.ga-slide-leave-active {
  transition: all 0.25s ease;
}
.ga-slide-enter-from,
.ga-slide-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
</style>
