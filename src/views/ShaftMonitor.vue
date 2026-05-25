<template>
  <div class="shaft page">
    <div class="grid">
      <!-- 左上：轴系示意图 -->
      <div class="ind-panel diagram">
        <div class="ind-panel__title">轴 系 示 意 图</div>
        <div class="ind-panel__body">
          <svg viewBox="0 0 600 180" class="shaft-svg">
            <!-- 主机 -->
            <rect x="20" y="50" width="120" height="80" stroke="#5e5b78" fill="#dedce4" />
            <text x="80" y="95" text-anchor="middle" fill="#1f1e33" font-size="13">主机</text>
            <!-- 飞轮 -->
            <circle cx="160" cy="90" r="22" stroke="#5e5b78" fill="#dedce4" />
            <!-- 中间轴 -->
            <line x1="182" y1="90" x2="380" y2="90" stroke="#5e5b78" stroke-width="6" />
            <!-- 中间轴承 -->
            <rect
              x="260"
              y="68"
              width="44"
              height="44"
              stroke="#5e5b78"
              fill="#b6b4c2"
              :class="{ 'fault-flash': bearingHigh }"
            />
            <text x="282" y="60" text-anchor="middle" fill="#FFD000" font-size="11">中间轴承</text>
            <text
              x="282"
              y="135"
              text-anchor="middle"
              :fill="bearingHigh ? '#FF2D2D' : '#22CC55'"
              font-size="13"
              class="num"
            >
              {{ t.state.bearingTemp.toFixed(1) }}℃
            </text>
            <!-- 尾轴 -->
            <line x1="380" y1="90" x2="540" y2="90" stroke="#5e5b78" stroke-width="6" />
            <rect x="395" y="78" width="32" height="24" stroke="#5e5b78" fill="#dedce4" />
            <text x="411" y="68" text-anchor="middle" fill="#7A8699" font-size="10">尾轴承</text>
            <!-- 螺旋桨 -->
            <ellipse cx="555" cy="90" rx="14" ry="40" stroke="#5e5b78" fill="#dedce4" />
            <text x="555" y="160" text-anchor="middle" fill="#1f1e33" font-size="11">螺旋桨</text>
          </svg>
        </div>
      </div>

      <!-- 右上：关键参数 -->
      <div class="ind-panel kv-panel">
        <div class="ind-panel__title">轴 系 关 键 参 数</div>
        <div class="ind-panel__body kv-grid">
          <ValueDisplay
            label="中间轴承温度"
            :value="t.state.bearingTemp"
            unit="℃"
            :accent="bearingHigh"
          />
          <ValueDisplay
            label="轴系振动 RMS"
            :value="t.state.shaftVibration"
            unit="mm/s"
          />
          <ValueDisplay
            label="主机转速"
            :value="t.state.rpm"
            unit="rpm"
          />
          <ValueDisplay
            label="螺旋桨转速"
            :value="t.state.rpm * 0.9875"
            unit="rpm"
          />
          <ValueDisplay
            label="滑油压力"
            :value="t.state.lubeOilPressure"
            unit="bar"
            :digits="2"
          />
          <ValueDisplay
            label="滑油温度"
            :value="t.state.lubeOilTemp"
            unit="℃"
          />
        </div>
      </div>

      <!-- 左下：温度趋势 -->
      <div class="ind-panel trend-box">
        <div class="ind-panel__title">轴 承 温 度 趋 势</div>
        <div class="ind-panel__body trend-body">
          <TrendChart :series="trendSeries" :y-min="20" :y-max="120" />
        </div>
      </div>

      <!-- 右下：塞尺测量入口 -->
      <div class="feeler-area">
        <FeelerGauge ref="feelerRef" />
        <div class="feeler-actions">
          <button class="big-btn" :disabled="!canConfirm" @click="confirmFix">
            完成调整 / 重启主机
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import TrendChart from '@/components/industrial/TrendChart.vue';
import ValueDisplay from '@/components/industrial/ValueDisplay.vue';
import FeelerGauge from '@/components/controls/FeelerGauge.vue';
import { useTelemetryStore } from '@/stores/telemetry';
import { simClearFault } from '@/engine/simRuntime';

const t = useTelemetryStore();
const bearingHigh = computed(() => t.state.bearingTemp > 75);

const trendSeries = computed(() => [
  {
    name: '中间轴承温度 ℃',
    color: '#FF2D2D',
    data: t.history.map(h => [h.monoT, h.bearingTemp] as [number, number])
  },
  {
    name: '滑油温度 ℃',
    color: '#33A8FF',
    data: t.history.map(h => [h.monoT, h.lubeOilTemp] as [number, number])
  }
]);

const feelerRef = ref<InstanceType<typeof FeelerGauge> | null>(null);
const canConfirm = computed(
  () => feelerRef.value?.allMeasured && feelerRef.value?.passed
);

function confirmFix() {
  simClearFault();
}
</script>

<style scoped>
.page {
  padding: 8px;
  height: 100%;
  overflow: auto;
}
.grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  grid-template-rows: 220px 220px auto;
  gap: 8px;
  min-height: 100%;
}
.diagram {
  grid-column: 1 / span 2;
  grid-row: 1 / span 1;
}
.shaft-svg {
  width: 100%;
  height: 100%;
}
.fault-flash {
  animation: flash 1s infinite;
}
@keyframes flash {
  0%, 100% { fill: #b6b4c2; stroke: #5e5b78; }
  50% { fill: #c73b3b; stroke: #c73b3b; }
}
.kv-panel {
  grid-column: 1 / span 2;
}
.kv-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
  align-items: center;
  padding: 16px;
}
.trend-box {
  grid-column: 1 / span 1;
  height: 280px;
}
.trend-body {
  padding: 0;
}
.feeler-area {
  grid-column: 2 / span 1;
}
.feeler-actions {
  margin-top: 8px;
  text-align: center;
}
.big-btn {
  background: var(--c-warn);
  color: #000;
  border: none;
  padding: 8px 24px;
  font-size: 14px;
  letter-spacing: 4px;
  cursor: pointer;
  font-weight: 700;
}
.big-btn:disabled {
  background: #555;
  color: #aaa;
  cursor: not-allowed;
}
</style>
