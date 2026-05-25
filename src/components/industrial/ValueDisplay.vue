<template>
  <div class="value-display" :class="{ accent }">
    <div class="vd-label" v-if="label">{{ label }}</div>
    <div class="vd-value num">{{ formatted }}</div>
    <div class="vd-unit" v-if="unit">{{ unit }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
const props = defineProps<{
  label?: string;
  value: number | string;
  unit?: string;
  digits?: number;
  accent?: boolean;
}>();
const formatted = computed(() => {
  if (typeof props.value === 'number') {
    return props.value.toFixed(props.digits ?? 1);
  }
  return props.value;
});
</script>

<style scoped>
.value-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.vd-label {
  font-size: 12px;
  color: var(--c-text-2);
  letter-spacing: 1px;
  margin-bottom: 4px;
}
.vd-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--c-text);
}
.value-display.accent .vd-value {
  color: var(--c-accent);
}
.vd-unit {
  font-size: 12px;
  color: var(--c-text-2);
}
</style>
