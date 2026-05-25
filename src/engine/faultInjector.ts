import type { EngineState } from '@/types';

/**
 * 主线剧本故障：t = 290~295 秒之间触发"排温过高"故障
 * 现象：在脚本即将达到 NAV_FULL 稳态时，单缸 / 各缸排温叠加 +80℃，
 * 超过 430℃ 报警阈值；学生需停车 → 进故障诊断 → 点"故障修复"清除。
 */
export class FaultInjector {
  private done = false;

  step(state: EngineState) {
    if (this.done) return;
    if (state.t >= 290 && state.t <= 295) {
      // 永远是 5# 缸（0-indexed = 4），温度锁在 ~435℃ 附近
      state.faults['EXHAUST_TEMP_HIGH'] = {
        active: true,
        targetCyl: 4,
        targetTemp: 435
      };
      this.done = true;
    }
  }

  /** 清除故障 — 供"故障修复"按钮调用 */
  clear(state: EngineState) {
    state.faults['EXHAUST_TEMP_HIGH'] = {
      active: false
    };
    state.faults['BEARING_CLEARANCE_LOW'] = { active: false };
    this.done = true;
  }

  reset() {
    this.done = false;
  }
}
