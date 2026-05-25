<template>
  <header class="app-header">
    <div class="hdr-breadcrumb">
      <span class="bc-root">船舶数字孪生诊断系统</span>
      <span class="bc-sep">▸</span>
      <span class="bc-current">{{ currentTitle }}</span>
    </div>
    <div class="hdr-right">
      <span class="hdr-clock num">{{ clock }}</span>
      <span class="hdr-user">
        <span class="avatar">●</span>
        <span>{{ session.user || 'Guest' }}</span>
        <span v-if="session.role" class="role-tag">{{ session.role }}</span>
      </span>
      <button class="logout-btn" @click="onLogout">退 出</button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useSessionStore } from '@/stores/session';

const session = useSessionStore();
const route = useRoute();

const currentTitle = computed(
  () => (route.meta && (route.meta as any).title) || ''
);

const clock = ref('');
let t: number | undefined;
function refresh() {
  const d = new Date();
  const date = d.toISOString().slice(0, 10);
  const time = d.toTimeString().slice(0, 8);
  clock.value = `${date}  ${time}`;
}
onMounted(() => {
  refresh();
  t = window.setInterval(refresh, 1000);
});
onUnmounted(() => t && clearInterval(t));

function onLogout() {
  if (confirm('确定退出登录？')) {
    session.logout();
  }
}
</script>

<style scoped>
.app-header {
  height: var(--header-h);
  background: var(--c-bg-header);
  color: var(--c-text-inv);
  display: flex;
  align-items: center;
  padding: 0 16px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--c-border);
}
.hdr-breadcrumb {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  letter-spacing: 1px;
}
.bc-root {
  color: rgba(255, 255, 255, 0.75);
  font-weight: 600;
}
.bc-sep {
  color: rgba(255, 255, 255, 0.5);
}
.bc-current {
  color: #fff;
  font-weight: 700;
}
.hdr-right {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 13px;
}
.hdr-clock {
  color: rgba(255, 255, 255, 0.95);
  letter-spacing: 0.5px;
}
.hdr-user {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.hdr-user .avatar {
  color: var(--c-ok);
}
.role-tag {
  font-size: 10px;
  background: rgba(255, 255, 255, 0.2);
  padding: 1px 6px;
  border-radius: 8px;
  letter-spacing: 1px;
}
.logout-btn {
  background: transparent;
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.4);
  padding: 3px 12px;
  border-radius: 3px;
  font-size: 12px;
  letter-spacing: 2px;
  cursor: pointer;
  transition: all 0.12s;
}
.logout-btn:hover {
  background: var(--c-accent);
  border-color: var(--c-accent);
}
</style>
