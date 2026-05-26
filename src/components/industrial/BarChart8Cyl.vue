<template>
  <div class="cyl-engine">
    <!-- 顶部温度读数条带 -->
    <div class="readout-strip">
      <div
        v-for="(v, i) in values"
        :key="i"
        class="readout"
        :class="levelClass(v)"
        :style="{ left: cylPositions[i] + '%' }"
      >
        <span class="r-label">{{ i + 1 }}#</span>
        <span class="r-temp num">{{ v.toFixed(1) }}</span>
        <span class="r-unit">℃</span>
      </div>
    </div>

    <!-- 8 条引线 -->
    <svg class="lines" preserveAspectRatio="none" viewBox="0 0 100 30">
      <line
        v-for="(v, i) in values"
        :key="i"
        :x1="cylPositions[i]"
        :y1="0"
        :x2="cylPositions[i]"
        :y2="30"
        :class="levelClass(v)"
      />
    </svg>

    <!-- 主机底图 -->
    <div class="engine-bg-wrap">
      <img class="engine-bg" src="/paiqi.png" alt="engine" />
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    values: number[];
    min?: number;
    max?: number;
    warn?: number;
    danger?: number;
    threshold?: number;
  }>(),
  { min: 0, max: 500, warn: 425, danger: 450 }
);

// 8 个气缸头在底图中的 x 位置（百分比，按图实测）
const cylPositions = [16.5, 26.5, 36.5, 46.5, 56.5, 66.5, 76.5, 86.5];

function levelClass(v: number) {
  if (v >= props.danger) return 'danger';
  if (v >= props.warn) return 'warn';
  return 'normal';
}
</script>

<style scoped>
.cyl-engine {
  position: relative;
  width: 100%;
  height: 100%;
  background: var(--c-bg-panel);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* === 顶部读数条 === */
.readout-strip {
  position: relative;
  height: 56px;
  flex-shrink: 0;
  background: linear-gradient(to bottom, var(--c-bg-panel-alt), var(--c-bg-panel));
  border-bottom: 1px solid var(--c-border-soft);
}
.readout {
  position: absolute;
  top: 6px;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 56px;
  padding: 4px 6px 5px;
  border-radius: 3px;
  background: #fff;
  border: 1px solid var(--c-border-soft);
  transition: all 0.25s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  z-index: 2;
}
.r-label {
  font-size: 10px;
  color: var(--c-text-muted);
  letter-spacing: 0.5px;
  line-height: 1;
  font-weight: 600;
}
.r-temp {
  font-size: 15px;
  font-weight: 700;
  color: var(--c-text);
  line-height: 1.1;
  margin-top: 1px;
}
.r-unit {
  font-size: 9px;
  color: var(--c-text-muted);
  line-height: 1;
}

/* 状态：警告 */
.readout.warn {
  background: #fff5d6;
  border-color: var(--c-warn);
}
.readout.warn .r-temp {
  color: #a87a00;
}
/* 状态：危险 */
.readout.danger {
  background: var(--c-accent);
  border-color: var(--c-accent);
  box-shadow:
    0 0 12px rgba(199, 59, 59, 0.65),
    0 2px 4px rgba(0, 0, 0, 0.2);
  animation: pulse 1.4s ease-in-out infinite;
}
.readout.danger .r-label,
.readout.danger .r-unit {
  color: rgba(255, 255, 255, 0.78);
}
.readout.danger .r-temp {
  color: #fff;
}
@keyframes pulse {
  0%,
  100% {
    transform: translateX(-50%) scale(1);
  }
  50% {
    transform: translateX(-50%) scale(1.06);
  }
}

.threshold-tag {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 10px;
  color: var(--c-accent);
  background: rgba(199, 59, 59, 0.08);
  border: 1px solid rgba(199, 59, 59, 0.35);
  padding: 2px 6px;
  border-radius: 2px;
  letter-spacing: 1px;
  font-weight: 600;
}

/* === 引线 === */
.lines {
  width: 100%;
  height: 22px;
  flex-shrink: 0;
}
.lines line {
  stroke-width: 1;
  stroke-dasharray: 2 2;
  stroke: var(--c-border-soft);
  transition: stroke 0.25s;
}
.lines line.warn {
  stroke: var(--c-warn);
  stroke-dasharray: none;
}
.lines line.danger {
  stroke: var(--c-accent);
  stroke-dasharray: none;
  stroke-width: 1.5;
}

/* === 引擎底图 === */
.engine-bg-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  overflow: hidden;
}
.engine-bg {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: top center;
  filter: brightness(1.08) saturate(0.92);
}
</style>
