import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import type { EngineState } from '@/types';

const MAX_HIST = 1800; // 1800 × 0.5s ≈ 15 分钟的历史
const SAMPLE_DT = 0.5; // 每个采样间隔（与 worker UI_POST_MS 对齐）

/** 历史点 = EngineState 快照 + monoT（单调递增的"录制时间轴"） */
export interface HistoryPoint extends EngineState {
  monoT: number;
}

function emptyState(): EngineState {
  return {
    t: 0,
    rpm: 0,
    rpmTarget: 0,
    loadPct: 0,
    power: 0,
    scavPressure: 0,
    cylExhaust: Array(8).fill(25),
    exhaustManifold: 25,
    cylPmax: Array(8).fill(0),
    bearingTemp: 25,
    shaftVibration: 0,
    lubeOilTemp: 35,
    lubeOilPressure: 0,
    busVoltage: 0,
    busFrequency: 0,
    busCurrent: 0,
    busActivePower: 0,
    telegraph: 'STOP',
    faults: {}
  };
}

export const useTelemetryStore = defineStore('telemetry', () => {
  const state = shallowRef<EngineState>(emptyState());
  const history = ref<HistoryPoint[]>([]);
  let nextMonoT = 0;

  /**
   * 更新当前快照。
   * @param record true=同时写入历史曲线；false=仅刷新当前显示，不记录（停止/修复时用）
   */
  function update(s: EngineState, record: boolean = true) {
    state.value = s;
    if (!record) return;
    history.value.push({ ...s, monoT: nextMonoT });
    nextMonoT += SAMPLE_DT;
    if (history.value.length > MAX_HIST) {
      history.value.splice(0, history.value.length - MAX_HIST);
    }
  }

  function reset() {
    state.value = emptyState();
    history.value = [];
    nextMonoT = 0;
  }

  return { state, history, update, reset };
});
