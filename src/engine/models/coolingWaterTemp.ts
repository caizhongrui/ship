/** 主机转速对应的冷却水出口温度模型。 */
import type { EngineState } from '@/types';

const RPM_TEMPERATURE_TABLE: [number, number][] = [
  [0, 60.0],
  [20, 65.5],
  [40, 70.3],
  [60, 78.5],
  [80, 85.1]
];

function temperatureFromRpm(rpm: number) {
  const value = Math.min(Math.abs(rpm), 80);

  for (let i = 1; i < RPM_TEMPERATURE_TABLE.length; i++) {
    const [rpm1, temp1] = RPM_TEMPERATURE_TABLE[i];
    if (value <= rpm1) {
      const [rpm0, temp0] = RPM_TEMPERATURE_TABLE[i - 1];
      const ratio = (value - rpm0) / (rpm1 - rpm0);
      return temp0 + (temp1 - temp0) * ratio;
    }
  }

  return RPM_TEMPERATURE_TABLE[RPM_TEMPERATURE_TABLE.length - 1][1];
}

export function stepCoolingWaterOutletTemp(state: EngineState) {
  state.coolingWaterOutletTemp = temperatureFromRpm(state.rpm);
}
