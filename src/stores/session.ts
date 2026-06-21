import { defineStore, acceptHMRUpdate } from 'pinia';
import { ref, computed } from 'vue';
import type { TelegraphPosition, SimDirection } from '@/types';

export type SimMode = 'AUTO' | 'MANUAL';

/**
 * 会话状态：
 *  - mode      AUTO（剧本驱动）/ MANUAL（手动操作车钟）
 *  - started   是否已点"开始"
 *  - running   仿真是否在跑（暂停时为 false）
 *  - simTime   仿真时间（秒）
 *  - timeScale 时间倍速
 */
export const useSessionStore = defineStore('session', () => {
  const id = ref<string>('');
  const user = ref<string>('');
  const role = ref<'student' | 'admin' | ''>('');
  const authenticated = ref<boolean>(false);
  const scenario = ref<string>('mooring_test_main');

  const mode = ref<SimMode>('AUTO');
  const direction = ref<SimDirection>('AHEAD');
  const started = ref<boolean>(false);
  const running = ref<boolean>(false);

  const simTime = ref<number>(0);
  const timeScale = ref<number>(5);
  const telegraph = ref<TelegraphPosition>('STOP');
  const startedAt = ref<number>(0);

  function startSim() {
    id.value = `${new Date().toISOString().slice(0, 10)}_S${Date.now()
      .toString()
      .slice(-4)}`;
    started.value = true;
    running.value = true;
    simTime.value = 0;
    startedAt.value = Date.now();
  }
  function stopSim() {
    running.value = false;
  }
  function resetSim() {
    started.value = false;
    running.value = false;
    simTime.value = 0;
    telegraph.value = 'STOP';
  }
  function setMode(m: SimMode) {
    mode.value = m;
    // 驾控/集控 均允许 AHEAD/ASTERN
  }
  function setDirection(d: SimDirection) {
    direction.value = d;
  }
  function setTelegraph(p: TelegraphPosition) {
    telegraph.value = p;
  }
  function setTimeScale(v: number) {
    timeScale.value = v;
  }

  // === 简易登录（本地校验，无后端）===
  const USERS: Record<string, { password: string; role: 'student' | 'admin' }> = {
    student: { password: '123456', role: 'student' },
    admin: { password: 'admin123', role: 'admin' }
  };
  function login(username: string, password: string): boolean {
    const u = USERS[username];
    if (!u || u.password !== password) return false;
    user.value = username;
    role.value = u.role;
    authenticated.value = true;
    return true;
  }
  function logout() {
    authenticated.value = false;
    user.value = '';
    role.value = '';
    resetSim();
  }

  const elapsedFmt = computed(() => {
    const s = Math.floor(simTime.value);
    const mm = Math.floor(s / 60)
      .toString()
      .padStart(2, '0');
    const ss = (s % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  });

  return {
    id,
    user,
    role,
    authenticated,
    scenario,
    mode,
    direction,
    started,
    running,
    simTime,
    timeScale,
    telegraph,
    startedAt,
    elapsedFmt,
    startSim,
    stopSim,
    resetSim,
    setMode,
    setDirection,
    setTelegraph,
    setTimeScale,
    login,
    logout
  };
});

// Pinia HMR：开发模式下确保 store 结构变更后被正确替换
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSessionStore, import.meta.hot));
}
