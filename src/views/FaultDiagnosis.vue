<template>
  <div class="diag page">
    <!-- 顶部条 -->
    <div class="ind-panel ctrl-bar">
      <div class="ctrl-left">
        <button
          class="big-btn primary"
          :disabled="session.running"
          @click="onAnalyze"
        >
          {{ snapshot ? '重 新 分 析' : '分 析 当 前 状 态' }}
        </button>
        <button
          class="big-btn warn"
          :disabled="!hasFault || session.running"
          @click="onRepair"
        >
          故 障 修 复
        </button>
        <span class="hint" :class="{ 'is-blocked': session.running }">
          {{
            session.running
              ? '⚠ 请先点击侧栏"停止"按钮再进行诊断'
              : '基于 AI 模型的多维故障分析'
          }}
        </span>
      </div>
      <div class="ctrl-right">
        <span class="kv">
          转速 <b class="num">{{ t.state.rpm.toFixed(1) }}</b> rpm
        </span>
        <span class="kv">
          最大缸温 <b class="num">{{ maxCylTemp.toFixed(1) }}</b> ℃
        </span>
        <span class="kv">
          轴承温 <b class="num">{{ t.state.bearingTemp.toFixed(1) }}</b> ℃
        </span>
      </div>
    </div>

    <div class="content">
      <!-- 左：报警证据 -->
      <div class="ind-panel evidence-panel">
        <div class="ind-panel__title">报 警 证 据</div>
        <div class="ind-panel__body evidence-body">
          <div v-if="!snapshot" class="empty">
            点击上方 "分 析 当 前 状 态" 按钮开始诊断
          </div>
          <template v-else>
            <!-- 无任何异常 -->
            <div v-if="!snapshot.hasFault" class="ev-card normal">
              <div class="ev-head">
                <span class="ev-tag ok">OK</span>
                <span class="ev-name">系统运行正常</span>
              </div>
              <div class="ev-value">
                未检测到故障<br />
                <span class="ev-detail">
                  最高缸温 <b class="num">{{ snapshot.maxCyl.toFixed(1) }}</b>℃
                  ＜ 390℃ &nbsp;|&nbsp;
                  轴承温度 <b class="num">{{ snapshot.bearingTemp.toFixed(1) }}</b>℃
                  ＜ 75℃
                </span>
              </div>
            </div>

            <!-- 有异常：分别显示对应卡片 -->
            <div v-if="snapshot.cylOver" class="ev-card cyl">
              <div class="ev-head">
                <span class="ev-tag">L3</span>
                <span class="ev-name">各缸排温过高</span>
              </div>
              <div class="ev-value">
                各缸排温超 390℃<br />
                <span class="ev-detail">
                  当前最高 <b class="num">{{ snapshot.maxCyl.toFixed(1) }}</b>℃（超阈值
                  <b class="num">{{ (snapshot.maxCyl - 390).toFixed(1) }}</b>℃）
                </span>
              </div>
            </div>

            <div v-if="snapshot.bearingOver" class="ev-card bearing">
              <div class="ev-head">
                <span class="ev-tag">L3</span>
                <span class="ev-name">中间轴承温度过高</span>
              </div>
              <div class="ev-value">
                <span class="num">{{ snapshot.bearingTemp.toFixed(1) }}</span>℃<br />
                <span class="ev-detail">
                  超阈值
                  <b class="num">{{ (snapshot.bearingTemp - 75).toFixed(1) }}</b>℃（标称 75℃）
                </span>
              </div>
            </div>

            <div class="ev-meta">
              <span>分析时刻：{{ snapshot.analyzedAt }}</span>
              <span>转速 {{ snapshot.rpm.toFixed(1) }} rpm</span>
              <span>负荷 {{ snapshot.loadPct.toFixed(0) }} %</span>
            </div>
          </template>
        </div>
      </div>

      <!-- 右：AI 流式分析 -->
      <div class="ind-panel ai-panel">
        <div class="ind-panel__title">
          <span class="ai-tag">AI</span> 故 障 分 析 及 维 修 建 议
          <span v-if="typing" class="thinking-dots">
            <span></span><span></span><span></span>
          </span>
        </div>
        <div class="ind-panel__body ai-body">
          <div v-if="!snapshot" class="empty">等待分析</div>
          <pre v-else class="advice">{{ typedAdvice }}<span
              v-if="typing"
              class="caret"
              >▊</span
            ></pre>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { ElMessage } from 'element-plus';
import { useTelemetryStore } from '@/stores/telemetry';
import { useSessionStore } from '@/stores/session';
import { useAlarmStore } from '@/stores/alarms';
import { useReportStore } from '@/stores/report';
import { simClearFault, simSetMode } from '@/engine/simRuntime';

const t = useTelemetryStore();
const session = useSessionStore();
const alarms = useAlarmStore();
const reportStore = useReportStore();

const FULL_ADVICE_BOTH = `一、故障分析
本次多参数联动异常不属于主机燃油、进气、冷却系统单体故障，核心故障根源为船舶轴系及螺旋桨运行阻力异常增大，引发整机超负荷连锁故障。外部负载超限导致主机持续高负荷做功、循环供油量被动增加，进而出现全域气缸排温超标，同时额外轴系载荷造成中间轴承摩擦过载、温度超限报警。

二、诊断结论（置信度 97%）
确诊为外部负载过载引发的主机、轴系连锁故障。核心故障为螺旋桨缠物、桨叶破损、中间轴承润滑冷却异常、轴承间隙过小、负荷过大。

三、维修建议
1. 轴系盘车检测：停机后手动盘车，若盘车阻力显著偏大，可确认轴系、螺旋桨存在阻力异常；
2. 螺旋桨检测清理：安排潜水作业，全面检查桨叶状态，彻底清理缠绕杂物，检查桨叶是否变形、破损、蚀损；
3. 中间轴承系统检修：检查滑油油位、油质、油压，排查冷却管路堵塞、阀门故障；检查轴承间隙及负荷。`;

const ADVICE_CYL_ONLY = `各缸排温过高，多为本缸供油异常、雾化不良、压缩不良、排气不畅、缸套活塞漏气、喷油控制故障。
建议检查喷油器启阀压力是否异常、高压油泵及燃油定时导致单缸供油量过大；
建议检查排气阀及液压驱动系统，排气阀延迟开启且开度不足导致换气不充分等原因。`;

const ADVICE_BEARING_ONLY = `中间轴承温度超温，极大可能原因为中间轴承负荷过大。
建议测量轴承实际负荷，在轴承附近用液压千斤顶替代轴承支撑轴系，通过压力和位移的曲线图来推算出实际负荷；
建议检查轴系润滑系统问题，轴承内滑油流失是导致高温的可能原因；
建议检查轴承间隙，径向间隙过小引起破坏油膜引起摩擦过热等原因。`;

const ADVICE_NORMAL = `经多维参数综合分析，当前主机运行正常，未发现任何异常工况：

  • 各缸排气温度均在正常范围（最高 < 390℃ 报警阈值）
  • 中间轴承温度正常（< 75℃ 报警阈值）
  • 主机转速、负荷、滑油压力等核心参数均稳定在额定范围内

无需进行故障处置，继续保持当前运行状态即可。`;

interface Snapshot {
  hasFault: boolean;
  cylOver: boolean;
  bearingOver: boolean;
  maxCyl: number;
  bearingTemp: number;
  rpm: number;
  loadPct: number;
  analyzedAt: string;
}

const snapshot = ref<Snapshot | null>(null);

const maxCylTemp = computed(() =>
  t.state.cylExhaust.length ? Math.max(...t.state.cylExhaust) : 0
);

const hasFault = computed(() => {
  // 1) 当前 fault.active；2) 本轮报警历史里出现过的高温报警（停止冷却后仍能修复）
  const f = t.state.faults || {};
  if (Object.values(f).some((x: any) => x?.active)) return true;
  return alarms.history.some(
    e => e.id === 'A_CYL_EXH_HIGH' || e.id === 'A_BEARING_TEMP_HIGH'
  );
});

// === AI 打字机：首次流式，再次直接展示 ===
const typedAdvice = ref('');
const typing = ref(false);
let typeTimer: number | null = null;
let hasAnimatedOnce = false;

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
  }, 30);
}

function showAdvice(text: string) {
  if (!hasAnimatedOnce) {
    startTyping(text);
    hasAnimatedOnce = true;
  } else {
    if (typeTimer) clearInterval(typeTimer);
    typeTimer = null;
    typedAdvice.value = text;
    typing.value = false;
  }
}

function onAnalyze() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');

  // === 故障识别同时看「当前状态」和「本轮报警历史」===
  // 停止后会冷却，瞬时温度可能已跌破阈值，但本轮内确实发生过故障，应纳入诊断
  const cylCur = maxCylTemp.value;
  const btCur = t.state.bearingTemp;
  // 报警历史里峰值（用于显示）
  let cylPeak = cylCur;
  let bearingPeak = btCur;
  let cylHistory = false;
  let bearingHistory = false;
  for (const ev of alarms.history) {
    if (ev.id === 'A_CYL_EXH_HIGH') {
      cylHistory = true;
      if (typeof ev.value === 'number' && ev.value > cylPeak) cylPeak = ev.value;
    } else if (ev.id === 'A_BEARING_TEMP_HIGH') {
      bearingHistory = true;
      if (typeof ev.value === 'number' && ev.value > bearingPeak) bearingPeak = ev.value;
    }
  }
  const cylOver = cylHistory || cylCur > 390;
  const bearingOver = bearingHistory || btCur > 75;

  snapshot.value = {
    hasFault: cylOver || bearingOver,
    cylOver,
    bearingOver,
    maxCyl: cylPeak,
    bearingTemp: bearingPeak,
    rpm: t.state.rpm,
    loadPct: t.state.loadPct,
    analyzedAt: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  };

  // 主线场景：两类报警都触发过 → 走权威三段式分析
  let advice = ADVICE_NORMAL;
  if (cylOver && bearingOver) advice = FULL_ADVICE_BOTH;
  else if (cylOver) advice = ADVICE_CYL_ONLY;
  else if (bearingOver) advice = ADVICE_BEARING_ONLY;
  showAdvice(advice);
}

async function onRepair() {
  const snap = snapshot.value;

  const symptom = alarms.history
    .slice(-5)
    .map(
      a =>
        `${new Date(a.ts * 1000).toLocaleTimeString()}  L${a.level} ${a.message} (${a.tag}=${a.value})`
    )
    .join('\n');

  // 按 snapshot 命中的故障选取对应的完整分析建议文本
  let adviceText = '';
  if (snap) {
    if (snap.cylOver && snap.bearingOver) adviceText = FULL_ADVICE_BOTH;
    else if (snap.cylOver) adviceText = ADVICE_CYL_ONLY;
    else if (snap.bearingOver) adviceText = ADVICE_BEARING_ONLY;
    else adviceText = ADVICE_NORMAL;
  }
  // 故障原因分析 = 直接引用完整三段式分析文本（一、故障分析 / 二、诊断结论 / 三、维修建议）
  const cause = adviceText;

  const repairedData =
    `车钟档位：STOP（待机）\n` +
    `主机转速：0.0 rpm\n` +
    `主机负荷：0.0 %\n` +
    `主机功率：0 kW\n` +
    `滑油压力：3.1 bar（备用泵维持）\n` +
    `排烟总管温度：35.0 ℃\n` +
    `各缸排温（已恢复正常）：35.0 / 35.0 / 35.0 / 35.0 / 35.0 / 35.0 / 35.0 / 35.0 ℃\n` +
    `中间轴承温度：30.0 ℃`;

  const conclusion = `经 AI 智能诊断系统识别（置信度 97%），确诊为外部负载过载引发的主机、轴系连锁故障——核心故障为螺旋桨缠物、桨叶破损，中间轴承润滑冷却异常、轴承间隙过小、负荷过大。\n按维修建议进行轴系盘车检测、潜水清理桨叶缠绕物、中间轴承系统检修后，故障已彻底清除，主机停车在 STOP 待机状态，所有参数恢复至额定无故障值。`;

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

  // 清除故障 → 主机进入 STOP 待机
  simClearFault();
  simSetMode(session.mode); // 保持当前驾控/集控模式
  session.setTelegraph('STOP');
  session.stopSim(); // running=false，等待用户重新驱动（驾控点开始 / 集控点档位）
  alarms.active.splice(0);
  alarms.history.splice(0); // 清空报警历史，hasFault 回到 false
  snapshot.value = null;
  typedAdvice.value = '';

  ElMessage.success('故障已修复，诊断报告已自动保存到"报告查询"页');
}

onMounted(() => {
  // 进入诊断页时若已不在运行态且本轮触发过故障，自动跑一次分析
  if (!session.running && hasFault.value && !snapshot.value) {
    onAnalyze();
  }
});

onUnmounted(() => {
  if (typeTimer) clearInterval(typeTimer);
});
</script>

<style scoped>
.page {
  padding: 8px;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ctrl-bar {
  flex-shrink: 0;
  height: 56px;
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
.big-btn:hover:not(:disabled) {
  filter: brightness(1.1);
}
.big-btn:disabled {
  background: #999;
  color: #ddd;
  cursor: not-allowed;
}
.hint {
  color: var(--c-text-muted);
  font-size: 12px;
}
.hint.is-blocked {
  color: var(--c-accent);
  font-weight: 600;
}

.content {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 8px;
  min-height: 0;
}

.evidence-body,
.ai-body {
  overflow: auto;
  padding: 16px;
}
.empty {
  text-align: center;
  color: var(--c-text-muted);
  padding: 60px 20px;
  font-size: 13px;
}

/* === 证据卡片 === */
.ev-card {
  background: rgba(199, 59, 59, 0.06);
  border: 1px solid rgba(199, 59, 59, 0.4);
  border-left: 4px solid var(--c-accent);
  border-radius: 4px;
  padding: 14px 16px;
  margin-bottom: 12px;
}
/* 正常态：绿色 */
.ev-card.normal {
  background: rgba(122, 180, 124, 0.10);
  border-color: rgba(122, 180, 124, 0.5);
  border-left-color: var(--c-ok);
}
.ev-card.normal .ev-tag {
  background: var(--c-ok);
}
.ev-card.normal .ev-value b {
  color: var(--c-ok);
}
.ev-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.ev-tag {
  background: var(--c-accent);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 3px;
  letter-spacing: 1px;
}
.ev-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--c-text);
}
.ev-value {
  font-size: 14px;
  color: var(--c-text);
  line-height: 1.7;
}
.ev-value b {
  font-size: 17px;
  color: var(--c-accent);
  margin: 0 3px;
}
.ev-detail {
  font-size: 12px;
  color: var(--c-text-2);
}
.ev-detail b {
  font-size: 13px;
}

.ev-meta {
  display: flex;
  gap: 14px;
  font-size: 11px;
  color: var(--c-text-muted);
  border-top: 1px dashed var(--c-border-soft);
  padding-top: 10px;
  margin-top: 6px;
  letter-spacing: 1px;
}

/* === AI 区 === */
.advice {
  background: var(--c-bg-panel-alt);
  border: 1px solid var(--c-border-soft);
  padding: 16px 18px;
  white-space: pre-wrap;
  font-family: var(--font-cn);
  color: var(--c-text);
  font-size: 14px;
  line-height: 2;
  margin: 0;
  min-height: 200px;
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
  0%,
  60%,
  100% {
    opacity: 0.2;
    transform: translateY(0);
  }
  30% {
    opacity: 1;
    transform: translateY(-3px);
  }
}

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
