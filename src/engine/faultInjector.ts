import type { EngineState } from '@/types';

/**
 * 主线剧本故障：转速爬升至 ~68 rpm（海速 85%）时触发"各缸排温过高 + 主机过载"
 * 8 个缸分别升到指定温度（均超 390℃ 报警阈值）：
 *   1#411.3 2#416.5 3#415.1 4#417.3 5#413.2 6#414.2 7#410.5 8#414.7
 * 同时主机负荷异常拉到 100%（过载）。
 * 学生需停车 → 进故障诊断 → 点"故障修复"清除。
 */
export const CYL_FAULT_TARGETS = [
  411.3, 416.5, 415.1, 417.3, 413.2, 414.2, 410.5, 414.7
];

export const FAULT_TRIGGER_RPM = 68; // 海速 80rpm 的 85%

export class FaultInjector {
  private done = false;

  step(state: EngineState) {
    if (this.done) return;
    if (state.rpm >= FAULT_TRIGGER_RPM) {
      state.faults['EXHAUST_TEMP_HIGH'] = {
        active: true,
        targets: CYL_FAULT_TARGETS.slice()
      };
      this.done = true;
    }
  }

  /** 清除故障 — 供"故障修复"按钮调用 */
  clear(state: EngineState) {
    state.faults['EXHAUST_TEMP_HIGH'] = { active: false };
    state.faults['BEARING_CLEARANCE_LOW'] = { active: false };
    this.done = true;
  }

  reset() {
    this.done = false;
  }
}
