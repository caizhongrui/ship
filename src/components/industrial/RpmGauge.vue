<template>
  <div class="rpm-gauge" :style="{ width: size + 'px', height: size + 'px' }">
    <svg :viewBox="`0 0 ${size} ${size}`" :width="size" :height="size">
      <!-- 外圈 -->
      <circle
        :cx="cx"
        :cy="cy"
        :r="rOuter"
        fill="#ffffff"
        stroke="#5e5b78"
        stroke-width="2"
      />

      <!-- 刻度 + 数字标签 -->
      <g v-for="tk in ticks" :key="tk.value + '-' + tk.major">
        <line
          :x1="tk.x1"
          :y1="tk.y1"
          :x2="tk.x2"
          :y2="tk.y2"
          :stroke="tk.value < 0 ? '#c73b3b' : '#1f1e33'"
          :stroke-width="tk.major ? 1.8 : 1"
        />
        <text
          v-if="tk.major && tk.value !== 0"
          :x="tk.lx"
          :y="tk.ly"
          :fill="tk.value < 0 ? '#c73b3b' : '#1f1e33'"
          :font-size="size * 0.085"
          font-weight="700"
          text-anchor="middle"
          dominant-baseline="middle"
          font-family="JetBrains Mono, monospace"
        >
          {{ Math.abs(tk.value) }}
        </text>
      </g>

      <!-- 顶部 0 -->
      <text
        :x="cx"
        :y="cy - rOuter + size * 0.13"
        fill="#1f1e33"
        :font-size="size * 0.075"
        text-anchor="middle"
        font-weight="700"
        font-family="JetBrains Mono, monospace"
      >0</text>

      <!-- rpm 单位（底部居中） -->
      <text
        :x="cx"
        :y="cy + rOuter * 0.92"
        fill="#1f1e33"
        :font-size="size * 0.085"
        text-anchor="middle"
        font-weight="600"
      >rpm</text>

      <!-- ASTERN / AHEAD 标签（向内收并缩小，避免文字超出表盘） -->
      <text
        :x="cx - rOuter * 0.74"
        :y="cy + rOuter * 0.96"
        fill="#c73b3b"
        :font-size="size * 0.058"
        text-anchor="middle"
        font-weight="700"
      >ASTERN</text>
      <text
        :x="cx + rOuter * 0.74"
        :y="cy + rOuter * 0.96"
        fill="#1f1e33"
        :font-size="size * 0.058"
        text-anchor="middle"
        font-weight="700"
      >AHEAD</text>

      <!-- 指针 -->
      <g :style="{ transition: 'transform 0.4s cubic-bezier(0.4, 1.3, 0.6, 1)' }"
         :transform="`rotate(${pointerAngleDeg} ${cx} ${cy})`">
        <line
          :x1="cx"
          :y1="cy + size * 0.04"
          :x2="cx"
          :y2="cy - rOuter * 0.78"
          stroke="#1f1e33"
          :stroke-width="size * 0.022"
          stroke-linecap="round"
        />
        <!-- 指针尖端 -->
        <polygon
          :points="`${cx - size*0.022},${cy - rOuter*0.78 + size*0.04} ${cx + size*0.022},${cy - rOuter*0.78 + size*0.04} ${cx},${cy - rOuter*0.85}`"
          fill="#1f1e33"
        />
      </g>

      <!-- 中心轴帽 -->
      <circle
        :cx="cx"
        :cy="cy"
        :r="size * 0.05"
        fill="#1f1e33"
        stroke="#fff"
        stroke-width="1"
      />
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    value: number;
    max?: number;
    size?: number;
    direction?: 'AHEAD' | 'ASTERN';
  }>(),
  { max: 80, size: 180, direction: 'AHEAD' }
);

const cx = computed(() => props.size / 2);
const cy = computed(() => props.size / 2);
const rOuter = computed(() => props.size / 2 - 6);

const SWEEP_DEG = 120; // 0 → ±max 跨 120 度（总 240 度），底部留出 ASTERN/AHEAD 文字空间

// rpm 到指针角度：AHEAD 右偏正，ASTERN 左偏负（值始终用正数）
const pointerAngleDeg = computed(() => {
  const v = Math.max(0, Math.min(props.max, Math.abs(props.value)));
  const sign = props.direction === 'ASTERN' ? -1 : 1;
  return sign * (v / props.max) * SWEEP_DEG;
});

interface Tick {
  value: number;
  major: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  lx: number;
  ly: number;
}

function pointAt(angleDeg: number, r: number) {
  // 12 点为 0°，顺时针正向（与指针定义一致）
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx.value + r * Math.cos(a), y: cy.value + r * Math.sin(a) };
}

const ticks = computed<Tick[]>(() => {
  const arr: Tick[] = [];
  // 每 10 rpm 一档主刻度，每 5 rpm 一档副刻度（-80..+80）
  for (let v = -props.max; v <= props.max; v += 5) {
    const major = v % 20 === 0; // 主：每 20
    const angle = (v / props.max) * SWEEP_DEG;
    const rIn = major ? rOuter.value - props.size * 0.08 : rOuter.value - props.size * 0.04;
    const rOut = rOuter.value - 2;
    const pIn = pointAt(angle, rIn);
    const pOut = pointAt(angle, rOut);
    const pLab = pointAt(angle, rOuter.value - props.size * 0.15);
    arr.push({
      value: v,
      major,
      x1: pIn.x,
      y1: pIn.y,
      x2: pOut.x,
      y2: pOut.y,
      lx: pLab.x,
      ly: pLab.y
    });
  }
  return arr;
});
</script>

<style scoped>
.rpm-gauge {
  position: relative;
  display: inline-block;
}
</style>
