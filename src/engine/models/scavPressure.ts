/**
 * 扫气压力模型（04.24 §扫气压力变化曲线）
 *  load%  ->  bar(g)
 *   0     ->  0.20
 *   30    ->  0.90
 *   50    ->  1.60
 *   80    ->  2.30
 *   100   ->  2.85
 *   105   ->  2.95
 */
import type { EngineState } from '@/types';

const TBL: [number, number][] = [
  [0, 0.2],
  [30, 0.9],
  [50, 1.6],
  [80, 2.3],
  [100, 2.85],
  [105, 2.95]
];

function interp(x: number) {
  if (x <= TBL[0][0]) return TBL[0][1];
  if (x >= TBL[TBL.length - 1][0]) return TBL[TBL.length - 1][1];
  for (let i = 1; i < TBL.length; i++) {
    const [x0, y0] = TBL[i - 1];
    const [x1, y1] = TBL[i];
    if (x <= x1) {
      const t = (x - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return 0;
}

export function stepScavPressure(state: EngineState) {
  state.scavPressure = interp(state.loadPct) + (Math.random() - 0.5) * 0.04;
}
