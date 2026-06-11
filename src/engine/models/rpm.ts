/**
 * 转速一阶惯性模型
 * dn/dt = (n_target - n) / tau
 * 不同档位对应不同目标转速
 */
import type { EngineState, TelegraphPosition } from '@/types';

// 按客户规范表（04.30 档位 / 转速 / 负荷范围 / 特殊控制）
// 转速值均为正数，方向（AHEAD/ASTERN）由独立 session.direction 控制
export const TARGET_RPM: Record<TelegraphPosition, number> = {
  NAV_FULL: 80,
  FULL_AHEAD: 75,
  HALF_AHEAD: 52,
  SLOW_AHEAD: 38,
  DEAD_SLOW_AHEAD: 25,
  STOP: 0
};

// AUTO 剧本期间脚本直接写 rpm，TAU 不参与；只在 MANUAL/冷却/脚本结束后参与
// 改为较小值让手动切档响应灵敏（~5s 内收敛至目标值，肉眼看到的就是档位转速）
const TAU_DEFAULT = 5; // 秒

export function stepRpm(state: EngineState, dt: number, tau: number = TAU_DEFAULT) {
  const target = TARGET_RPM[state.telegraph];
  state.rpmTarget = target;
  const error = target - state.rpm;
  state.rpm += (error / tau) * dt;
  if (state.rpm < 0) state.rpm = 0;
}
