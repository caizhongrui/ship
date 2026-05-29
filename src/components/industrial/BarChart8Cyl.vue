<template>
  <div class="cyl-bar-chart">
    <!-- 淡化的发动机底图 -->
    <img class="engine-bg" src="/paiqi.png" alt="engine" />

    <!-- 绘图区（柱子与阈值线共用同一坐标系） -->
    <div class="plot">
      <!-- 阈值红线 -->
      <div
        v-if="threshold !== undefined"
        class="threshold-line"
        :style="{ bottom: thresholdBottomPct }"
      >
        <span class="threshold-label num">{{ threshold }}℃</span>
      </div>

      <!-- 8 根柱子 -->
      <div class="cols">
        <div v-for="(v, i) in values" :key="i" class="bar-col">
          <div
            class="bar"
            :class="levelClass(v)"
            :style="{ height: heightPct(v) }"
          >
            <span class="bar-num num" :class="levelClass(v)">{{
              v.toFixed(1)
            }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 缸号标签行 -->
    <div class="labels">
      <span v-for="(v, i) in values" :key="i">{{ i + 1 }}#</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    values: number[];
    min?: number;
    max?: number;
    warn?: number;
    danger?: number;
    threshold?: number;
  }>(),
  { min: 0, max: 500, warn: 380, danger: 390 }
);

function heightPct(v: number) {
  const r = (v - props.min) / (props.max - props.min);
  return `${Math.max(0, Math.min(1, r)) * 100}%`;
}
function levelClass(v: number) {
  if (v >= props.danger) return 'danger';
  if (v >= props.warn) return 'warn';
  return 'normal';
}
const thresholdBottomPct = computed(() => {
  if (props.threshold === undefined) return '0%';
  const r = (props.threshold - props.min) / (props.max - props.min);
  return `${Math.max(0, Math.min(1, r)) * 100}%`;
});
</script>

<style scoped>
.cyl-bar-chart {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--c-bg-panel);
  display: flex;
  flex-direction: column;
}

/* 发动机底图：淡化 */
.engine-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
  opacity: 0.16;
  filter: grayscale(0.2) brightness(1.1);
  pointer-events: none;
}

/* 绘图区——柱子和阈值线都以此为参考系 */
.plot {
  position: relative;
  flex: 1;
  min-height: 0;
  margin: 24px 16px 4px; /* 顶部留出数值标注空间 */
}

/* 阈值线 */
.threshold-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 0;
  border-top: 1.5px dashed var(--c-accent);
  z-index: 3;
}
.threshold-label {
  position: absolute;
  left: -6px;
  top: -16px;
  color: var(--c-accent);
  font-size: 12px;
  font-weight: 700;
  background: var(--c-bg-panel);
  padding: 0 4px;
  border: 1px solid var(--c-accent);
  border-radius: 2px;
}

/* 柱子列：绝对铺满绘图区，与阈值同坐标系 */
.cols {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 10px;
  align-items: end;
}
.bar-col {
  height: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.bar {
  width: 62%;
  position: relative;
  border: 1px solid var(--c-border-soft);
  border-bottom: none;
  transition: height 0.3s ease, background 0.3s;
  z-index: 2;
}
.bar.normal {
  background: var(--c-info);
}
.bar.warn {
  background: var(--c-warn);
}
.bar.danger {
  background: var(--c-accent);
}
.bar-num {
  position: absolute;
  top: -18px;
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  font-size: 12px;
  font-weight: 700;
  color: var(--c-text);
}
.bar-num.warn {
  color: #a87a00;
}
.bar-num.danger {
  color: var(--c-accent);
}

/* 缸号标签 */
.labels {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 10px;
  padding: 0 16px 8px;
  flex-shrink: 0;
}
.labels span {
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  color: var(--c-accent);
  font-family: var(--font-num);
}
</style>
