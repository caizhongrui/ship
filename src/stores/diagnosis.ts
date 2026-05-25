import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { DiagResult } from '@/types';

export const useDiagnosisStore = defineStore('diagnosis', () => {
  const latest = ref<DiagResult | null>(null);
  const running = ref(false);

  function setLatest(r: DiagResult) {
    latest.value = r;
  }
  function setRunning(v: boolean) {
    running.value = v;
  }
  function reset() {
    latest.value = null;
    running.value = false;
  }

  return { latest, running, setLatest, setRunning, reset };
});
