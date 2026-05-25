<template>
  <div class="telegraph">
    <div class="tg-title">车　　钟</div>

    <!-- 模式切换 -->
    <div class="tg-mode">
      <button
        class="mode-btn"
        :class="{ 'is-on': session.mode === 'AUTO' }"
        @click="setMode('AUTO')"
      >
        自　动
      </button>
      <button
        class="mode-btn"
        :class="{ 'is-on': session.mode === 'MANUAL' }"
        @click="setMode('MANUAL')"
      >
        手　动
      </button>
    </div>

    <!-- 开始 / 停止 / 重置 -->
    <div class="tg-ctrl">
      <button
        v-if="!session.started || !session.running"
        class="ctrl-btn start"
        @click="onStart"
      >
        ▶ {{ session.started ? '继续' : '开始' }}
      </button>
      <button v-else class="ctrl-btn pause" @click="onPause">■ 停止</button>
      <button
        class="ctrl-btn reset"
        :disabled="!session.started"
        @click="onReset"
      >
        ⟲ 重置
      </button>
    </div>

    <!-- 加速 -->
    <button
      class="tg-btn"
      :disabled="!manualEnabled || !canUp"
      @click="stepUp"
    >
      <span class="arrow">▲</span>
      <span>AHEAD</span>
    </button>

    <!-- 6 档刻度 -->
    <div class="tg-positions" :class="{ 'is-auto': session.mode === 'AUTO' }">
      <div
        v-for="p in positionsTopDown"
        :key="p.code"
        class="tg-pos"
        :class="{ 'is-active': p.code === session.telegraph, 'is-locked': !manualEnabled }"
        :style="
          p.code === session.telegraph
            ? {
                background: POS_COLOR[p.code],
                borderColor: POS_COLOR[p.code],
                boxShadow: `0 0 8px ${POS_COLOR[p.code]}aa`
              }
            : { borderLeft: `3px solid ${POS_COLOR[p.code]}` }
        "
        @click="onPosClick(p.code)"
      >
        <span class="tg-pos-name">{{ p.name }}</span>
        <span class="tg-pos-rpm num">{{ p.rpm }}</span>
      </div>
    </div>

    <!-- 减速 -->
    <button
      class="tg-btn"
      :disabled="!manualEnabled || !canDown"
      @click="stepDown"
    >
      <span>ASTERN</span>
      <span class="arrow">▼</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useSessionStore } from '@/stores/session';
import { useTelemetryStore } from '@/stores/telemetry';
import { useAlarmStore } from '@/stores/alarms';
import {
  simSetTelegraph,
  simStart,
  simShutdown,
  simReset,
  simSetMode
} from '@/engine/simRuntime';
import type { TelegraphPosition } from '@/types';
import type { SimMode } from '@/stores/session';

const session = useSessionStore();
const telemetry = useTelemetryStore();
const alarms = useAlarmStore();

interface Pos {
  code: TelegraphPosition;
  name: string;
  en: string;
  rpm: number;
}

const positions: Pos[] = [
  { code: 'STOP', name: 'STOP', en: 'STOP', rpm: 0 },
  { code: 'DEAD_SLOW_AHEAD', name: 'DEAD SLOW', en: 'DEAD SLOW AHEAD', rpm: 25 },
  { code: 'SLOW_AHEAD', name: 'SLOW', en: 'SLOW AHEAD', rpm: 38 },
  { code: 'HALF_AHEAD', name: 'HALF', en: 'HALF AHEAD', rpm: 52 },
  { code: 'FULL_AHEAD', name: 'FULL', en: 'FULL AHEAD', rpm: 63 },
  { code: 'NAV_FULL', name: 'NAV FULL', en: 'NAV FULL AHEAD', rpm: 80 }
];

const POS_COLOR: Record<TelegraphPosition, string> = {
  STOP: '#7A7790',
  DEAD_SLOW_AHEAD: '#7ab47c',
  SLOW_AHEAD: '#3fb5b0',
  HALF_AHEAD: '#5c87cf',
  FULL_AHEAD: '#d6883a',
  NAV_FULL: '#c73b3b'
};

const positionsTopDown = computed(() => [...positions].reverse());
const currentIndex = computed(() =>
  positions.findIndex(p => p.code === session.telegraph)
);
const canUp = computed(() => currentIndex.value < positions.length - 1);
const canDown = computed(() => currentIndex.value > 0);

// 仅当 MANUAL + 已开始 时车钟可交互
const manualEnabled = computed(
  () => session.mode === 'MANUAL' && session.started
);

function applyManual(code: TelegraphPosition) {
  session.setTelegraph(code);
  simSetTelegraph(code);
}
function stepUp() {
  if (canUp.value && manualEnabled.value)
    applyManual(positions[currentIndex.value + 1].code);
}
function stepDown() {
  if (canDown.value && manualEnabled.value)
    applyManual(positions[currentIndex.value - 1].code);
}
function onPosClick(code: TelegraphPosition) {
  if (manualEnabled.value) applyManual(code);
}

function setMode(m: SimMode) {
  session.setMode(m);
  simSetMode(m);
}

function onStart() {
  if (!session.started) {
    // 首次开始：重置所有状态再开始
    telemetry.reset();
    alarms.reset();
    simReset();
    session.startSim();
  } else {
    // 暂停后继续
    session.running = true;
  }
  simStart();
}

function onPause() {
  // 停止：设备状态强制回 STOP（rpm/load/power 归 0），仿真冻结
  session.stopSim();
  session.setTelegraph('STOP');
  simShutdown();
}

function onReset() {
  session.resetSim();
  telemetry.reset();
  alarms.reset();
  simReset();
}
</script>

<style scoped>
.telegraph {
  background: var(--c-bg-panel);
  border: 1px solid var(--c-border-soft);
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
}

.tg-title {
  text-align: center;
  font-size: 12px;
  letter-spacing: 6px;
  color: var(--c-text);
  border-bottom: 1px solid var(--c-border-soft);
  padding-bottom: 4px;
  margin-bottom: 2px;
}

.tg-mode {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}
.mode-btn {
  background: var(--c-bg-panel-alt);
  border: 1px solid var(--c-border-soft);
  color: var(--c-text);
  padding: 4px 0;
  font-size: 11px;
  letter-spacing: 2px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.12s;
}
.mode-btn:hover {
  background: var(--c-bg-active);
}
.mode-btn.is-on {
  background: var(--c-bg-header);
  border-color: var(--c-bg-header);
  color: #fff;
}

.tg-ctrl {
  display: flex;
  gap: 4px;
}
.ctrl-btn {
  flex: 1;
  border: 1px solid var(--c-border-soft);
  background: var(--c-bg-panel-alt);
  color: var(--c-text);
  padding: 5px 0;
  font-size: 11px;
  letter-spacing: 1px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.12s;
}
.ctrl-btn:hover:not(:disabled) {
  filter: brightness(1.1);
}
.ctrl-btn.start {
  background: var(--c-ok);
  border-color: var(--c-ok);
  color: #fff;
}
.ctrl-btn.pause {
  background: var(--c-warn);
  border-color: var(--c-warn);
  color: #000;
}
.ctrl-btn.reset {
  background: var(--c-bg-panel-alt);
}
.ctrl-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.tg-btn {
  background: var(--c-bg-panel-alt);
  border: 1px solid var(--c-border-soft);
  color: var(--c-text);
  padding: 4px 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 12px;
  letter-spacing: 4px;
  user-select: none;
  transition: all 0.12s;
}
.tg-btn:hover:not(:disabled) {
  background: var(--c-accent);
  border-color: var(--c-accent);
  color: #fff;
}
.tg-btn:active:not(:disabled) {
  transform: translateY(1px);
}
.tg-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.tg-btn .arrow {
  font-size: 14px;
  line-height: 1;
}

.tg-positions {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.tg-positions.is-auto .tg-pos:not(.is-active) {
  opacity: 0.6;
}
.tg-pos {
  background: var(--c-bg-panel-alt);
  border: 1px solid var(--c-border-soft);
  padding: 4px 8px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: all 0.15s;
  font-size: 12px;
}
.tg-pos.is-locked {
  cursor: not-allowed;
}
.tg-pos:not(.is-locked):hover {
  filter: brightness(1.4);
}
.tg-pos.is-active {
  color: #fff;
  font-weight: 600;
}
.tg-pos-name {
  letter-spacing: 1px;
}
.tg-pos-rpm {
  color: var(--c-text-2);
  font-size: 11px;
}
.tg-pos.is-active .tg-pos-rpm {
  color: rgba(255, 255, 255, 0.9);
}
</style>
