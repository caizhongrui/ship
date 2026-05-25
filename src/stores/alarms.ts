import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { AlarmEvent } from '@/types';

export const useAlarmStore = defineStore('alarms', () => {
  const active = ref<AlarmEvent[]>([]);
  const history = ref<AlarmEvent[]>([]);

  function push(a: AlarmEvent) {
    if (!active.value.find(x => x.id === a.id)) active.value.push(a);
    history.value.push(a);
  }

  function clear(id: string) {
    active.value = active.value.filter(x => x.id !== id);
  }

  function ack(id: string) {
    const a = active.value.find(x => x.id === id);
    if (a) a.acknowledged = true;
  }

  function reset() {
    active.value = [];
    history.value = [];
  }

  return { active, history, push, clear, ack, reset };
});
