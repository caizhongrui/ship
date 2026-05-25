<template>
  <transition name="fade">
    <div v-if="latest" class="alarm-banner" :class="`L${latest.level}`">
      <span class="ab-tag">报警 L{{ latest.level }}</span>
      <span class="ab-msg">{{ latest.message }}</span>
      <span class="ab-meta num">{{ latest.tag }} = {{ latest.value }}</span>
      <button class="ab-close" @click="dismiss">×</button>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useAlarmStore } from '@/stores/alarms';

const alarms = useAlarmStore();

const latest = computed(() =>
  alarms.active.length ? alarms.active[alarms.active.length - 1] : null
);

function dismiss() {
  if (latest.value) alarms.ack(latest.value.id);
}
</script>

<style scoped>
.alarm-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
  border: 1px solid var(--c-accent);
  background: rgba(255, 45, 45, 0.12);
  font-size: 13px;
  color: var(--c-text);
  border-radius: var(--radius);
}
.alarm-banner.L1 {
  border-color: var(--c-alarm-1);
  background: rgba(255, 208, 0, 0.12);
}
.alarm-banner.L2 {
  border-color: var(--c-alarm-2);
  background: rgba(255, 136, 0, 0.12);
}
.ab-tag {
  font-weight: 700;
  color: var(--c-accent);
  letter-spacing: 1px;
}
.ab-msg {
  flex: 1;
}
.ab-meta {
  color: var(--c-text-2);
  font-size: 12px;
}
.ab-close {
  background: transparent;
  color: var(--c-text);
  border: 1px solid var(--c-border-soft);
  cursor: pointer;
  padding: 0 6px;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
