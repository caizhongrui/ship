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
  setCheckResult, openPropellerCamera, onAnalyze, onModelChange };`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

function diagnosis({ fault = true, model = 'SFD-LLM' } = {}) {
  const hooks = [];
  const calls = { play: 0, pause: 0, load: 0 };
  const media = {
    currentTime: 0,
    duration: 4.163,
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
    if (page.selectedModel.value === 'SFD-LLM' && index === 3) await page.openPropellerCamera();
    await page.setCheckResult(index, index === page.repairChecks.value.length - 1 ? lastStatus : 'normal');
  }
}

test('diagnosis renders only the digital human and has no follow-up welding video', () => {
  const video = source.match(/<video\b[\s\S]*?<\/video>/)[0];
  assert.match(video, /src="\/digital-human\.mp4\?v=4"/);
  assert.match(video, /aria-label="数字人诊断视频"/);
  assert.doesNotMatch(video, /@ended/);
  assert.doesNotMatch(source, /maintenance-advice\.mp4|onDiagnosisVideoEnded|'maintenance'/);
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
    assert.equal(h.page.repairChecks.value.length, 5);
    assert.equal(h.page.confirmedChecks.value.length, 5);
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
  await h.page.setCheckResult(4, 'normal');
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
