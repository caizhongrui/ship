/** 中间轴承温度及中间轴振动位移模型。 */
import type { EngineState } from '@/types';

const T_AMBIENT = 25;
const BEARING_NOMINAL = 55;
const BEARING_ALARM = 58;

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

export function stepBearingTemp(state: EngineState, _dt: number) {
  const rpm = Math.abs(state.rpm);
  if (rpm >= 75) {
    // 75 rpm 时达到 58℃，随后仅小幅升至 58.2℃，触发温度高报警。
    state.bearingTemp = BEARING_ALARM + Math.min((rpm - 75) / 5, 1) * 0.2;
  } else {
    // 70 rpm 前随转速线性升至标称 55℃，70–75 rpm 保持标称值。
    state.bearingTemp =
      T_AMBIENT +
      (BEARING_NOMINAL - T_AMBIENT) * Math.min(rpm / 70, 1);
  }
  state.shaftVibration = vibrationFromRpm(state.rpm);
}
