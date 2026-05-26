/**
 * 诊断 Worker (L3)
 *
 * 规则严格按《青岛欧盛-天津海运数字孪生场景搭建项目数据 04.12》文档原文表格录入：
 *
 *   主机负荷增大触发条件：
 *     - 螺旋桨异常 / 轴系摩擦阻力增大 / 燃烧失衡 / 增压系统失效
 *   中间轴承温度过高（>75℃）故障原因与触发条件：
 *     - 润滑失效 / 对中偏差 / 轴承本体损伤 / 外部热传导
 *
 * 每条规则保留文档原表格四栏：故障类型 / 触发条件 / 阈值数据 / 典型场景。
 * 置信度遵循文档示例 "IF 轴承温度>75℃ THEN 故障原因=润滑失效（置信度85%）"，统一 85%。
 */

import type { DiagResult, EngineState } from '@/types';

interface Rule {
  id: string;
  fault: string; // 故障类型
  trigger: string; // 触发条件
  threshold: string; // 阈值数据
  scenario: string; // 典型场景
  priority: number;
  test: (s: EngineState) => boolean; // 是否命中
  evidence: (s: EngineState) => string[]; // 命中证据
}

// 来自文档：中间轴承温度过高（>75℃）故障原因与触发条件
const BEARING_RULES: Rule[] = [
  {
    id: 'B-润滑失效',
    fault: '润滑失效',
    trigger: '滑油污染/流量不足',
    threshold: '水分＞800 ppm 或流量＜180 L/min',
    scenario: '航程中滑油滤器压差突增＞0.3 bar',
    priority: 100,
    test: s => s.bearingTemp > 75,
    evidence: s => [
      `中间轴承温度 ${s.bearingTemp.toFixed(1)}℃ 超过 75℃ 报警阈值`,
      `触发条件：滑油污染 / 流量不足（水分>800 ppm 或流量<180 L/min）`,
      `典型场景：航程中滑油滤器压差突增>0.3 bar`
    ]
  },
  {
    id: 'B-对中偏差',
    fault: '对中偏差',
    trigger: '热态偏移超标',
    threshold: '径向＞0.08 mm / 轴向＞0.05 mm',
    scenario: '船舶搁浅后复航 + 机舱异响',
    priority: 95,
    test: s => s.bearingTemp > 75,
    evidence: s => [
      `中间轴承温度 ${s.bearingTemp.toFixed(1)}℃ 超过 75℃ 报警阈值`,
      `触发条件：热态偏移超标（径向>0.08 mm 或轴向>0.05 mm）`,
      `典型场景：船舶搁浅后复航 + 机舱异响`
    ]
  },
  {
    id: 'B-轴承本体损伤',
    fault: '轴承本体损伤',
    trigger: '巴氏合金层剥落',
    threshold: '间隙＞0.30 mm（标准 0.20–0.25 mm）',
    scenario: '长期过负荷运行（＞100% MCR）',
    priority: 90,
    test: s => s.bearingTemp > 75,
    evidence: s => [
      `中间轴承温度 ${s.bearingTemp.toFixed(1)}℃ 超过 75℃ 报警阈值`,
      `触发条件：巴氏合金层剥落（间隙>0.30 mm，标准 0.20-0.25 mm）`,
      `典型场景：长期过负荷运行（>100% MCR）`
    ]
  },
  {
    id: 'B-外部热传导',
    fault: '外部热传导',
    trigger: '毗邻高温部件',
    threshold: '环境温度＞65℃（红外测温验证）',
    scenario: '排气总管隔热层破损区域',
    priority: 85,
    test: s => s.bearingTemp > 75 && s.exhaustManifold > 400,
    evidence: s => [
      `中间轴承温度 ${s.bearingTemp.toFixed(1)}℃ 超过 75℃ 报警阈值`,
      `排烟总管温度 ${s.exhaustManifold.toFixed(0)}℃（>400℃ 可能影响相邻部件）`,
      `触发条件：毗邻高温部件（环境温度>65℃ 需红外测温验证）`,
      `典型场景：排气总管隔热层破损区域`
    ]
  }
];

// 来自文档：主机负荷增大触发条件
const LOAD_RULES: Rule[] = [
  {
    id: 'L-燃烧失衡',
    fault: '燃烧失衡',
    trigger: '多缸喷油量超标',
    threshold: '单缸爆压＞160 bar（设计值 150 bar）',
    scenario: '燃油分油机故障导致黏度＜180 cSt',
    priority: 80,
    test: s => s.cylExhaust.some(t => t > 430),
    evidence: s => {
      const maxT = Math.max(...s.cylExhaust);
      const overCyls: number[] = [];
      s.cylExhaust.forEach((v, i) => {
        if (v > 430) overCyls.push(i + 1);
      });
      const maxP = Math.max(...s.cylPmax);
      return [
        `${overCyls.map(n => n + '#').join('/')} 缸排温超 430℃（最高 ${maxT.toFixed(1)}℃）`,
        `单缸爆压 ${maxP.toFixed(0)} bar${maxP > 160 ? '（超 160 bar 设计上限）' : ''}`,
        `触发条件：多缸喷油量超标`,
        `典型场景：燃油分油机故障导致黏度<180 cSt`
      ];
    }
  },
  {
    id: 'L-增压系统失效',
    fault: '增压系统失效',
    trigger: '涡轮结焦/喷嘴环堵塞',
    threshold: '扫气压力＜0.3 MPa（100% 负荷时）',
    scenario: '使用高硫油（＞2.5%S）未定期水洗',
    priority: 75,
    test: s =>
      s.cylExhaust.some(t => t > 430) ||
      (s.loadPct > 80 && s.scavPressure < 3.0),
    evidence: s => {
      const ev: string[] = [];
      const maxT = Math.max(...s.cylExhaust);
      if (s.cylExhaust.some(t => t > 430))
        ev.push(`最高缸排温 ${maxT.toFixed(1)}℃ 超 430℃`);
      ev.push(
        `扫气压力 ${s.scavPressure.toFixed(2)} bar @ 负荷 ${s.loadPct.toFixed(0)}%`
      );
      ev.push(`触发条件：涡轮结焦 / 喷嘴环堵塞`);
      ev.push(`典型场景：使用高硫油（>2.5%S）未定期水洗`);
      return ev;
    }
  }
];

const ALL_RULES = [...BEARING_RULES, ...LOAD_RULES];

self.onmessage = (e: MessageEvent) => {
  const msg = e.data;
  if (msg.type !== 'analyze') return;
  const state = msg.state as EngineState;

  const hits = ALL_RULES.filter(r => r.test(state))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3);

  const candidates = hits.map(r => ({
    fault: `${r.fault}（${r.trigger}）`,
    probability: 0.85, // 文档示例置信度
    evidence: r.evidence(state),
    advice:
      `故障类型：${r.fault}\n` +
      `触发条件：${r.trigger}\n` +
      `阈值数据：${r.threshold}\n` +
      `典型场景：${r.scenario}\n\n` +
      `点击"故障修复"按钮可清除当前故障并恢复正常运行。`,
    trace: r.id
  }));

  const result: DiagResult = {
    ts: Date.now() / 1000,
    candidates
  };

  postMessage({ type: 'result', result });
};
