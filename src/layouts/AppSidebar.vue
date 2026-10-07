<template>
  <aside class="app-sidebar">
    <nav ref="navList" class="nav-list" aria-label="模块菜单">
      <router-link
        v-for="item in items"
        :key="item.path"
        :to="item.path"
        class="nav-item"
        :class="{ 'is-active': route.path.startsWith(item.path) }"
      >
        <span class="nav-icon">{{ iconText(item.icon) }}</span>
        <span class="nav-label">{{ item.title }}</span>
      </router-link>
    </nav>

    <div class="nav-spacer"></div>

    <!-- 车钟（常驻） -->
    <div class="nav-telegraph">
      <TelegraphLever />
    </div>

    <div class="nav-bottom">
      <div class="nav-item nav-back" @click="goBack">
        <span class="nav-icon">↩</span>
        <span class="nav-label">返　回</span>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import TelegraphLever from '@/components/controls/TelegraphLever.vue';

const route = useRoute();
const router = useRouter();
const navList = ref<HTMLElement | null>(null);

// 小窗口菜单可滚动，切换模块时保持当前菜单项可见。
watch(() => route.path, async () => {
  await nextTick();
  const nav = navList.value;
  const item = nav?.querySelector<HTMLElement>('.is-active');
  if (!nav || !item) return;
  const navRect = nav.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  if (itemRect.top < navRect.top) nav.scrollTop -= navRect.top - itemRect.top;
  else if (itemRect.bottom > navRect.bottom) nav.scrollTop += itemRect.bottom - navRect.bottom;
}, { immediate: true, flush: 'post' });

interface NavItem {
  path: string;
  title: string;
  icon: string;
}

const items = computed<NavItem[]>(() =>
  router.options.routes
    .filter(r => r.meta && r.meta.title)
    .map(r => ({
      path: r.path,
      title: (r.meta as any).title,
      icon: (r.meta as any).icon
    }))
);

function iconText(icon: string): string {
  const map: Record<string, string> = {
    engine: '◧',
    power: '⌁',
    aux: '⊞',
    shaft: '◎',
    vibration: '∿',
    alarm: '◮',
    trend: '⌇',
    report: '☰',
    devices: '⚙',
    diag: '✜'
  };
  return map[icon] || '·';
}

function goBack() {
  router.back();
}
</script>

<style scoped>
.app-sidebar {
  width: var(--sidebar-w);
  background: var(--c-bg);
  border-right: 1px solid var(--c-border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  padding: 6px;
  gap: 4px;
}
.nav-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
  overflow-y: auto;
}
.nav-item {
  flex-shrink: 0;
  height: 38px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 10px;
  background: var(--c-bg-panel);
  color: var(--c-text);
  border: 1px solid var(--c-border-soft);
  border-radius: var(--radius);
  cursor: pointer;
  transition: all 0.12s;
  box-shadow:
    inset 0 1px 0 #fff,
    inset 0 -1px 0 rgba(0, 0, 0, 0.05);
}
.nav-item:hover {
  background: var(--c-bg-active);
}
.nav-item.is-active {
  background: var(--c-bg-active);
  border-color: var(--c-border);
  box-shadow:
    inset 0 1px 0 #fff,
    inset 2px 0 0 var(--c-accent);
  padding-left: 14px;
}
.nav-item.is-active .nav-label {
  color: var(--c-accent);
  font-weight: 700;
}
.nav-icon {
  width: 18px;
  text-align: center;
  font-size: 14px;
  color: var(--c-text-2);
}
.nav-label {
  font-size: 13px;
  letter-spacing: 2px;
}

.nav-spacer {
  flex: 1;
  min-height: 4px;
}
.nav-telegraph {
  flex-shrink: 0;
  margin-bottom: 4px;
}
.nav-bottom {
  display: flex;
  flex-direction: column;
}
</style>
