<template>
  <div class="bar-8cyl">
    <div class="bc-area">
      <!-- 阈值线（绝对定位） -->
      <div
        v-if="threshold !== undefined"
        class="bc-threshold"
        :style="{ bottom: thresholdBottomPct }"
      >
        <span class="bc-threshold-label num">{{ threshold }}℃</span>
      </div>

      <div
        v-for="(v, i) in values"
        :key="i"
        class="bc-col"
      >
        <div class="bc-num num">{{ v.toFixed(1) }}</div>
        <div class="bc-bar-wrap">
          <div
            class="bc-bar"
            :class="levelClass(v)"
            :style="{ height: heightPct(v) }"
          ></div>
        </div>
        <div class="bc-label">{{ i + 1 }}#</div>
      </div>
    </div>
    <div class="bc-axis">
      <span>{{ min }}</span>
      <span>{{ max }}</span>
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
  { min: 0, max: 500, warn: 425, danger: 450 }
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
.bar-8cyl {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  padding: 24px 16px 8px;
}
.bc-area {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 10px;
  align-items: end;
  position: relative;
}
.bc-threshold {
  position: absolute;
  left: 0;
  right: 0;
  height: 0;
  border-top: 1px dashed var(--c-accent);
  pointer-events: none;
  z-index: 2;
}
.bc-threshold-label {
  position: absolute;
  left: 0;
  top: -16px;
  color: var(--c-accent);
  font-size: 12px;
  font-weight: 700;
  background: var(--c-bg-panel);
  padding: 0 4px;
  border: 1px solid var(--c-accent);
  border-radius: 2px;
}
.bc-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
}
.bc-num {
  font-size: 11px;
  color: var(--c-text);
  margin-bottom: 2px;
}
.bc-bar-wrap {
  flex: 1;
  width: 70%;
  background: #fff;
  border: 1px solid var(--c-border-soft);
  position: relative;
  display: flex;
  align-items: flex-end;
}
.bc-bar {
  width: 100%;
  transition: height 0.2s, background 0.2s;
}
.bc-bar.normal {
  background: var(--c-info);
}
.bc-bar.warn {
  background: var(--c-warn);
}
.bc-bar.danger {
  background: var(--c-accent);
}
.bc-label {
  font-size: 13px;
  color: var(--c-accent);
  margin-top: 4px;
  font-family: var(--font-num);
  font-weight: 700;
}
.bc-axis {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--c-text-muted);
  padding: 0 4px;
}
</style>
