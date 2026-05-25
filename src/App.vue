<template>
  <LoginView v-if="!session.authenticated" />
  <div v-else class="app-shell">
    <AppHeader />
    <div class="app-body">
      <AppSidebar />
      <main class="app-main">
        <router-view v-slot="{ Component }">
          <component :is="Component" />
        </router-view>
      </main>
    </div>
    <AppStatusBar />
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue';
import AppHeader from '@/layouts/AppHeader.vue';
import AppSidebar from '@/layouts/AppSidebar.vue';
import AppStatusBar from '@/layouts/AppStatusBar.vue';
import LoginView from '@/views/LoginView.vue';
import { useSessionStore } from '@/stores/session';
import {
  bootSimRuntime,
  simSetTimeScale,
  simSetMode
} from '@/engine/simRuntime';

const session = useSessionStore();

// 登录后才初始化仿真运行时
watch(
  () => session.authenticated,
  authed => {
    if (authed) {
      bootSimRuntime();
      simSetTimeScale(session.timeScale);
      simSetMode(session.mode);
    }
  }
);

// 速率/模式联动
watch(
  () => session.timeScale,
  v => simSetTimeScale(v)
);
watch(
  () => session.mode,
  v => simSetMode(v)
);
</script>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  background: var(--c-bg);
  color: var(--c-text);
}
.app-body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.app-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  background: var(--c-bg);
}
</style>
