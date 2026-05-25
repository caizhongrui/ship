/**
 * 电站参数（04.24 §电压电流频率动态变化时间线）
 * 简化为按主机运行时间插值。
 */
import type { EngineState } from '@/types';

const VOLT: [number, number][] = [
  [0, 440], [5, 435], [30, 438], [120, 440],
  [180, 442], [240, 438], [300, 440]
];
const FREQ: [number, number][] = [
  [0, 60], [5, 59.8], [30, 59.9], [120, 60],
  [180, 60.1], [240, 59.8], [300, 60]
];
const CURR: [number, number][] = [
  [0, 500], [5, 1200], [30, 1500], [120, 1800],
  [180, 2200], [240, 2700], [300, 3100]
];
const POW: [number, number][] = [
  [0, 50], [5, 500], [30, 750], [120, 1100],
  [180, 1450], [240, 1850], [300, 2200]
];

function interp(t: number, tbl: [number, number][]) {
  if (t <= tbl[0][0]) return tbl[0][1];
  if (t >= tbl[tbl.length - 1][0]) return tbl[tbl.length - 1][1];
  for (let i = 1; i < tbl.length; i++) {
    const [x0, y0] = tbl[i - 1];
    const [x1, y1] = tbl[i];
    if (t <= x1) {
      const k = (t - x0) / (x1 - x0);
      return y0 + k * (y1 - y0);
    }
  }
  return 0;
}

export function stepElectric(state: EngineState) {
  state.busVoltage = interp(state.t, VOLT) + (Math.random() - 0.5) * 1;
  state.busFrequency = interp(state.t, FREQ) + (Math.random() - 0.5) * 0.05;
  state.busCurrent = interp(state.t, CURR) + (Math.random() - 0.5) * 30;
  state.busActivePower = interp(state.t, POW) + (Math.random() - 0.5) * 20;
}
