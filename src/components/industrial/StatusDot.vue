<template>
  <span class="status-dot" :class="state" :style="sizeStyle"></span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  state?: 'on' | 'off' | 'warn' | 'fault';
  size?: number;
}>();

const sizeStyle = computed(() => ({
  width: `${props.size ?? 12}px`,
  height: `${props.size ?? 12}px`
}));
</script>

<style scoped>
.status-dot {
  display: inline-block;
  border-radius: 50%;
  background: #444;
  vertical-align: middle;
}
.status-dot.on {
  background: var(--c-ok);
  box-shadow: 0 0 6px var(--c-ok);
}
.status-dot.off {
  background: #333;
}
.status-dot.warn {
  background: var(--c-warn);
  box-shadow: 0 0 6px var(--c-warn);
}
.status-dot.fault {
  background: var(--c-accent);
  box-shadow: 0 0 6px var(--c-accent);
}
</style>
