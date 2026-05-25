<template>
  <div class="feeler">
    <div class="feeler-title">中间轴承 0.05mm 塞尺测量</div>

    <div class="feeler-body">
      <!-- 左：轴承 4 点示意图 -->
      <div class="bearing-svg">
        <svg viewBox="0 0 220 220" width="220" height="220">
          <!-- 轴承外圈 -->
          <circle cx="110" cy="110" r="92" fill="none" stroke="#5e5b78" stroke-width="2" />
          <!-- 轴 -->
          <circle cx="110" cy="110" r="50" fill="#dedce4" stroke="#5e5b78" stroke-width="1.5" />
          <text x="110" y="115" text-anchor="middle" fill="#7A8699" font-size="10">轴</text>
          <!-- 4 个测点 -->
          <g v-for="(p, i) in points" :key="i">
            <circle
              :cx="p.x"
              :cy="p.y"
              r="9"
              :fill="p.measured ? '#22CC55' : '#FF2D2D'"
              :stroke="current === i ? '#ffffff' : 'transparent'"
              stroke-width="2"
              class="point"
              @click="select(i)"
            />
            <text
              :x="p.lx"
              :y="p.ly"
              text-anchor="middle"
              fill="#1f1e33"
              font-size="11"
            >
              {{ p.label }}
            </text>
          </g>
        </svg>
      </div>

      <!-- 右：测量面板 -->
      <div class="feeler-panel">
        <div v-if="current === -1" class="feeler-tip">
          请点击左侧 <span class="dot-red">●</span> 红色测点开始测量
        </div>
        <template v-else>
          <div class="feeler-row">
            <span class="lbl">当前测点：</span>
            <span class="val">{{ points[current].label }}</span>
          </div>
          <div class="feeler-row">
            <span class="lbl">塞尺插入深度：</span>
            <span class="val num">{{ depth.toFixed(0) }} mm</span>
          </div>
          <input
            type="range"
            :min="0"
            :max="40"
            :step="5"
            v-model.number="depth"
            class="depth-slider"
          />
          <div class="feeler-row">
            <span class="lbl">换算间隙：</span>
            <span class="val num">{{ clearance(depth).toFixed(2) }} mm</span>
          </div>
          <button class="confirm-btn" @click="confirm">
            确认本点测量
          </button>
        </template>
      </div>
    </div>

    <!-- 结果区 -->
    <div class="feeler-result" v-if="hasAnyMeasurement">
      <table>
        <thead>
          <tr>
            <th>测点</th>
            <th>插入深度 (mm)</th>
            <th>换算间隙 (mm)</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(p, i) in points" :key="i">
            <td>{{ p.label }}</td>
            <td class="num">{{ p.measured ? p.depth : '—' }}</td>
            <td
              class="num"
              :class="{ bad: p.measured && p.depth < 25 }"
            >
              {{ p.measured ? clearance(p.depth).toFixed(2) : '—' }}
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="allMeasured" class="summary" :class="passed ? 'pass' : 'fail'">
        <div>
          四点最小间隙：<span class="num">{{ minClearance.toFixed(2) }} mm</span>
          ｜ 平均间隙：<span class="num">{{ avgClearance.toFixed(2) }} mm</span>
        </div>
        <div class="conclusion">
          {{
            passed
              ? '判定合格：间隙 ≥ 0.32 mm，可重新启动主机'
              : '判定异常：间隙不足，需调整后复检'
          }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

interface Point {
  label: string;
  x: number;
  y: number;
  lx: number;
  ly: number;
  measured: boolean;
  depth: number;
}

const points = ref<Point[]>([
  { label: '上(0°)', x: 110, y: 18, lx: 110, ly: 8, measured: false, depth: 0 },
  { label: '右(90°)', x: 202, y: 110, lx: 200, ly: 100, measured: false, depth: 0 },
  { label: '下(180°)', x: 110, y: 202, lx: 110, ly: 218, measured: false, depth: 0 },
  { label: '左(270°)', x: 18, y: 110, lx: 22, ly: 100, measured: false, depth: 0 }
]);

const current = ref<number>(-1);
const depth = ref<number>(20);

function select(i: number) {
  current.value = i;
  depth.value = points.value[i].measured ? points.value[i].depth : 20;
}

/**
 * 经验换算：
 *   插入深度 30mm -> 间隙 0.32mm（合格临界）
 *   插入深度 15mm -> 间隙 0.24mm（异常）
 *   线性近似：clearance = 0.005333 * depth + 0.16
 */
function clearance(d: number) {
  if (d <= 0) return 0;
  return 0.16 + d * 0.00533;
}

function confirm() {
  if (current.value < 0) return;
  const p = points.value[current.value];
  p.measured = true;
  p.depth = depth.value;
}

const hasAnyMeasurement = computed(() =>
  points.value.some(p => p.measured)
);
const allMeasured = computed(() => points.value.every(p => p.measured));
const minClearance = computed(() =>
  Math.min(...points.value.map(p => clearance(p.depth)))
);
const avgClearance = computed(
  () =>
    points.value.reduce((s, p) => s + clearance(p.depth), 0) /
    points.value.length
);
const passed = computed(() => minClearance.value >= 0.3 && avgClearance.value >= 0.32);

defineExpose({ allMeasured, passed, minClearance, avgClearance });
</script>

<style scoped>
.feeler {
  background: var(--c-bg-panel);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  padding: 10px;
}
.feeler-title {
  text-align: center;
  font-size: 14px;
  letter-spacing: 2px;
  border-bottom: 1px solid var(--c-border);
  padding-bottom: 6px;
  margin-bottom: 10px;
}
.feeler-body {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 16px;
}
.bearing-svg .point {
  cursor: pointer;
  transition: r 0.1s;
}
.bearing-svg .point:hover {
  filter: brightness(1.3);
}
.feeler-panel {
  background: var(--c-bg-panel-alt);
  border: 1px solid var(--c-border-soft);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.feeler-tip {
  text-align: center;
  color: var(--c-text-2);
  margin-top: 30px;
}
.dot-red {
  color: var(--c-accent);
}
.feeler-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.lbl {
  color: var(--c-text-2);
  font-size: 12px;
}
.val {
  color: var(--c-text);
  font-size: 14px;
  font-weight: 600;
}
.depth-slider {
  width: 100%;
  accent-color: var(--c-accent);
}
.confirm-btn {
  background: var(--c-accent);
  border: 1px solid var(--c-accent);
  color: #fff;
  padding: 6px;
  cursor: pointer;
  border-radius: 2px;
  letter-spacing: 2px;
}
.feeler-result {
  margin-top: 12px;
}
.feeler-result table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.feeler-result th,
.feeler-result td {
  border: 1px solid var(--c-border-soft);
  padding: 4px 8px;
  text-align: center;
}
.feeler-result th {
  background: var(--c-bg-panel-alt);
  color: var(--c-text-2);
  font-weight: 400;
}
.bad {
  color: var(--c-accent);
}
.summary {
  margin-top: 8px;
  padding: 8px;
  border: 1px solid var(--c-border-soft);
  text-align: center;
  font-size: 13px;
}
.summary.pass {
  border-color: var(--c-ok);
  color: var(--c-ok);
}
.summary.fail {
  border-color: var(--c-accent);
  color: var(--c-accent);
}
.conclusion {
  margin-top: 4px;
  font-weight: 600;
  letter-spacing: 1px;
}
</style>
