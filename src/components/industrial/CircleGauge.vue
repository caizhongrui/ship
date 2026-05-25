<template>
  <div class="circle-gauge" :style="{ width: size + 'px', height: size + 'px' }">
    <svg :viewBox="`0 0 ${size} ${size}`" :width="size" :height="size">
      <!-- 外圈 -->
      <circle
        :cx="cx"
        :cy="cy"
        :r="rOuter"
        fill="none"
        :stroke="colors.borderSoft"
        stroke-width="1"
      />
      <!-- 刻度 -->
      <g>
        <line
          v-for="i in tickCount"
          :key="i"
          :x1="tick(i - 1).x1"
          :y1="tick(i - 1).y1"
          :x2="tick(i - 1).x2"
          :y2="tick(i - 1).y2"
          :stroke="colors.text2"
          stroke-width="1"
        />
      </g>
      <!-- 进度弧 -->
      <path
        :d="arcPath"
        fill="none"
        :stroke="colors.accent"
        stroke-width="3"
        stroke-linecap="round"
      />
    </svg>
    <div class="cg-content">
      <div class="cg-label" v-if="label">{{ label }}</div>
      <div class="cg-value num">{{ formatted }}</div>
      <div class="cg-unit" v-if="unit">{{ unit }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    label?: string;
    value: number;
    min?: number;
    max?: number;
    unit?: string;
    size?: number;
    digits?: number;
    tickCount?: number;
  }>(),
  { min: 0, max: 100, size: 180, digits: 1, tickCount: 24 }
);

const colors = {
  text2: '#7A7790',
  borderSoft: '#5e5b78',
  accent: '#c73b3b'
};

const cx = computed(() => props.size / 2);
const cy = computed(() => props.size / 2);
const rOuter = computed(() => props.size / 2 - 6);
const rInner = computed(() => rOuter.value - 6);

// 刻度从底部 -120° 起，顺时针扫 240°
const startAngle = -210; // deg
const endAngle = 30;

function angleAt(idx: number, total: number) {
  const ratio = idx / (total - 1);
  return startAngle + (endAngle - startAngle) * ratio;
}
function rad(deg: number) {
  return (deg * Math.PI) / 180;
}
function point(angle: number, r: number) {
  return {
    x: cx.value + r * Math.cos(rad(angle)),
    y: cy.value + r * Math.sin(rad(angle))
  };
}
function tick(i: number) {
  const a = angleAt(i, props.tickCount);
  const major = i % 4 === 0;
  const r1 = rOuter.value;
  const r2 = rOuter.value - (major ? 8 : 4);
  const p1 = point(a, r1);
  const p2 = point(a, r2);
  return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
}

const ratio = computed(() => {
  const r = (props.value - props.min) / (props.max - props.min);
  return Math.max(0, Math.min(1, r));
});

const arcPath = computed(() => {
  const a0 = startAngle;
  const a1 = startAngle + (endAngle - startAngle) * ratio.value;
  const r = rInner.value;
  const p0 = point(a0, r);
  const p1 = point(a1, r);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y}`;
});

const formatted = computed(() => props.value.toFixed(props.digits));
</script>

<style scoped>
.circle-gauge {
  position: relative;
  display: inline-block;
}
.cg-content {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.cg-label {
  font-size: 12px;
  color: var(--c-text-2);
  letter-spacing: 2px;
}
.cg-value {
  font-size: 32px;
  font-weight: 700;
  color: var(--c-text);
  line-height: 1.2;
}
.cg-unit {
  font-size: 12px;
  color: var(--c-text-2);
}
</style>
