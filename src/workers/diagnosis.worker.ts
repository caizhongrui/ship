/**
 * 诊断 Worker (L3)
 * 纯固定规则；接收一份 state 快照，返回 Top-N 候选。
 *
 * 当前阶段按客户要求只保留"排温过高"故障的规则。
 */

import type { DiagResult, EngineState } from '@/types';

interface Rule {
  id: string;
  fault: string;
  priority: number;
  confidence: number;
  test: (s: EngineState) => string[];
  advice: string;
}

const RULES: Rule[] = [
  {
    id: 'R05',
    fault: '排气温度过高（喷油定时偏移 / 涡轮效率下降）',
    priority: 100,
    confidence: 0.92,
    test: s => {
      const ev: string[] = [];
      const overCyls: number[] = [];
      s.cylExhaust.forEach((v, i) => {
        if (v > 430) overCyls.push(i + 1);
      });
      if (overCyls.length >= 1) {
        const max = Math.max(...s.cylExhaust);
        ev.push(`${overCyls.length} 个缸排温超 430℃（${overCyls.map(n => n + '#').join('/')}缸，最高 ${max.toFixed(1)}℃）`);
      }
      if (s.exhaustManifold > 400)
        ev.push(`排烟总管温度 ${s.exhaustManifold.toFixed(0)}℃ > 400℃`);
      return ev.length >= 1 ? ev : [];
    },
    advice: `检查喷油提前角与喷油器密封性；\n核查涡轮增压器叶片状况及空冷器；\n清洗扫气箱积碳，必要时降负荷运行。\n点击"故障修复"按钮可清除当前故障并恢复正常运行。`
  }
];

self.onmessage = (e: MessageEvent) => {
  const msg = e.data;
  if (msg.type !== 'analyze') return;
  const state = msg.state as EngineState;

  const hits = RULES.map(r => ({ rule: r, evidence: r.test(state) }))
    .filter(x => x.evidence.length > 0)
    .sort((a, b) => b.rule.priority - a.rule.priority);

  const candidates = hits.slice(0, 3).map(h => ({
    fault: h.rule.fault,
    probability: h.rule.confidence,
    evidence: h.evidence,
    advice: h.rule.advice,
    trace: h.rule.id
  }));

  const result: DiagResult = {
    ts: Date.now() / 1000,
    candidates
  };

  postMessage({ type: 'result', result });
};
