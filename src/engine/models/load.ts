/** 主机负荷随转速线性指示：0 rpm = 0%，80 rpm = 100%。 */
import type { EngineState } from '@/types';

const RATED_RPM = 80;
const RATED_POWER = 42310; // kW

export function stepLoad(state: EngineState) {
  // 用绝对转速计算，使正车、倒车的负荷表均随主机转速同步。
  const loadRatio = Math.min(Math.abs(state.rpm) / RATED_RPM, 1.1);
  state.loadPct = loadRatio * 100;
  state.power = loadRatio * RATED_POWER;
}
