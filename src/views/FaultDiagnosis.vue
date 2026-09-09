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
          开 始 分 析
        </button>
        <button
          class="big-btn warn"
          :disabled="!snapshot || !snapshot.hasFault || session.running"
          @click="onRepair"
        >
          故 障 修 复
        </button>
        <div class="model-selector">
          <span class="model-label">AI 模型</span>
          <el-select
            v-model="selectedModel"
            class="model-select"
            popper-class="diag-model-popper"
            aria-label="选择故障诊断模型"
            @change="onModelChange"
          >
            <el-option
              v-for="model in modelOptions"
              :key="model"
              :label="model"
              :value="model"
            />
          </el-select>
        </div>
        <span v-if="session.running" class="hint is-blocked">
          ⚠ 请先点击侧栏"停止"按钮再进行诊断
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
            请选择 AI 模型，然后点击上方 "开 始 分 析" 按钮开始诊断
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
                  ＜ 450℃ &nbsp;|&nbsp;
                  轴承温度 <b class="num">{{ snapshot.bearingTemp.toFixed(1) }}</b>℃
                  ＜ 58℃（标称 55℃）
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
                各缸排温超 450℃<br />
                <span class="ev-detail">
                  当前最高 <b class="num">{{ snapshot.maxCyl.toFixed(1) }}</b>℃（超阈值
                  <b class="num">{{ (snapshot.maxCyl - 450).toFixed(1) }}</b>℃）
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
                  <b class="num">{{ (snapshot.bearingTemp - 55).toFixed(1) }}</b>℃（标称 55℃，报警值 58℃）
                </span>
              </div>
            </div>

            <div v-if="snapshot.vibrationOver" class="ev-card vibration">
              <div class="ev-head">
                <span class="ev-tag">L3</span>
                <span class="ev-name">中间轴振动过大</span>
              </div>
              <div class="ev-value">
                <span class="num">{{ snapshot.vibration.toFixed(2) }}</span> mm<br />
                <span class="ev-detail">
                  非接触式传感器安装距离 2 mm，振动位移偏差大于 0.20 mm
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
import { computed, ref, onUnmounted } from 'vue';
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

const modelOptions = ['SFD-LLM', 'Qwen3', 'Deepseek-7B'] as const;
type ModelName = (typeof modelOptions)[number];
const selectedModel = ref<ModelName>('SFD-LLM');

const FINAL_ADVICE_BY_MODEL: Record<ModelName, string> = {
  'SFD-LLM': `一、故障分析
本次中间轴振动位移超标、中间轴承温度高报警属于轴系运行异常引发的共性连锁现象，可由多项轴系及基座故障共同诱发。核心故障根源为船舶轴系装配偏差、运行工况异常及基座结构刚度缺陷叠加，引发轴系运转稳定性下降连锁故障。轴系对中偏差、轴承间隙不当、润滑冷却不良、轴承基座加强筋强度不足、底座对位偏移等各类问题，均会导致轴系运行振动增大，振动位移持续超标，同时异常轴系载荷造成中间轴承摩擦过载、产热加剧，超出冷却润滑散热能力，最终造成轴承温度超限报警。

二、诊断结论(置信度98%)
确诊为轴系装配、运行负载及基座结构缺陷叠加引发的轴系连锁故障。核心故障如下：
1.中间轴轴承安装位置故障，轴系对中偏差超标，轴承基座加强筋强度不足、刚度不足、底座安装对位不正造成中间轴承装配间隙不合理；
2.轴系对中偏差超标：中间轴法兰处偏移值和曲折值超差；
3.中间轴轴承冷却水系统故障：冷却水温度、流量异常；
4.中间轴轴承滑油系统检查：滑油变质、脏堵，不能形成润滑油膜；
5.传感器链接故障：传感器接线异常、信号传输异常。

三、维修建议
1.轴系盘车检查：停机后手动盘车，若盘车阻力不均、运转平顺性差，可确认轴系装配、传动存在异常；
2.滑冷却系统检修：检查轴承滑油油位、油质、排查冷却管路堵塞、阀门故障，排除润滑冷却异常问题；
3.传感器故障检查：重点检查传感器连接是否出现异常；
4.轴系对中检查：复测中间轴法兰处偏移值和曲折值；
5.基座结构检测加固及精度检测：核查轴承底座与加强筋对位状态，检查基座结构强度，对底座落于板材空档、受力薄弱区域进行补焊加固，提升基座整体刚度，消除结构振动诱因；
6.中间轴承装配检测：复测轴系轴承装配间隙与负荷，排查装配偏差隐患。`,
  Qwen3: `一、故障分析
本次中间轴振动位移超标与中间轴承温度高报警，属于轴系运行异常引发的连锁故障，可由多项轴系及基座故障共同诱发。核心根源在于轴系装配偏差、运行工况异常及基座结构刚度缺陷三者叠加，导致轴系运转稳定性下降。
具体表现为：轴系对中偏差、轴承间隙不当、润滑冷却不良、轴承基座加强筋强度不足、底座对位偏移等问题，均会引起轴系振动加剧、位移持续超标；同时，异常轴系载荷造成中间轴承摩擦过载、产热加剧，超出冷却润滑系统的散热能力，最终触发轴承温度超限报警。

二、诊断结论（置信度97%）
确诊为轴系装配、运行负载及基座结构缺陷叠加所致的轴系连锁故障。主要故障点如下：
1.轴承润滑冷却系统异常
2.轴系对中偏差超标
3.轴承基座加强筋强度及刚度不足
4.底座安装对位不正
5.中间轴承装配间隙不合理

三、维修建议
1.轴系盘车检查：停机后手动盘车，若盘车阻力不均、运转平顺性差，可确认轴系装配及传动存在异常；
2.润滑冷却系统检修：检查轴承滑油的油位、油质、油压，排查冷却管路堵塞及阀门故障，排除润滑冷却异常问题；
3.轴系对中检查：复测中间轴法兰处的偏移值和曲折值，确认对中精度是否满足要求；
4.基座结构检测加固：核查轴承底座与加强筋的对位状态，检测基座结构强度，对底座落于板材空档、受力薄弱区域进行补焊加固，提升基座整体刚度，消除结构振动诱因；
5.中间轴承装配检测：复测轴系轴承装配间隙与负荷，排查装配偏差隐患。`,
  'Deepseek-7B': `一、故障分析
本次中间轴振动位移超标及中间轴承温度高报警，属于轴系运行异常引发的典型共性连锁故障，通常由多项轴系及基座因素共同诱发。核心成因在于船舶轴系装配偏差、运行工况异常与基座结构刚度缺陷相互叠加，导致轴系运转稳定性下降，进而引发一系列连锁反应。具体而言，轴系对中偏差、轴承装配间隙不当、润滑冷却不良、轴承基座加强筋强度不足、底座安装对位偏移等问题，均会加剧轴系运行时的振动响应，使振动位移持续超出允许范围；同时，异常轴系载荷会使中间轴承摩擦阻力增大、产热量急剧上升，超出冷却与润滑系统的散热能力，最终导致轴承温度超限并触发高温报警。

二、诊断结论（置信度96%）
确诊本次故障为轴系装配误差、运行负载异常及基座结构缺陷叠加所致的轴系连锁故障。核心缺陷包括：轴系对中偏差超标、中间轴承装配间隙不合理、轴承润滑冷却系统异常、轴承基座加强筋强度与刚度不足，以及底座安装对位不准确。

三、维修建议
1.轴系盘车检查：停机后实施手动盘车，若盘车过程中阻力不均或运转平顺性差，即可判定轴系装配或传动环节存在异常。
2.润滑冷却系统检修：检查轴承滑油油位、油质及油压，排查冷却管路是否存在堵塞、阀门是否工作正常，以排除润滑冷却异常因素。
3.轴系对中检查：重新测量中间轴法兰处的偏移值和曲折值，核实对中状态。
4.基座结构检测加固及精度检测：核查轴承底座与加强筋的对位情况，评估基座结构强度；对底座落位于板材空档或受力薄弱区域，进行补焊加固，以提升基座整体刚度，消除结构振动诱因。
5.中间轴承装配检测：复测轴系轴承的装配间隙与负荷分布，排查装配偏差隐患，确保轴承工作状态符合设计要求。`
};

const MODEL_CONCLUSIONS: Record<ModelName, string> = {
  'SFD-LLM':
    '经 SFD-LLM 船舶故障 AI 诊断垂类大模型诊断（置信度 98%），确诊为轴系装配、运行负载及基座结构缺陷叠加引发的轴系连锁故障。',
  Qwen3:
    '经 Qwen3 诊断（置信度 97%），确诊为轴系装配、运行负载及基座结构缺陷叠加所致的轴系连锁故障。',
  'Deepseek-7B':
    '经 Deepseek-7B 诊断（置信度 96%），确诊为轴系装配误差、运行负载异常及基座结构缺陷叠加所致的轴系连锁故障。'
};

const ADVICE_CYL_ONLY = `各缸排温过高，多为本缸供油异常、雾化不良、压缩不良、排气不畅、缸套活塞漏气、喷油控制故障。
建议检查喷油器启阀压力是否异常、高压油泵及燃油定时导致单缸供油量过大；
建议检查排气阀及液压驱动系统，排气阀延迟开启且开度不足导致换气不充分等原因。`;

const ADVICE_BEARING_ONLY = `中间轴承温度超温，极大可能原因为中间轴承负荷过大。
建议测量轴承实际负荷，在轴承附近用液压千斤顶替代轴承支撑轴系，通过压力和位移的曲线图来推算出实际负荷；
建议检查轴系润滑系统问题，轴承内滑油流失是导致高温的可能原因；
建议检查轴承间隙，径向间隙过小引起破坏油膜引起摩擦过热等原因。`;

const ADVICE_VIBRATION_ONLY = `中间轴振动位移偏差超过 0.20 mm，已达到报警条件。
建议检查非接触式振动传感器安装状态，将传感器与轴表面的安装距离复核为 2 mm；
检查探头支架是否松动、轴表面是否存在跳动，并校验传感器零位及量程。`;

const ADVICE_NORMAL = `经多维参数综合分析，当前主机运行正常，未发现任何异常工况：

  • 各缸排气温度均在正常范围（最高 < 450℃ 报警阈值）
  • 中间轴承温度正常（< 58℃，标称值 55℃）
  • 中间轴振动位移正常（≤ 0.20 mm）
  • 主机转速、负荷、滑油压力等核心参数均稳定在额定范围内

无需进行故障处置，继续保持当前运行状态即可。`;

interface Snapshot {
  model: ModelName;
  hasFault: boolean;
  cylOver: boolean;
  bearingOver: boolean;
  vibrationOver: boolean;
  maxCyl: number;
  bearingTemp: number;
  vibration: number;
  rpm: number;
  loadPct: number;
  analyzedAt: string;
}

const snapshot = ref<Snapshot | null>(null);

const maxCylTemp = computed(() =>
  t.state.cylExhaust.length ? Math.max(...t.state.cylExhaust) : 0
);

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

function clearAnalysis() {
  if (typeTimer) clearInterval(typeTimer);
  typeTimer = null;
  snapshot.value = null;
  typedAdvice.value = '';
  typing.value = false;
  hasAnimatedOnce = false;
}

function onModelChange() {
  clearAnalysis();
}

function onAnalyze() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');

  // === 故障识别同时看「当前状态」和「本轮报警历史」===
  // 停止后会冷却，瞬时温度可能已跌破阈值，但本轮内确实发生过故障，应纳入诊断
  const cylCur = maxCylTemp.value;
  const btCur = t.state.bearingTemp;
  const vibrationCur = t.state.shaftVibration;
  // 报警历史里峰值（用于显示）
  let cylPeak = cylCur;
  let bearingPeak = btCur;
  let vibrationPeak = vibrationCur;
  let cylHistory = false;
  let bearingHistory = false;
  let vibrationHistory = false;
  for (const ev of alarms.history) {
    if (ev.id === 'A_CYL_EXH_HIGH') {
      cylHistory = true;
      if (typeof ev.value === 'number' && ev.value > cylPeak) cylPeak = ev.value;
    } else if (ev.id === 'A_BEARING_TEMP_HIGH') {
      bearingHistory = true;
      if (typeof ev.value === 'number' && ev.value > bearingPeak) bearingPeak = ev.value;
    } else if (ev.id === 'A_SHAFT_VIBRATION_HIGH') {
      vibrationHistory = true;
      if (typeof ev.value === 'number' && ev.value > vibrationPeak) vibrationPeak = ev.value;
    }
  }
  const cylOver = cylHistory || cylCur > 450;
  const bearingOver = bearingHistory || btCur >= 58;
  const vibrationOver = vibrationHistory || vibrationCur > 0.2;

  snapshot.value = {
    model: selectedModel.value,
    hasFault: cylOver || bearingOver || vibrationOver,
    cylOver,
    bearingOver,
    vibrationOver,
    maxCyl: cylPeak,
    bearingTemp: bearingPeak,
    vibration: vibrationPeak,
    rpm: t.state.rpm,
    loadPct: t.state.loadPct,
    analyzedAt: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  };

  // 主线场景：两类报警都触发过 → 展示所选模型的专属分析结果
  let advice = ADVICE_NORMAL;
  if (cylOver && bearingOver) advice = FINAL_ADVICE_BY_MODEL[selectedModel.value];
  else if (cylOver) advice = ADVICE_CYL_ONLY;
  else if (bearingOver && vibrationOver) advice = FINAL_ADVICE_BY_MODEL[selectedModel.value];
  else if (bearingOver) advice = ADVICE_BEARING_ONLY;
  else if (vibrationOver) advice = ADVICE_VIBRATION_ONLY;
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
    if (snap.cylOver && snap.bearingOver) adviceText = FINAL_ADVICE_BY_MODEL[snap.model];
    else if (snap.cylOver) adviceText = ADVICE_CYL_ONLY;
    else if (snap.bearingOver && snap.vibrationOver) adviceText = FINAL_ADVICE_BY_MODEL[snap.model];
    else if (snap.bearingOver) adviceText = ADVICE_BEARING_ONLY;
    else if (snap.vibrationOver) adviceText = ADVICE_VIBRATION_ONLY;
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

  const diagnosisConclusion =
    (snap?.cylOver && snap?.bearingOver) || (snap?.bearingOver && snap?.vibrationOver)
      ? MODEL_CONCLUSIONS[snap.model]
      : '经 AI 智能诊断系统识别，已完成当前异常状态分析。';
  const conclusion = `${diagnosisConclusion}\n按维修建议完成检修后，故障已彻底清除，主机停车在 STOP 待机状态，所有参数恢复至额定无故障值。`;

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
  alarms.history.splice(0); // 清空报警历史
  clearAnalysis();

  ElMessage.success('故障已修复，诊断报告已自动保存到"报告查询"页');
}

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
.model-selector {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-shrink: 0;
}
.model-label {
  color: var(--c-text-2);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.model-select {
  width: 136px;
}
.model-select :deep(.el-select__wrapper) {
  min-height: 32px;
  background: var(--c-bg-panel);
  border-radius: 2px;
  box-shadow: 0 0 0 1px var(--c-border-soft) inset;
}
.model-select :deep(.el-select__selected-item) {
  color: var(--c-text);
  font-size: 12px;
  font-weight: 600;
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
.ai-panel,
.ai-body {
  min-width: 0;
  min-height: 0;
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
  font-size: clamp(15px, 1.15vw, 16px);
  line-height: 1.8;
  margin: 0;
  min-height: 200px;
  max-width: 100%;
  box-sizing: border-box;
  overflow-wrap: anywhere;
  word-break: break-word;
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
