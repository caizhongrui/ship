import type { AlarmEvent, EngineState } from '@/types';

interface RuleState {
  count: number;
  active: boolean;
}

interface Rule {
  id: string;
  level: 1 | 2 | 3;
  msg: string;
  threshold: number;
  holdSec: number;
  test: (s: EngineState) => boolean;
  read: (s: EngineState) => { tag: string; value: number };
}

/**
 * 报警规则库（当前阶段启用三类报警）：
 *   - 单缸排温超限（排气域）
 *   - 中间轴承温度过高（轴系域）
 *   - 轴系振动位移超限（轴系域）
 * 其他超速 / 超功率 / 扫气压力等暂时不启用，等需要时打开
 */
const RULES: Rule[] = [
  {
    id: 'A_CYL_EXH_HIGH',
    level: 3,
    msg: '各缸排温过高 (>450℃)',
    threshold: 450,
    holdSec: 3,
    test: s => s.cylExhaust.some(t => t > 450),
    read: s => ({
      tag: 'engine.cyl.*.exhaust_temp',
      value: Math.max(...s.cylExhaust)
    })
  },
  {
    id: 'A_BEARING_TEMP_HIGH',
    level: 3,
    msg: '中间轴承温度高（标称 55℃，报警值 58℃）',
    threshold: 58,
    holdSec: 0,
    test: s => s.bearingTemp >= 58,
    read: s => ({
      tag: 'shaft.bearing.intermediate.temp',
      value: s.bearingTemp
    })
  },
  {
    id: 'A_SHAFT_VIBRATION_HIGH',
    level: 3,
    msg: '中间轴振动过大（安装距离 2 mm，位移偏差 >0.20 mm）',
    threshold: 0.2,
    holdSec: 0,
    test: s => s.shaftVibration > 0.2,
    read: s => ({
      tag: 'vibration.shaft.rms',
      value: s.shaftVibration
    })
  }
];

export class AlarmEngine {
  private states = new Map<string, RuleState>();

  check(s: EngineState, dt: number): AlarmEvent[] {
    const fired: AlarmEvent[] = [];
    for (const r of RULES) {
      const st = this.states.get(r.id) || { count: 0, active: false };
      if (r.test(s)) {
        st.count += dt;
        if (st.count >= r.holdSec && !st.active) {
          st.active = true;
          const reading = r.read(s);
          fired.push({
            ts: Date.now() / 1000,
            id: r.id,
            level: r.level,
            tag: reading.tag,
            value: Number(reading.value.toFixed(2)),
            threshold: r.threshold,
            message: r.msg,
            acknowledged: false
          });
        }
      } else {
        st.count = 0;
        st.active = false;
      }
      this.states.set(r.id, st);
    }
    return fired;
  }

  reset() {
    this.states.clear();
  }
}
