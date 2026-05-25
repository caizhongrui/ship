/**
 * 转速一阶惯性模型
 * dn/dt = (n_target - n) / tau
 * 不同档位对应不同目标转速
 */
import type { EngineState, TelegraphPosition } from '@/types';

// 按客户规范表（04.30 档位 / 转速 / 负荷范围 / 特殊控制）
export const TARGET_RPM: Record<TelegraphPosition, number> = {
  STOP: 0,
  DEAD_SLOW_AHEAD: 25,
  SLOW_AHEAD: 38,
  HALF_AHEAD: 52,
  FULL_AHEAD: 63,
  NAV_FULL: 80
};

const TAU = 25; // 秒 — 校准至与启动剧本数据表一致的爬升节奏

export function stepRpm(state: EngineState, dt: number) {
  const target = TARGET_RPM[state.telegraph];
  state.rpmTarget = target;
  const error = target - state.rpm;
  state.rpm += (error / TAU) * dt;
  if (state.rpm < 0) state.rpm = 0;
}
