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
 * 报警规则库（按客户要求，当前阶段只保留"排温过高"一类故障，
 * 其他超速 / 超功率 / 扫气压力 / 轴承等暂时不启用）
 */
const RULES: Rule[] = [
  {
    id: 'A_CYL_EXH_HIGH',
    level: 3,
    msg: '单缸排温超限 (>430℃)',
    threshold: 430,
    holdSec: 3,
    test: s => s.cylExhaust.some(t => t > 430),
    read: s => ({
      tag: 'engine.cyl.*.exhaust_temp',
      value: Math.max(...s.cylExhaust)
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
