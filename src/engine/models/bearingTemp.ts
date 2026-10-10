/** 中间轴承温度及中间轴振动位移模型。 */
import type { EngineState } from '@/types';

const T_AMBIENT = 25;
const BEARING_NOMINAL = 55;
const BEARING_ALARM = 58;
const SHAFT_FAULT_INTERVAL_SEC = 1;
// 70 rpm 附近 ±0.03 rpm 的转速噪声不能反复重启同一轮故障计时。
const SHAFT_FAULT_RESET_RPM = 69.9;

// 主机转速 -> 轴系振动位移（mm），节点之间线性插值。
// 60–69 rpm 逐步升至 0.16 mm，70 rpm 起进入 0.20–0.21 mm 报警区间。
const VIBRATION_DISPLACEMENT: [number, number][] = [
  [0, 0],
  [10, 0],
  [20, 0.01],
  [30, 0.02],
  [40, 0.05],
  [50, 0.06],
  [60, 0.09],
  [69, 0.16],
  [70, 0.201],
  [80, 0.21]
];

function vibrationFromRpm(rpm: number) {
  const x = Math.abs(rpm);
  if (x <= VIBRATION_DISPLACEMENT[0][0]) return 0;
  if (x >= VIBRATION_DISPLACEMENT[VIBRATION_DISPLACEMENT.length - 1][0]) {
    return VIBRATION_DISPLACEMENT[VIBRATION_DISPLACEMENT.length - 1][1];
  }
  for (let i = 1; i < VIBRATION_DISPLACEMENT.length; i++) {
    const [x1, y1] = VIBRATION_DISPLACEMENT[i];
    if (x <= x1) {
      const [x0, y0] = VIBRATION_DISPLACEMENT[i - 1];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return 0;
}

export class BearingTempModel {
  private vibrationFaultElapsed: number | null = null;

  // elapsedSec 为未乘仿真速率的实际运行时间：暂停不计时，故障相隔 1 秒。
  step(state: EngineState, elapsedSec: number, faultScenarioEnabled = true) {
    const rpm = Math.abs(state.rpm);
    const vibration = vibrationFromRpm(state.rpm);
    // 故障修复后，满速运行也保持在 0.16 mm 正常范围内。
    state.shaftVibration = faultScenarioEnabled
      ? vibration
      : Math.min(vibration, 0.16);

    if (!faultScenarioEnabled || rpm < SHAFT_FAULT_RESET_RPM) {
      this.reset();
    } else if (this.vibrationFaultElapsed !== null) {
      this.vibrationFaultElapsed += elapsedSec;
    } else if (vibration > 0.2) {
      // 首次振动超限的 tick 为起点，不能把此前正常运行时间算入间隔。
      this.vibrationFaultElapsed = 0;
    }

    if (vibration > 0.2 && this.vibrationFaultElapsed !== null &&
        this.vibrationFaultElapsed >= SHAFT_FAULT_INTERVAL_SEC - 1e-9) {
      // 振动超限 1 秒后升至温度报警值；满速上限仍为 58.2℃。
      state.bearingTemp = BEARING_ALARM + Math.max(0, Math.min((rpm - 75) / 5, 1)) * 0.2;
    } else {
      state.bearingTemp =
        T_AMBIENT +
        (BEARING_NOMINAL - T_AMBIENT) * Math.min(rpm / 70, 1);
    }
  }

  reset() {
    this.vibrationFaultElapsed = null;
  }
}
