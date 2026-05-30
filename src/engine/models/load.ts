/**
 * 转速-负荷曲线（按客户提供 04.30 启动数据表反推）
 * 关键节点（rpm%, load%）：
 *   0%     -> 0%
 *   15%    -> 10%    (DEAD SLOW 入口)
 *   35%    -> 22%    (SLOW 入口)
 *   52%    -> 38%    (HALF 入口)
 *   70%    -> 60%    (FULL 入口)
 *   85%    -> 92%    (NAV FULL 入口)
 *   100%   -> 100%   (额定)
 */
import type { EngineState } from '@/types';

const RATED_RPM = 80;
const RATED_POWER = 42310; // kW

const CURVE: [number, number][] = [
  [0, 0],
  [0.15, 0.10],
  [0.35, 0.22],
  [0.52, 0.38],
  [0.70, 0.60],
  [0.85, 0.92],
  [1.0, 1.0],
  [1.05, 1.08]
];

function interp(x: number, table: [number, number][]) {
  if (x <= table[0][0]) return table[0][1];
  if (x >= table[table.length - 1][0]) return table[table.length - 1][1];
  for (let i = 1; i < table.length; i++) {
    const [x0, y0] = table[i - 1];
    const [x1, y1] = table[i];
    if (x <= x1) {
      const t = (x - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return 0;
}

export function stepLoad(state: EngineState) {
  // 用 abs(rpm) 计算负荷，让倒车也能产生功率
  const rpmRatio = Math.abs(state.rpm) / RATED_RPM;
  const loadRatio = interp(rpmRatio, CURVE);
  state.loadPct = loadRatio * 100;
  state.power = loadRatio * RATED_POWER;
}
