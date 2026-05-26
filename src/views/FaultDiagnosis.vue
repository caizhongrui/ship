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
            <h4>
              <span class="ai-tag">AI</span> 维修建议
              <span v-if="typing" class="thinking-dots">
                <span></span><span></span><span></span>
              </span>
            </h4>
            <pre class="advice">{{ typedAdvice }}<span v-if="typing" class="caret">▊</span></pre>
          </template>
          <div v-else class="empty">请在左侧选择候选故障</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue';
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

// === AI 打字机效果：每条候选故障"首次查看"时流式展示，再次查看直接显示 ===
const typedAdvice = ref('');
const typing = ref(false);
let typeTimer: number | null = null;
const seenTraces = new Set<string>(); // 已经动画展示过的故障 traceId

function startTyping(text: string) {
  if (typeTimer) clearInterval(typeTimer);
  typedAdvice.value = '';
  typing.value = true;
  let i = 0;
  typeTimer = window.setInterval(() => {
    if (i >= text.length) {
      clearInterval(typeTimer!);
      typeTimer = null;
      typing.value = false;
      return;
    }
    typedAdvice.value += text[i];
    i++;
  }, 35); // ~35ms / 字
}

function showAdvice(text: string, traceId: string) {
  if (seenTraces.has(traceId)) {
    // 这条故障之前已动画过 → 直接整段显示
    if (typeTimer) clearInterval(typeTimer);
    typeTimer = null;
    typedAdvice.value = text;
    typing.value = false;
  } else {
    // 首次查看 → 流式打字 + 记录
    startTyping(text);
    seenTraces.add(traceId);
  }
}

onUnmounted(() => {
  if (typeTimer) clearInterval(typeTimer);
});

const candidates = computed(() => d.latest?.candidates ?? []);
const active = computed(() => candidates.value[activeIdx.value]);

// 切换候选故障时刷新建议（每条故障首次查看动画，再次查看直接展示）
watch(
  () => active.value,
  cand => {
    if (!cand?.advice) {
      typedAdvice.value = '';
      typing.value = false;
      return;
    }
    showAdvice(cand.advice, cand.trace || cand.fault);
  },
  { immediate: true }
);

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
  // === 1. 根据用户选中的候选故障自动生成诊断报告 ===
  const selected = active.value ?? d.latest?.candidates?.[0];

  const symptom = alarms.history
    .slice(-5)
    .map(
      a =>
        `${new Date(a.ts * 1000).toLocaleTimeString()}  L${a.level} ${a.message} (${a.tag}=${a.value})`
    )
    .join('\n');

  // 故障原因分析 = 选中候选的"故障名 + 证据 + 处置建议"
  let cause = '';
  if (selected) {
    cause =
      `故障类型：${selected.fault}（置信度 ${(selected.probability * 100).toFixed(0)}%）\n\n` +
      `命中证据：\n  • ${selected.evidence.join('\n  • ')}\n\n` +
      `处置建议：\n${selected.advice}`;
  }

  // 修复后数据值（脚本 NAV FULL 稳态值）
  const repairedData =
    `主机转速：80.0 rpm\n` +
    `主机负荷：100.0 %\n` +
    `主机功率：42310 kW\n` +
    `滑油压力：4.51 bar\n` +
    `排烟总管温度：375.0 ℃\n` +
    `各缸排温（已恢复正常）：380.0 / 378.0 / 377.0 / 382.0 / 381.0 / 379.0 / 383.0 / 378.0 ℃\n` +
    `中间轴承温度：55.0 ℃`;

  const faultName = selected?.fault || '相关故障';
  const conclusion =
    `经诊断系统识别为「${faultName}」。\n` +
    `按建议进行现场处置后，故障已清除，主机各项参数恢复至额定运行范围。`;

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
  min-height: 70px;
}

/* AI 标签 */
.ai-tag {
  display: inline-block;
  background: linear-gradient(135deg, #4a4660, var(--c-accent));
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 8px;
  letter-spacing: 1px;
  margin-right: 4px;
  vertical-align: 1px;
}

/* 思考中的三点 */
.thinking-dots {
  display: inline-flex;
  gap: 3px;
  margin-left: 6px;
  vertical-align: middle;
}
.thinking-dots span {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--c-accent);
  animation: tdots 1.2s infinite ease-in-out;
}
.thinking-dots span:nth-child(2) {
  animation-delay: 0.2s;
}
.thinking-dots span:nth-child(3) {
  animation-delay: 0.4s;
}
@keyframes tdots {
  0%, 60%, 100% {
    opacity: 0.2;
    transform: translateY(0);
  }
  30% {
    opacity: 1;
    transform: translateY(-3px);
  }
}

/* 打字光标 */
.caret {
  display: inline-block;
  color: var(--c-accent);
  margin-left: 1px;
  animation: blink 0.9s steps(2, start) infinite;
  font-weight: 700;
}
@keyframes blink {
  to {
    opacity: 0;
  }
}
</style>
