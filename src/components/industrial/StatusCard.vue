<template>
  <div class="ind-panel status-card">
    <div class="ind-panel__title">{{ title }}</div>
    <div class="status-body">
      <div
        v-for="(it, i) in items"
        :key="i"
        class="status-row"
      >
        <span class="row-label">{{ it.label }}</span>
        <span class="row-value" v-if="it.value !== undefined">
          <span class="num">{{ it.value }}</span>
          <span class="unit" v-if="it.unit">{{ it.unit }}</span>
        </span>
        <StatusDot :state="it.state || 'off'" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import StatusDot from './StatusDot.vue';

export interface StatusItem {
  label: string;
  value?: number | string;
  unit?: string;
  state?: 'on' | 'off' | 'warn' | 'fault';
}

defineProps<{
  title: string;
  items: StatusItem[];
}>();
</script>

<style scoped>
.status-card {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
.status-body {
  flex: 1;
  min-height: 0;
  padding: 10px 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center; /* 整组在卡内垂直居中 */
  gap: 6px; /* 行间固定间距，永远不会被屏幕高度拉开 */
}
.status-row {
  flex: 0 0 auto; /* 自然高度，绝不拉伸 */
  height: 26px;
  display: grid;
  grid-template-columns: 1fr auto 14px;
  gap: 6px;
  align-items: center;
  font-size: 12px;
  border-bottom: 1px dashed var(--c-border-soft);
  padding-bottom: 4px;
}
.status-row:last-child {
  border-bottom: none;
}
.row-label {
  color: var(--c-text);
  letter-spacing: 0.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row-value {
  font-family: var(--font-num);
  color: var(--c-text);
  text-align: right;
  white-space: nowrap;
}
.row-value .unit {
  color: var(--c-text-2);
  margin-left: 2px;
}
</style>
