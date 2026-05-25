/**
 * 启动剧本数据（来自客户提供 04.30 数据表）
 *
 * 0-300s 全程预设：每 5 秒一行，包含点火时间、当前档位、转速、负荷、排温、滑油压力。
 * 仿真器在脚本启用模式下按 t 插值产生当前值；
 * 用户一旦手动切换档位 → 脚本禁用、切到物理仿真。
 */
import type { TelegraphPosition } from '@/types';

export interface ScriptRow {
  t: number;
  tg: TelegraphPosition;
  rpm: number;
  load: number; // %
  exh: number; // ℃
  lube: number; // bar
}

export const STARTUP_TABLE: ScriptRow[] = [
  { t: 0, tg: 'STOP', rpm: 0, load: 0, exh: 26.6, lube: 2.1 },
  { t: 5, tg: 'DEAD_SLOW_AHEAD', rpm: 12, load: 10, exh: 155.7, lube: 2.5 },
  { t: 10, tg: 'DEAD_SLOW_AHEAD', rpm: 15.2, load: 11.2, exh: 168.1, lube: 2.64 },
  { t: 15, tg: 'DEAD_SLOW_AHEAD', rpm: 18.4, load: 14.2, exh: 179.4, lube: 2.96 },
  { t: 20, tg: 'DEAD_SLOW_AHEAD', rpm: 21.6, load: 17.8, exh: 189.4, lube: 3.34 },
  { t: 25, tg: 'DEAD_SLOW_AHEAD', rpm: 24.8, load: 20.8, exh: 197.2, lube: 3.66 },
  { t: 30, tg: 'SLOW_AHEAD', rpm: 28, load: 22, exh: 206.9, lube: 3.8 },
  { t: 35, tg: 'SLOW_AHEAD', rpm: 29.2, load: 22.4, exh: 219.3, lube: 3.81 },
  { t: 40, tg: 'SLOW_AHEAD', rpm: 30.3, load: 23.6, exh: 225.4, lube: 3.85 },
  { t: 45, tg: 'SLOW_AHEAD', rpm: 31.5, load: 25, exh: 231.4, lube: 3.9 },
  { t: 50, tg: 'SLOW_AHEAD', rpm: 32.7, load: 26.4, exh: 237.2, lube: 3.95 },
  { t: 55, tg: 'SLOW_AHEAD', rpm: 33.8, load: 27.6, exh: 242.7, lube: 3.99 },
  { t: 60, tg: 'SLOW_AHEAD', rpm: 35, load: 28, exh: 248.1, lube: 4.01 },
  { t: 65, tg: 'SLOW_AHEAD', rpm: 35.5, load: 28.3, exh: 253.2, lube: 4.01 },
  { t: 70, tg: 'SLOW_AHEAD', rpm: 36, load: 29, exh: 258.1, lube: 4.04 },
  { t: 75, tg: 'SLOW_AHEAD', rpm: 36.5, load: 30, exh: 262.8, lube: 4.08 },
  { t: 80, tg: 'SLOW_AHEAD', rpm: 37, load: 31, exh: 267.3, lube: 4.11 },
  { t: 85, tg: 'SLOW_AHEAD', rpm: 37.5, load: 31.7, exh: 271.6, lube: 4.14 },
  { t: 90, tg: 'SLOW_AHEAD', rpm: 38, load: 32, exh: 275.7, lube: 4.15 },
  { t: 95, tg: 'SLOW_AHEAD', rpm: 38.7, load: 32.4, exh: 279.6, lube: 4.15 },
  { t: 100, tg: 'SLOW_AHEAD', rpm: 39.3, load: 33.6, exh: 283.2, lube: 4.16 },
  { t: 105, tg: 'SLOW_AHEAD', rpm: 40, load: 35, exh: 286.6, lube: 4.18 },
  { t: 110, tg: 'SLOW_AHEAD', rpm: 40.7, load: 36.4, exh: 289.9, lube: 4.19 },
  { t: 115, tg: 'SLOW_AHEAD', rpm: 41.3, load: 37.6, exh: 292.9, lube: 4.2 },
  { t: 120, tg: 'HALF_AHEAD', rpm: 42, load: 38, exh: 295.7, lube: 4.2 },
  { t: 125, tg: 'HALF_AHEAD', rpm: 43.3, load: 38.7, exh: 298.3, lube: 4.21 },
  { t: 130, tg: 'HALF_AHEAD', rpm: 44.7, load: 40.6, exh: 300.7, lube: 4.23 },
  { t: 135, tg: 'HALF_AHEAD', rpm: 46, load: 43, exh: 303, lube: 4.25 },
  { t: 140, tg: 'HALF_AHEAD', rpm: 47.3, load: 45.4, exh: 305.3, lube: 4.27 },
  { t: 145, tg: 'HALF_AHEAD', rpm: 48.7, load: 47.3, exh: 307.7, lube: 4.29 },
  { t: 150, tg: 'HALF_AHEAD', rpm: 50, load: 48, exh: 310, lube: 4.3 },
  { t: 155, tg: 'HALF_AHEAD', rpm: 51, load: 48.9, exh: 312.3, lube: 4.31 },
  { t: 160, tg: 'HALF_AHEAD', rpm: 52, load: 51.1, exh: 314.7, lube: 4.35 },
  { t: 165, tg: 'HALF_AHEAD', rpm: 53, load: 54, exh: 317, lube: 4.4 },
  { t: 170, tg: 'HALF_AHEAD', rpm: 54, load: 56.9, exh: 319.3, lube: 4.45 },
  { t: 175, tg: 'HALF_AHEAD', rpm: 55, load: 59.1, exh: 321.7, lube: 4.49 },
  { t: 180, tg: 'FULL_AHEAD', rpm: 56, load: 60, exh: 324, lube: 4.5 },
  { t: 185, tg: 'FULL_AHEAD', rpm: 57, load: 61.1, exh: 326.3, lube: 4.5 },
  { t: 190, tg: 'FULL_AHEAD', rpm: 58, load: 63.9, exh: 328.7, lube: 4.5 },
  { t: 195, tg: 'FULL_AHEAD', rpm: 59, load: 67.5, exh: 331, lube: 4.5 },
  { t: 200, tg: 'FULL_AHEAD', rpm: 60, load: 71.1, exh: 333.3, lube: 4.5 },
  { t: 205, tg: 'FULL_AHEAD', rpm: 61, load: 73.9, exh: 335.7, lube: 4.5 },
  { t: 210, tg: 'FULL_AHEAD', rpm: 62, load: 75, exh: 338, lube: 4.5 },
  { t: 215, tg: 'FULL_AHEAD', rpm: 63, load: 76.3, exh: 340.3, lube: 4.5 },
  { t: 220, tg: 'FULL_AHEAD', rpm: 64, load: 79.4, exh: 342.7, lube: 4.5 },
  { t: 225, tg: 'FULL_AHEAD', rpm: 65, load: 83.5, exh: 345, lube: 4.5 },
  { t: 230, tg: 'FULL_AHEAD', rpm: 66, load: 87.6, exh: 347.3, lube: 4.5 },
  { t: 235, tg: 'FULL_AHEAD', rpm: 67, load: 90.7, exh: 349.7, lube: 4.5 },
  { t: 240, tg: 'NAV_FULL', rpm: 68, load: 92, exh: 352, lube: 4.5 },
  { t: 245, tg: 'NAV_FULL', rpm: 69.3, load: 92.4, exh: 354.3, lube: 4.5 },
  { t: 250, tg: 'NAV_FULL', rpm: 70.7, load: 93.6, exh: 356.7, lube: 4.5 },
  { t: 255, tg: 'NAV_FULL', rpm: 72, load: 95, exh: 359, lube: 4.5 },
  { t: 260, tg: 'NAV_FULL', rpm: 73.3, load: 96.4, exh: 361.3, lube: 4.51 },
  { t: 265, tg: 'NAV_FULL', rpm: 74.7, load: 97.6, exh: 363.7, lube: 4.51 },
  { t: 270, tg: 'NAV_FULL', rpm: 76, load: 98, exh: 366, lube: 4.51 },
  { t: 275, tg: 'NAV_FULL', rpm: 76.7, load: 98.1, exh: 368.3, lube: 4.51 },
  { t: 280, tg: 'NAV_FULL', rpm: 77.3, load: 98.5, exh: 370.7, lube: 4.51 },
  { t: 285, tg: 'NAV_FULL', rpm: 78, load: 99, exh: 373, lube: 4.51 },
  { t: 290, tg: 'NAV_FULL', rpm: 78.7, load: 99.5, exh: 375.3, lube: 4.51 },
  { t: 295, tg: 'NAV_FULL', rpm: 79.3, load: 99.9, exh: 377.7, lube: 4.51 },
  { t: 300, tg: 'NAV_FULL', rpm: 80, load: 100, exh: 380, lube: 4.51 }
];

export const SCRIPT_DURATION = 300; // 秒

/**
 * 给定时间 t，按 5s 表格双点线性插值，返回当时刻的脚本状态。
 * t > SCRIPT_DURATION 时返回 null，让物理仿真接管。
 */
export function getScriptedState(t: number): ScriptRow | null {
  if (t < 0 || t > SCRIPT_DURATION) return null;
  const TBL = STARTUP_TABLE;
  if (t <= TBL[0].t) return { ...TBL[0] };
  for (let i = 1; i < TBL.length; i++) {
    if (t <= TBL[i].t) {
      const a = TBL[i - 1];
      const b = TBL[i];
      const k = (t - a.t) / (b.t - a.t);
      return {
        t,
        tg: a.tg, // 档位用前一节点（阶跃）
        rpm: a.rpm + k * (b.rpm - a.rpm),
        load: a.load + k * (b.load - a.load),
        exh: a.exh + k * (b.exh - a.exh),
        lube: a.lube + k * (b.lube - a.lube)
      };
    }
  }
  return { ...TBL[TBL.length - 1] };
}
