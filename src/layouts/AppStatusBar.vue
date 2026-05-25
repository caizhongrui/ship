<template>
  <footer class="app-statusbar">
    <span class="seg">{{ now }}</span>
    <span class="seg">场景：{{ session.scenario }}</span>
    <span class="seg rate-seg">
      速率：
      <select class="rate-select" v-model.number="rate">
        <option v-for="v in rates" :key="v" :value="v">{{ v }}×</option>
      </select>
    </span>
    <span class="seg">学员：{{ session.user }}</span>
    <span class="seg">用时：{{ session.elapsedFmt }}</span>
    <span class="seg flex-grow">
      <template v-if="lastAlarm">
        <span class="alarm-dot" :class="`L${lastAlarm.level}`"></span>
        最新报警：{{ lastAlarm.message }}
      </template>
      <template v-else>
        <span class="ok-dot"></span>
        系统正常
      </template>
    </span>
    <span class="seg">v0.1.0</span>
  </footer>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useSessionStore } from '@/stores/session';
import { useAlarmStore } from '@/stores/alarms';
import { simSetTimeScale } from '@/engine/simRuntime';

const session = useSessionStore();
const alarms = useAlarmStore();

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
});
onUnmounted(() => t && clearInterval(t));

const lastAlarm = computed(() =>
  alarms.history.length ? alarms.history[alarms.history.length - 1] : null
);
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
  text-align: left;
  color: #fff;
}
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
.flex-grow {
  flex: 1;
  text-align: left;
  color: #fff;
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
</style>
