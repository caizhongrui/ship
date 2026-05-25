<template>
  <div class="diag page">
    <div class="grid">
      <!-- 顶部条 -->
      <div class="ind-panel ctrl-bar">
        <div class="ctrl-left">
          <button
            class="big-btn primary"
            :disabled="d.running || session.running"
            @click="onAnalyze"
          >
            {{ d.running ? '分析中...' : '分 析 当 前 状 态' }}
          </button>
          <button
            class="big-btn warn"
            :disabled="!hasFault || session.running"
            @click="onRepair"
          >
            故 障 修 复
          </button>
          <button class="big-btn ghost" :disabled="!candidates.length" @click="onExport">
            导 出 报 告
          </button>
          <span class="hint" :class="{ 'is-blocked': session.running }">
            {{ session.running ? '⚠ 请先点击侧栏"停止"按钮再进行诊断' : '基于规则库 IF-THEN 正向推理' }}
          </span>
        </div>
        <div class="ctrl-right">
          <span class="kv">转速 <b class="num">{{ t.state.rpm.toFixed(1) }}</b> rpm</span>
          <span class="kv">负荷 <b class="num">{{ t.state.loadPct.toFixed(1) }}</b> %</span>
          <span class="kv">总管温 <b class="num">{{ t.state.exhaustManifold.toFixed(0) }}</b> ℃</span>
          <span class="kv">最大缸温 <b class="num">{{ maxCylTemp.toFixed(0) }}</b> ℃</span>
        </div>
      </div>

      <!-- 左：候选故障 -->
      <div class="ind-panel candidates">
        <div class="ind-panel__title">候 选 故 障 (Top 3)</div>
        <div class="ind-panel__body cand-body">
          <div v-if="!candidates.length" class="empty">
            点击上方按钮开始分析
          </div>
          <div
            v-for="(c, i) in candidates"
            :key="i"
            class="cand-card"
            :class="{ 'is-active': activeIdx === i }"
            @click="activeIdx = i"
          >
            <div class="cand-head">
              <span class="rank">#{{ i + 1 }}</span>
              <span class="fault-name">{{ c.fault }}</span>
              <span class="prob num">{{ (c.probability * 100).toFixed(0) }}%</span>
            </div>
            <div class="prob-bar">
              <div class="prob-fill" :style="{ width: c.probability * 100 + '%' }"></div>
            </div>
            <div class="trace">规则 {{ c.trace }}</div>
          </div>
        </div>
      </div>

      <!-- 右：推理链与建议 -->
      <div class="ind-panel detail">
        <div class="ind-panel__title">推 理 链 与 维 修 建 议</div>
        <div class="ind-panel__body detail-body">
          <template v-if="active">
            <h3>{{ active.fault }}</h3>
            <h4>命中证据</h4>
            <ul class="evidence">
              <li v-for="(e, i) in active.evidence" :key="i">{{ e }}</li>
            </ul>
            <h4>维修建议</h4>
            <pre class="advice">{{ active.advice }}</pre>
          </template>
          <div v-else class="empty">请在左侧选择候选故障</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { useTelemetryStore } from '@/stores/telemetry';
import { useDiagnosisStore } from '@/stores/diagnosis';
import { useSessionStore } from '@/stores/session';
import { useAlarmStore } from '@/stores/alarms';
import { useReportStore } from '@/stores/report';
import { diagAnalyze, simClearFault } from '@/engine/simRuntime';

const t = useTelemetryStore();
const d = useDiagnosisStore();
const session = useSessionStore();
const alarms = useAlarmStore();
const reportStore = useReportStore();
const activeIdx = ref(0);

const candidates = computed(() => d.latest?.candidates ?? []);
const active = computed(() => candidates.value[activeIdx.value]);

const maxCylTemp = computed(() =>
  t.state.cylExhaust.length ? Math.max(...t.state.cylExhaust) : 0
);

const hasFault = computed(() => {
  const f = t.state.faults || {};
  return Object.values(f).some((x: any) => x?.active);
});

function onAnalyze() {
  activeIdx.value = 0;
  diagAnalyze();
}

async function onRepair() {
  // === 1. 先用当前故障数据自动生成诊断报告（保存进 reportStore）===
  const s = t.state;
  const symptom = alarms.history
    .slice(-5)
    .map(
      a =>
        `${new Date(a.ts * 1000).toLocaleTimeString()}  L${a.level} ${a.message} (${a.tag}=${a.value})`
    )
    .join('\n');

  let cause = '';
  if (d.latest?.candidates.length) {
    const top = d.latest.candidates[0];
    cause =
      `${top.fault}（置信度 ${(top.probability * 100).toFixed(0)}%）\n` +
      `证据：\n  • ${top.evidence.join('\n  • ')}`;
  }

  // 故障前最大缸温（5#）
  const maxCyl = Math.max(...s.cylExhaust);
  const maxCylIdx = s.cylExhaust.indexOf(maxCyl) + 1;

  // 修复后期望（脚本 NAV FULL 稳态值）
  const repairedData =
    `主机转速：80.0 rpm\n` +
    `主机负荷：100.0 %\n` +
    `主机功率：42310 kW\n` +
    `滑油压力：4.51 bar\n` +
    `排烟总管温度：375.0 ℃\n` +
    `各缸排温（已恢复正常）：380.0 / 378.0 / 377.0 / 382.0 / 381.0 / 379.0 / 383.0 / 378.0 ℃\n` +
    `中间轴承温度：55.0 ℃`;

  const conclusion = `已识别 ${maxCylIdx}# 缸排温超限故障（峰值 ${maxCyl.toFixed(1)}℃，超过 430℃ 报警阈值）。\n经诊断系统分析与现场处置，故障已修复，主机各项参数恢复至额定运行范围。`;

  await reportStore.load();
  await reportStore.save({
    user: session.user || 'Guest',
    scenario: session.scenario,
    form: {
      shipName: '',
      imo: '',
      shipyard: '',
      hullNo: '',
      engineModel: 'MAN B&W 8G95ME-C',
      engineNo: '',
      engineBuilder: '',
      location: '',
      diagDate: new Date().toISOString().slice(0, 10),
      symptom,
      cause,
      repairedData,
      conclusion,
      signature: session.user || ''
    }
  });

  // === 2. 真正清除故障（软重放） ===
  simClearFault();
  d.reset();
  alarms.active.splice(0);

  ElMessage.success('故障已修复，诊断报告已自动保存到"报表查询"页');
}

/**
 * 导出诊断报告（JSON 文件，浏览器内置下载）
 * 由于纯本地，无需后端接口
 */
function onExport() {
  const report = {
    generatedAt: new Date().toISOString(),
    sessionId: session.id,
    user: session.user,
    scenario: session.scenario,
    simTime: t.state.t,
    snapshot: {
      rpm: t.state.rpm,
      loadPct: t.state.loadPct,
      power: t.state.power,
      exhaustManifold: t.state.exhaustManifold,
      maxCylTemp: maxCylTemp.value,
      bearingTemp: t.state.bearingTemp,
      scavPressure: t.state.scavPressure,
      lubeOilPressure: t.state.lubeOilPressure,
      cylExhaust: t.state.cylExhaust.slice()
    },
    diagnosis: d.latest,
    activeFaults: Object.entries(t.state.faults || {})
      .filter(([, v]: any) => v?.active)
      .map(([k, v]) => ({ name: k, params: v }))
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: 'application/json;charset=utf-8'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `diagnosis_${session.id || 'report'}_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
</script>

<style scoped>
.page {
  padding: 8px;
  height: 100%;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1.3fr;
  grid-template-rows: 60px 1fr;
  gap: 8px;
  height: 100%;
}
.ctrl-bar {
  grid-column: 1 / span 2;
  flex-direction: row;
  display: flex;
  align-items: center;
  padding: 0 12px;
  justify-content: space-between;
}
.ctrl-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.ctrl-right {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: var(--c-text-2);
}
.kv b {
  color: var(--c-text);
  font-size: 16px;
  margin: 0 4px;
}
.big-btn {
  border: none;
  padding: 8px 18px;
  font-size: 13px;
  letter-spacing: 2px;
  cursor: pointer;
  font-weight: 700;
  border-radius: 2px;
  color: #fff;
}
.big-btn.primary {
  background: var(--c-accent);
}
.big-btn.warn {
  background: var(--c-warn);
  color: #000;
}
.big-btn.ghost {
  background: transparent;
  border: 1px solid var(--c-border-soft);
  color: var(--c-text);
}
.big-btn:hover:not(:disabled) {
  filter: brightness(1.1);
}
.big-btn:disabled {
  background: #555;
  color: #aaa;
  cursor: not-allowed;
  border-color: #555;
}
.hint {
  color: var(--c-text-muted);
  font-size: 12px;
}
.hint.is-blocked {
  color: var(--c-accent);
  font-weight: 600;
}

.cand-body,
.detail-body {
  overflow: auto;
}
.cand-card {
  border: 1px solid var(--c-border-soft);
  background: var(--c-bg-panel-alt);
  padding: 10px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.15s;
}
.cand-card:hover {
  border-color: var(--c-text-2);
}
.cand-card.is-active {
  border-color: var(--c-accent);
  background: rgba(255, 45, 45, 0.08);
}
.cand-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.rank {
  color: var(--c-warn);
  font-weight: 700;
  margin-right: 8px;
}
.fault-name {
  flex: 1;
  font-size: 14px;
  color: var(--c-text);
}
.prob {
  color: var(--c-accent);
  font-weight: 700;
  font-size: 16px;
}
.prob-bar {
  height: 6px;
  background: var(--c-border-soft);
  border-radius: 2px;
}
.prob-fill {
  height: 100%;
  background: var(--c-accent);
  border-radius: 2px;
  transition: width 0.3s;
}
.trace {
  font-size: 11px;
  color: var(--c-text-muted);
  margin-top: 4px;
}
.empty {
  text-align: center;
  color: var(--c-text-muted);
  padding: 40px;
}
h3 {
  color: var(--c-accent);
  margin: 0 0 12px;
}
h4 {
  color: var(--c-text-2);
  margin: 12px 0 4px;
  font-size: 13px;
}
.evidence {
  margin: 0;
  padding-left: 20px;
  color: var(--c-text);
  font-size: 13px;
  line-height: 1.8;
}
.advice {
  background: var(--c-bg-panel-alt);
  border: 1px solid var(--c-border-soft);
  padding: 10px;
  white-space: pre-wrap;
  font-family: var(--font-cn);
  color: var(--c-text);
  font-size: 13px;
  line-height: 1.7;
  margin: 0;
}
</style>
