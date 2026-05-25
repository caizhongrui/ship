/**
 * 中间轴承温度模型
 *
 * 正常工况：稳态约 55℃
 * 故障（间隙过小）：摩擦系数 μ 翻倍以上，温度按一阶滞后爬升至 75–112℃
 *
 * dT/dt = (T_ss - T) / tau
 *   T_ss 由摩擦功率与散热平衡决定
 */
import type { EngineState } from '@/types';

const TAU = 12; // 一阶时间常数 12s（保证 ~45s 升至 75℃）
const T_AMBIENT = 25;

export function stepBearingTemp(state: EngineState, dt: number) {
  const fault = state.faults['BEARING_CLEARANCE_LOW'];
  const muFactor = fault?.active
    ? Number((fault as any).muFactor ?? 3.5)
    : 1.0;

  const loadRatio = state.loadPct / 100;
  // 正常稳态：T_ss = 25 + 30 * loadRatio  (满负荷约 55℃)
  // 故障稳态：T_ss = 25 + 30 * loadRatio * muFactor
  const tSteady = T_AMBIENT + 30 * loadRatio * muFactor;

  state.bearingTemp += ((tSteady - state.bearingTemp) / TAU) * dt;

  // 振动随负荷与故障增大
  const vibBase = 2 + loadRatio * 4;
  state.shaftVibration = vibBase * (fault?.active ? 2.2 : 1) +
    (Math.random() - 0.5) * 0.3;
}
