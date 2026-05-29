import { defineStore, acceptHMRUpdate } from 'pinia';
import { ref, computed } from 'vue';
import type { AlarmEvent } from '@/types';

export const useAlarmStore = defineStore('alarms', () => {
  const active = ref<AlarmEvent[]>([]);
  const history = ref<AlarmEvent[]>([]);
  const cycleIndex = ref(0); // 多条活跃报警轮播索引（共享）

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
  function ackAll() {
    active.value.forEach(a => (a.acknowledged = true));
  }
  function reset() {
    active.value = [];
    history.value = [];
    cycleIndex.value = 0;
  }

  // 未确认的活跃报警
  const activeUnacked = computed(() =>
    active.value.filter(a => !a.acknowledged)
  );
  // 当前轮播展示的报警
  const displayed = computed<AlarmEvent | null>(() => {
    const list = activeUnacked.value;
    if (list.length === 0) return null;
    return list[cycleIndex.value % list.length];
  });
  // 轮播步进（多于 1 条时切换）
  function cycle() {
    const n = activeUnacked.value.length;
    cycleIndex.value = n > 1 ? (cycleIndex.value + 1) % n : 0;
  }

  return {
    active,
    history,
    cycleIndex,
    activeUnacked,
    displayed,
    push,
    clear,
    ack,
    ackAll,
    cycle,
    reset
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAlarmStore, import.meta.hot));
}
