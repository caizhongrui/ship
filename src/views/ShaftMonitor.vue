<template>
  <div class="shaft page">
    <div class="grid">
      <!-- 顶部：轴系示意图（占两列，更大）-->
      <div class="ind-panel diagram">
        <div class="ind-panel__title">轴 系 示 意 图</div>
        <div class="ind-panel__body shaft-body">
          <div class="shaft-wrap">
            <img class="shaft-img" src="/zhouxi.jpg" alt="shaft system" />
            <!-- 中间轴承温度数值（填入底图蓝色温度框内）-->
            <div class="anno mb-temp num" :class="{ fault: bearingHigh }">
              {{ t.state.bearingTemp.toFixed(1) }}
            </div>
          </div>
        </div>
      </div>

      <!-- 下行左：关键参数 -->
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
          <ValueDisplay label="主机转速" :value="t.state.rpm" unit="rpm" />
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

      <!-- 下行右：温度趋势 -->
      <div class="ind-panel trend-box">
        <div class="ind-panel__title">轴 承 温 度 趋 势</div>
        <div class="ind-panel__body trend-body">
          <TrendChart :series="trendSeries" :y-min="20" :y-max="120" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import TrendChart from '@/components/industrial/TrendChart.vue';
import ValueDisplay from '@/components/industrial/ValueDisplay.vue';
import { useTelemetryStore } from '@/stores/telemetry';

const t = useTelemetryStore();
const bearingHigh = computed(() => t.state.bearingTemp > 65);

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
</script>

<style scoped>
.page {
  padding: 8px;
  height: 100%;
  overflow: hidden;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  /* minmax(0,...) 防止子内容把行撑高 */
  grid-template-rows: minmax(0, 1.1fr) minmax(0, 1fr);
  gap: 8px;
  height: 100%;
}
.diagram {
  grid-column: 1 / span 2;
  grid-row: 1;
}
.shaft-body {
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
}
/* 锁定容器为图片比例（3547/1182 ≈ 3.001），让标注百分比对得齐 */
.shaft-wrap {
  position: relative;
  aspect-ratio: 3547 / 1182;
  max-width: 100%;
  max-height: 100%;
  display: block;
}
.shaft-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

/* 标注层 */
.anno {
  position: absolute;
  pointer-events: none;
  transform: translate(-50%, -50%);
  text-align: center;
}

/* 中间轴承温度 — 填入"中间轴承温度"文字右侧的空白区域（℃ 内置） */
.anno.mb-temp {
  left: 82%;
  top: 45.5%;
  min-width: 56px;
  padding: 1px 6px;
  font-size: 14px;
  font-weight: 800;
  color: #ffffff;
  background: linear-gradient(180deg, #2c5db5 0%, #1e4a99 100%);
  border: 1px solid #1e4a99;
  border-radius: 3px;
  letter-spacing: 0.5px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
}
.anno.mb-temp::after {
  content: ' ℃';
  font-size: 11px;
  opacity: 0.9;
}
.anno.mb-temp.fault {
  background: linear-gradient(180deg, #d63030 0%, #b51e1e 100%);
  border-color: #b51e1e;
  box-shadow:
    0 0 12px rgba(255, 60, 60, 0.7),
    0 2px 4px rgba(0, 0, 0, 0.3);
  animation: pulseAnno 1.2s infinite;
}
@keyframes pulseAnno {
  0%, 100% { transform: translate(-50%, -50%) scale(1); }
  50% { transform: translate(-50%, -50%) scale(1.05); }
}

/* 关键参数 */
.kv-panel {
  grid-column: 1;
  grid-row: 2;
}
.kv-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(2, 1fr);
  gap: 12px;
  align-items: center;
  padding: 12px;
}

/* 温度趋势 */
.trend-box {
  grid-column: 2;
  grid-row: 2;
}
.trend-body {
  padding: 0;
}
</style>
