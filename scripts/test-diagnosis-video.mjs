import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import * as vue from 'vue';
import ts from 'typescript';

const source = readFileSync(new URL('../src/views/FaultDiagnosis.vue', import.meta.url), 'utf8');
const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
const compiled = ts.transpileModule(`${script}
export { selectedModel, snapshot, repairChecks, confirmedChecks, structuredAdvice,
  digitalHumanVideoRef, digitalHumanPanelRef, videoStage, showDiagnosisVideo,
  analysisAdvice, isChoiceEnabled, requiresPropellerCamera,
  setCheckResult, openPropellerCamera, onAnalyze, onModelChange };`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

function diagnosis({ fault = true, model = 'SFD-LLM' } = {}) {
  const hooks = [];
  const calls = { play: 0, pause: 0, load: 0 };
  const media = {
    currentTime: 0,
    duration: 3.97,
    ended: false,
    async play() { calls.play++; },
    pause() { calls.pause++; },
    load() { calls.load++; }
  };
  const telemetry = { state: {
    cylExhaust: [25], bearingTemp: fault ? 58 : 25,
    shaftVibration: fault ? 0.21 : 0, rpm: 0, loadPct: 0
  } };
  const modules = {
    vue: { ...vue, onUnmounted: callback => hooks.push(callback) },
    'vue-router': { useRouter: () => ({ push: async () => {} }) },
    'element-plus': { ElMessage: { success() {} } },
    '@/stores/telemetry': { useTelemetryStore: () => telemetry },
    '@/stores/session': { useSessionStore: () => ({ running: false }) },
    '@/stores/alarms': { useAlarmStore: () => ({ history: [] }) },
    '@/stores/report': { useReportStore: () => ({}) },
    '@/engine/simRuntime': { simClearFault() {}, simSetMode() {} }
  };
  const context = vm.createContext({ exports: {}, defineOptions() {}, require(name) {
    assert.ok(name in modules, `Unexpected dependency: ${name}`);
    return modules[name];
  } });
  vm.runInContext(compiled, context);
  const page = context.exports;
  page.selectedModel.value = model;
  page.digitalHumanVideoRef.value = media;
  page.digitalHumanPanelRef.value = { scrollIntoView() {} };
  page.onAnalyze();
  return { page, media, calls, close() { hooks.forEach(callback => callback()); } };
}

async function completeChecks(page, lastStatus = 'fault') {
  for (let index = 0; index < page.repairChecks.value.length; index++) {
    if (page.requiresPropellerCamera(index)) await page.openPropellerCamera();
    await page.setCheckResult(index, index === page.repairChecks.value.length - 1 ? lastStatus : 'normal');
  }
}

test('diagnosis renders only the digital human and has no follow-up welding video', () => {
  const video = source.match(/<video\b[\s\S]*?<\/video>/)[0];
  assert.match(video, /src="\/digital-human\.mp4\?v=5"/);
  assert.match(video, /aria-label="数字人诊断视频"/);
  assert.doesNotMatch(video, /@ended/);
  assert.doesNotMatch(source, /maintenance-advice\.mp4|onDiagnosisVideoEnded|'maintenance'/);
});

test('digital human keeps its proportions without a black background or exposed edge', () => {
  const styles = source.match(/\.digital-human-video\s*\{([^}]+)\}/)[1];
  assert.match(styles, /object-fit:\s*contain/);
  assert.match(styles, /background:\s*transparent/);
  assert.match(styles, /border:\s*0/);
  assert.match(styles, /outline:\s*none/);
  assert.match(styles, /clip-path:\s*inset\(0 1px\)/);
  assert.doesNotMatch(styles, /#000|\bblack\b/);
});

test('normal analysis and incomplete checks do not show or start a video', async () => {
  const normal = diagnosis({ fault: false });
  assert.equal(normal.page.showDiagnosisVideo.value, false);
  assert.equal(normal.calls.play, 0);
  const fault = diagnosis();
  await fault.page.setCheckResult(0, 'normal');
  assert.equal(fault.page.showDiagnosisVideo.value, false);
  assert.equal(fault.calls.play, 0);
});

for (const model of ['SFD-LLM', 'Qwen3', 'Deepseek-7B']) {
  test(`${model}: completing the checks retains advice and plays only the digital human`, async () => {
    const h = diagnosis({ model });
    await completeChecks(h.page);
    const count = model === 'SFD-LLM' ? 4 : 5;
    assert.equal(h.page.repairChecks.value.length, count);
    assert.equal(h.page.confirmedChecks.value.length, count);
    assert.ok(h.page.structuredAdvice.value.analysis.includes('故障分析'));
    assert.equal(h.page.showDiagnosisVideo.value, true);
    assert.equal(h.page.videoStage.value, 'digital-human');
    assert.equal(h.calls.play, 1);
    assert.equal(h.calls.load, 1);
    h.media.currentTime = h.media.duration;
    h.media.ended = true;
    await vue.nextTick();
    assert.equal(h.page.videoStage.value, 'digital-human');
    assert.equal(h.calls.play, 1);
    assert.equal(h.calls.load, 1);
  });
}

test('marking the last check normal hides and stops the digital human', async () => {
  const h = diagnosis();
  await completeChecks(h.page);
  await h.page.setCheckResult(h.page.repairChecks.value.length - 1, 'normal');
  assert.equal(h.page.showDiagnosisVideo.value, false);
  assert.equal(h.page.videoStage.value, 'hidden');
  assert.equal(h.media.currentTime, 0);
});

test('changing the model clears video and advice state', async () => {
  const h = diagnosis();
  await completeChecks(h.page);
  h.page.onModelChange();
  assert.equal(h.page.showDiagnosisVideo.value, false);
  assert.equal(h.page.snapshot.value, null);
  assert.equal(h.page.confirmedChecks.value.length, 0);
  assert.equal(h.media.currentTime, 0);
});

test('unmounting stops the digital human', async () => {
  const h = diagnosis();
  await completeChecks(h.page);
  const pauses = h.calls.pause;
  h.close();
  assert.equal(h.calls.pause, pauses + 1);
  assert.equal(h.page.videoStage.value, 'hidden');
});

test('SFD-LLM removes only the alignment repair and renumbers the remaining advice', () => {
  const { page } = diagnosis();
  assert.equal(page.repairChecks.value.length, 4);
  assert.ok(page.repairChecks.value[2].startsWith('检查螺旋桨状态'));
  assert.ok(page.repairChecks.value[3].startsWith('检查中间轴轴承间隙'));
  const repairText = page.analysisAdvice.value.split('三、维修建议')[1];
  assert.doesNotMatch(repairText, /轴系对中检查|\n5\./);
  assert.match(repairText, /\n3\.检查螺旋桨状态/);
  assert.match(repairText, /\n4\.检查中间轴轴承间隙/);
  assert.match(page.structuredAdvice.value.conclusion, /轴系对中偏差超标/);
});

test('SFD-LLM camera check is now the third step and still gates the final step', async () => {
  const { page, calls } = diagnosis();
  await page.setCheckResult(0, 'normal');
  await page.setCheckResult(1, 'normal');
  assert.equal(page.requiresPropellerCamera(2), true);
  assert.equal(page.requiresPropellerCamera(3), false);
  assert.equal(page.isChoiceEnabled(2), false);
  await page.setCheckResult(2, 'normal');
  await page.setCheckResult(3, 'fault');
  assert.equal(calls.play, 0);
  await page.openPropellerCamera();
  assert.equal(page.isChoiceEnabled(2), true);
  await page.setCheckResult(2, 'normal');
  await page.setCheckResult(3, 'fault');
  assert.equal(page.confirmedChecks.value.length, 4);
  assert.equal(calls.play, 1);
});
