<template>
  <div class="login-page">
    <div class="login-card">
      <div class="brand">
        <div class="brand-mark">⚓</div>
        <div class="brand-title">船 舶 数 字 孪 生 诊 断 系 统</div>
        <div class="brand-sub">Ship Digital Twin Diagnostic System</div>
      </div>

      <div class="form">
        <div class="field">
          <label>用户名</label>
          <input
            v-model="username"
            type="text"
            autocomplete="username"
            placeholder="请输入用户名"
            @keyup.enter="onLogin"
          />
        </div>
        <div class="field">
          <label>密 码</label>
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            placeholder="请输入密码"
            @keyup.enter="onLogin"
          />
        </div>

        <transition name="fade">
          <div v-if="errorMsg" class="error">{{ errorMsg }}</div>
        </transition>

        <button class="btn-login" :disabled="!canLogin" @click="onLogin">
          登　录
        </button>

        <div class="hint">
          <div>演示账号：</div>
          <div><b>student</b> / 123456 — 学员</div>
          <div><b>admin</b> / admin123 — 管理员</div>
        </div>
      </div>

      <div class="footer">v0.1.0 © 天津海运 | 青岛欧盛</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useSessionStore } from '@/stores/session';

const session = useSessionStore();
const username = ref('');
const password = ref('');
const errorMsg = ref('');

const canLogin = computed(
  () => username.value.trim().length > 0 && password.value.length > 0
);

function onLogin() {
  errorMsg.value = '';
  if (!canLogin.value) return;
  const ok = session.login(username.value.trim(), password.value);
  if (!ok) {
    errorMsg.value = '用户名或密码错误';
    password.value = '';
  }
}
</script>

<style scoped>
.login-page {
  width: 100vw;
  height: 100vh;
  background:
    radial-gradient(ellipse at 30% 20%, #b5b3c8 0%, transparent 60%),
    radial-gradient(ellipse at 70% 80%, #918eb0 0%, transparent 60%),
    var(--c-bg);
  display: flex;
  align-items: center;
  justify-content: center;
}
.login-card {
  width: 420px;
  background: var(--c-bg-panel);
  border: 1px solid var(--c-border);
  border-radius: 6px;
  padding: 36px 36px 22px;
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.25);
}
.brand {
  text-align: center;
  margin-bottom: 28px;
}
.brand-mark {
  font-size: 36px;
  color: var(--c-bg-header);
  margin-bottom: 6px;
}
.brand-title {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 4px;
  color: var(--c-text);
}
.brand-sub {
  font-size: 11px;
  color: var(--c-text-muted);
  margin-top: 4px;
  letter-spacing: 1px;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.field label {
  font-size: 12px;
  color: var(--c-text-2);
  letter-spacing: 4px;
}
.field input {
  width: 100%;
  height: 36px;
  padding: 0 12px;
  background: #fff;
  border: 1px solid var(--c-border-soft);
  border-radius: 3px;
  font-size: 14px;
  color: var(--c-text);
  outline: none;
  transition: border-color 0.15s;
}
.field input:focus {
  border-color: var(--c-bg-header);
  box-shadow: 0 0 0 2px rgba(110, 106, 140, 0.15);
}
.error {
  color: var(--c-accent);
  font-size: 12px;
  text-align: center;
  background: rgba(199, 59, 59, 0.08);
  padding: 6px;
  border: 1px solid rgba(199, 59, 59, 0.3);
  border-radius: 3px;
}
.btn-login {
  height: 38px;
  background: var(--c-accent);
  color: #fff;
  border: none;
  border-radius: 3px;
  font-size: 15px;
  letter-spacing: 8px;
  font-weight: 700;
  cursor: pointer;
  margin-top: 4px;
  transition: filter 0.12s;
}
.btn-login:hover:not(:disabled) {
  filter: brightness(1.1);
}
.btn-login:disabled {
  background: var(--c-border-soft);
  cursor: not-allowed;
}
.hint {
  font-size: 11px;
  color: var(--c-text-muted);
  line-height: 1.7;
  border-top: 1px dashed var(--c-border-soft);
  padding-top: 10px;
  margin-top: 6px;
}
.hint b {
  color: var(--c-text);
  font-family: var(--font-num);
}
.footer {
  margin-top: 18px;
  text-align: center;
  font-size: 11px;
  color: var(--c-text-muted);
  letter-spacing: 1px;
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
