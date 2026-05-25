/**
 * 排温模型 —— 物理一阶热惯性
 *
 * 问题修复：原版本以 sim_time 强行插值，造成"无论档位多高，时间一到就 420℃"。
 * 现版本：按 **当前负荷** 计算稳态目标，再用一阶滞后逼近，时间常数 τ ≈ 30s。
 * 冷启动 25℃ → 微速 ~150℃ → 半速 ~280℃ → 全速 ~420℃，
 * 自然反映"加车 → 慢慢升温"、"停车 → 慢慢降温"。
 */
import type { EngineState } from '@/types';

// 负荷 -> 排温稳态目标（℃），按客户启动数据表反推（每档稳态终点值）
const LOAD_TEMP: [number, number][] = [
  [0, 25],
  [10, 156],
  [22, 207],
  [38, 296],
  [60, 324],
  [92, 352],
  [100, 380]
];

// 8 个缸的固有偏差（出厂个体差异，制造公差 ±3℃）
// 单缸超温这种异常应作为故障注入项，不在出厂偏差里硬编码
const CYL_BIAS = [0, -2, -3, +2, +1, -1, +3, -2];

// 时间常数（秒）—— 主机热惯性大约 30s
const TAU_CYL = 30;
const TAU_MANIFOLD = 5; // 总管热容小，跟随更快

function interp(x: number, table: [number, number][]) {
  if (x <= table[0][0]) return table[0][1];
  if (x >= table[table.length - 1][0]) return table[table.length - 1][1];
  for (let i = 1; i < table.length; i++) {
    const [x0, y0] = table[i - 1];
    const [x1, y1] = table[i];
    if (x <= x1) {
      const k = (x - x0) / (x1 - x0);
      return y0 + k * (y1 - y0);
    }
  }
  return 0;
}

export function stepExhaustTemp(state: EngineState, dt: number) {
  const target = interp(state.loadPct, LOAD_TEMP);

  for (let i = 0; i < 8; i++) {
    const targetCyl = target + CYL_BIAS[i];
    // 一阶积分逼近
    const drift = ((targetCyl - state.cylExhaust[i]) / TAU_CYL) * dt;
    // 小幅传感器噪声（不会累积，会被低通滤掉）
    const noise = (Math.random() - 0.5) * 0.6;
    state.cylExhaust[i] += drift + noise;
  }

  // 总管温度 = 各缸平均 - 5℃
  const avg = state.cylExhaust.reduce((s, v) => s + v, 0) / 8;
  const targetManifold = avg - 5;
  state.exhaustManifold +=
    ((targetManifold - state.exhaustManifold) / TAU_MANIFOLD) * dt +
    (Math.random() - 0.5) * 0.4;
}
