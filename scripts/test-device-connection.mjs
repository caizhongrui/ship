import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import * as pinia from 'pinia';
import * as vue from 'vue';
import ts from 'typescript';

// Controlled IPC replies exercise the actual store without touching hardware.
const source = readFileSync(new URL('../src/stores/deviceConfig.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText.replaceAll('import.meta.hot', 'undefined');
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const validReport = () => ({ ok: true, message: '读取成功', measurements: [{ key: 'temperature', value: 25 }] });
const failureReport = () => ({ ok: false, message: '读取超时', measurements: [] });
const displacementReport = (millimeters, key = 'displacement') => ({
  ...validReport(),
  measurements: [{ key, label: '振动位移', value: millimeters * 1000, unit: 'μm', displacementMm: millimeters }]
});

function harness(desktop = true) {
  const timers = new Map();
  const pending = [];
  const calls = [];
  let timerId = 0;
  let now = 0;
  let activeRequests = 0;
  let maxActiveRequests = 0;
  const backend = {
    // A legacy saved interval must not slow continuous acquisition.
    saved: { ip: '192.168.0.7', port: 20108, transport: 'rtu-over-tcp', sensorType: 'single-axis', unitId: 1, functionCode: 3, timeoutMs: 2000, pollIntervalMs: 1000, baudRate: 9600 },
    load: null
  };
  async function invoke(command, payload) {
    const call = { command, payload, sentAt: now };
    calls.push(call);
    if (command === 'load_device_config') return backend.load ? backend.load() : { ...backend.saved };
    if (command === 'save_device_config') { backend.saved = { ...payload.config }; return; }
    if (command === 'close_sensor_connection') return;
    assert.equal(command, 'test_sensor_device');
    activeRequests++;
    maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
    const response = deferred();
    pending.push(response);
    try { return await response.promise; }
    finally { call.completedAt = now; activeRequests--; }
  }
  const imports = { pinia, vue, '@tauri-apps/api/core': { invoke, isTauri: () => desktop } };
  const context = vm.createContext({
    exports: {},
    require: name => { assert.ok(imports[name], 'Unexpected import ' + name); return imports[name]; },
    Date: { now: () => now },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay, due: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  vm.runInContext(compiled, context);
  const store = context.exports.useDeviceConfigStore(pinia.createPinia());
  const reads = () => calls.filter(call => call.command === 'test_sensor_device');
  const reply = async report => {
    assert.equal(pending.length, 1, 'Exactly one request may await a response');
    pending.shift().resolve(report);
    await flush();
  };
  return {
    store, backend, calls, timers, reads, reply, desktop,
    pendingCount: () => pending.length,
    maxActive: () => maxActiveRequests,
    advance(ms) { now += ms; },
    async start() { store.startMonitoring(); await flush(); },
    async stop() { store.stopMonitoring(); if (pending.length) await reply(validReport()); await flush(); },
    async fireRetry() {
      assert.equal(timers.size, 1, 'Exactly one reconnect must be scheduled');
      const [id, timer] = timers.entries().next().value;
      timers.delete(id);
      now = timer.due;
      timer.fn();
      await flush();
      return timer.delay;
    }
  };
}

// Exercise the real configuration-page logic with lifecycle hooks controlled
// by the test; no DOM or real device is needed to verify shared auto-reading.
const pageSource = readFileSync(new URL('../src/views/DeviceConfig.vue', import.meta.url), 'utf8')
  .match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
const pageCompiled = ts.transpileModule(`${pageSource}
export { autoReading, form, formError, report, statusTitle, toggleAutoRead, runTest };`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

async function configPage(h) {
  const mounted = [];
  const unmounted = [];
  const scope = vue.effectScope();
  const imports = {
    vue: { ...vue, onMounted: fn => mounted.push(fn), onUnmounted: fn => unmounted.push(fn) },
    '@tauri-apps/api/core': { isTauri: () => h.desktop },
    'element-plus': { ElMessage: { success() {} } },
    '@/stores/deviceConfig': { useDeviceConfigStore: () => h.store, defaultSensorConfig: () => ({ ...h.store.config }) }
  };
  const context = vm.createContext({ exports: {}, URL, Date,
    require: name => { assert.ok(imports[name], 'Unexpected page import ' + name); return imports[name]; } });
  scope.run(() => vm.runInContext(pageCompiled, context));
  for (const mount of mounted) await mount();
  await flush();
  return { ...context.exports, close() { for (const unmount of unmounted) unmount(); scope.stop(); } };
}

test('defaults match the gateway and saved custom communication settings are preserved', async () => {
  const h = harness();
  assert.deepEqual(JSON.parse(JSON.stringify(h.store.config)), {
    ip: '192.168.0.177', port: 20108, transport: 'modbus-tcp', sensorType: 'single-axis',
    unitId: 1, functionCode: 3, timeoutMs: 2000, baudRate: 4800
  });
  await h.store.load();
  const { pollIntervalMs: obsoleteInterval, ...settings } = h.backend.saved;
  assert.equal(obsoleteInterval, 1000);
  assert.deepEqual(JSON.parse(JSON.stringify(h.store.config)), settings);
  assert.equal('pollIntervalMs' in h.store.config, false);
});

test('every valid reply immediately starts the next read without a sampling timer or overlap', async () => {
  const h = harness();
  await h.start();
  h.store.startMonitoring();
  assert.equal(h.reads().length, 1);
  for (let index = 0; index < 30; index++) {
    h.advance(index % 2 ? 1700 : 35);
    await h.reply(validReport());
    const reads = h.reads();
    assert.equal(reads.length, index + 2);
    assert.equal(reads.at(-1).sentAt, reads.at(-2).completedAt);
    assert.equal(h.store.connection.status, 'connected');
    assert.equal(h.timers.size, 0);
    assert.equal(h.pendingCount(), 1);
    assert.equal(h.maxActive(), 1);
  }
  await h.stop();
  assert.equal(h.pendingCount(), 0);
});

test('matching manual reads join the current background request without duplicate frames', async () => {
  const h = harness();
  await h.start();
  for (let index = 0; index < 15; index++) {
    const first = h.store.test({ ...h.store.config }, 'read');
    const second = h.store.test({ ...h.store.config, ip: ` ${h.store.config.ip} ` }, 'read');
    await flush();
    assert.equal(h.reads().length, index + 1);
    const report = displacementReport(0.15 + index / 1000);
    await h.reply(report);
    assert.deepEqual(await first, report);
    assert.deepEqual(await second, report);
    assert.deepEqual(JSON.parse(JSON.stringify(h.store.latestReport)), report);
    assert.equal(h.reads().length, index + 2);
  }
  assert.equal(h.maxActive(), 1);
  await h.stop();
});

test('shared reports retain failed frame details and resume after reconnection', async () => {
  const h = harness();
  await h.start();
  await h.reply(displacementReport(0.2));
  const failed = { ...failureReport(), frames: [{ request: '01 03', response: '01' }], errorStage: '接收响应' };
  await h.reply(failed);
  assert.equal(h.store.latestRead, null);
  assert.deepEqual(JSON.parse(JSON.stringify(h.store.latestReport)), failed);
  await h.fireRetry();
  const recovered = displacementReport(0.1);
  await h.reply(recovered);
  assert.deepEqual(JSON.parse(JSON.stringify(h.store.latestReport)), recovered);
  await h.stop();
  assert.equal(h.store.latestReport, null);
});

test('stopping or saving configuration closes the old socket before the next acquisition', async () => {
  const h = harness();
  await h.start();
  await h.store.save({ ...h.store.config, port: 502 });
  assert.equal(h.calls.some(call => call.command === 'close_sensor_connection'), false);
  await h.reply(validReport());
  const closeIndex = h.calls.findIndex(call => call.command === 'close_sensor_connection');
  const newReadIndex = h.calls.findIndex(call => call.command === 'test_sensor_device' && call.payload.config.port === 502);
  assert.ok(closeIndex > 0 && closeIndex < newReadIndex);
  await h.stop();
  assert.equal(h.calls.at(-1).command, 'close_sensor_connection');
});

test('configuration-page auto reading shares all background replies without issuing extra requests', async () => {
  const h = harness();
  await h.start();
  const page = await configPage(h);
  page.toggleAutoRead();
  assert.equal(page.autoReading.value, true);
  for (let index = 0; index < 20; index++) {
    const result = { ...displacementReport(0.1 + index / 1000), connectionReused: index > 0 };
    await h.reply(result);
    assert.equal(h.reads().length, index + 2);
    assert.deepEqual(JSON.parse(JSON.stringify(page.report.value)), result);
    assert.equal(page.statusTitle.value, '连续采集中');
  }
  page.toggleAutoRead();
  const paused = page.report.value;
  await h.reply(displacementReport(0.8));
  assert.equal(page.report.value, paused);
  assert.equal(h.store.vibrationDisplacementUm, 800);
  assert.equal(h.pendingCount(), 1);
  page.close();
  await h.stop();
});

test('shared auto reading stays enabled through disconnection and recovers without a second loop', async () => {
  const h = harness();
  await h.start();
  const page = await configPage(h);
  page.toggleAutoRead();
  await h.reply(failureReport());
  assert.equal(page.autoReading.value, true);
  assert.equal(page.report.value.ok, false);
  assert.equal(page.statusTitle.value, '读取失败，自动重连中');
  assert.equal(h.reads().length, 1);
  await h.fireRetry();
  await h.reply(displacementReport(0.21));
  assert.equal(page.statusTitle.value, '连续采集中');
  assert.equal(page.report.value.measurements[0].value, 210);
  assert.equal(h.reads().length, 3);
  page.close();
  const lastPageReport = page.report.value;
  await h.reply(displacementReport(0.4));
  assert.equal(page.report.value, lastPageReport);
  await h.stop();
});

test('unsaved parameters can be tested once but cannot start shared auto reading', async () => {
  const h = harness();
  await h.start();
  const page = await configPage(h);
  page.form.ip = '192.168.0.8';
  await flush();
  page.toggleAutoRead();
  assert.equal(page.autoReading.value, false);
  assert.ok(page.formError.value.includes('先保存'));
  assert.equal(h.reads().length, 1);
  const manual = page.runTest('read');
  await h.reply(displacementReport(0.2));
  assert.equal(h.reads().at(-1).payload.config.ip, '192.168.0.8');
  await h.reply(displacementReport(0.3));
  await manual;
  assert.equal(page.report.value.measurements[0].value, 300);
  assert.equal(h.store.vibrationDisplacementUm, 200);
  page.close();
  await h.stop();
});

test('loss retries and recovery immediately resumes continuous reads', async () => {
  const h = harness();
  await h.start();
  await h.reply(validReport());
  await h.reply(failureReport());
  assert.equal(h.store.connection.status, 'failed');
  assert.equal(h.store.connection.retryCount, 1);
  assert.equal(h.pendingCount(), 0);
  assert.equal(await h.fireRetry(), 3000);
  await h.reply(validReport());
  assert.equal(h.store.connection.status, 'connected');
  assert.equal(h.store.connection.retryCount, 0);
  assert.equal(h.pendingCount(), 1);
  assert.equal(h.timers.size, 0);
  await h.stop();
});

test('persistent failures keep reconnecting without a retry limit', async () => {
  const h = harness();
  await h.start();
  for (let attempt = 1; attempt <= 8; attempt++) {
    await h.reply(failureReport());
    assert.equal(h.store.connection.retryCount, attempt);
    assert.equal(h.pendingCount(), 0);
    assert.equal(await h.fireRetry(), 3000);
  }
  assert.equal(h.maxActive(), 1);
  await h.stop();
  assert.equal(h.timers.size, 0);
});

test('TCP success without sensor data cannot report a connected sensor', async () => {
  const h = harness();
  await h.start();
  await h.reply({ ok: true, message: '', measurements: [] });
  assert.equal(h.store.connection.status, 'failed');
  assert.ok(h.store.connection.message.includes('有效传感器数据'));
  await h.stop();
});

test('saving parameters ignores old in-flight responses and restarts serially', async () => {
  const h = harness();
  await h.start();
  await h.store.save({ ...h.store.config, ip: '192.168.0.8', port: 502, transport: 'modbus-tcp' });
  assert.equal(h.store.connection.status, 'connecting');
  await h.reply(failureReport());
  assert.equal(h.store.connection.status, 'connecting');
  assert.equal(h.reads().at(-1).payload.config.ip, '192.168.0.8');
  assert.equal(h.reads().at(-1).payload.config.port, 502);
  await h.reply(validReport());
  assert.equal(h.store.connection.status, 'connected');
  assert.equal(h.maxActive(), 1);
  await h.stop();
});

test('late config loading cannot overwrite newly saved parameters', async () => {
  const h = harness();
  const oldLoad = deferred();
  h.backend.load = () => oldLoad.promise;
  await h.start();
  await h.store.save({ ...h.store.config, ip: '192.168.0.8' });
  await flush();
  oldLoad.resolve({ ...h.backend.saved, ip: '192.168.0.7' });
  await flush();
  assert.equal(h.store.config.ip, '192.168.0.8');
  assert.equal(h.reads().length, 1);
  await h.reply(validReport());
  assert.equal(h.store.connection.status, 'connected');
  await h.stop();
});

test('stopping acquisition ignores late replies and sends no further request', async () => {
  const h = harness();
  await h.start();
  await h.stop();
  assert.equal(h.store.connection.status, 'idle');
  assert.equal(h.reads().length, 1);
  assert.equal(h.timers.size, 0);
});

test('manual tests use the FIFO queue and cancelled background jobs never send', async () => {
  const h = harness();
  await h.start();
  const manual = h.store.test(h.store.config, 'connection');
  await flush();
  assert.equal(h.reads().length, 1);
  await h.reply(validReport());
  assert.equal(h.reads().length, 2);
  assert.equal(h.reads().at(-1).payload.action, 'connection');
  h.store.stopMonitoring();
  await h.reply({ ok: true, measurements: [] });
  await manual;
  assert.equal(h.reads().length, 2);
  assert.equal(h.maxActive(), 1);
  assert.equal(h.pendingCount(), 0);
});

test('config loading failures retry and recover', async () => {
  const h = harness();
  h.backend.load = () => { throw new Error('配置读取失败'); };
  await h.start();
  assert.equal(h.store.connection.status, 'failed');
  assert.equal(h.reads().length, 0);
  h.backend.load = null;
  await h.fireRetry();
  await h.reply(validReport());
  assert.equal(h.store.connection.status, 'connected');
  await h.stop();
});

test('browser preview never starts acquisition or fakes a connection', async () => {
  const h = harness(false);
  await h.start();
  assert.equal(h.store.connection.status, 'unavailable');
  assert.equal(h.calls.length, 0);
  assert.equal(h.timers.size, 0);
  assert.equal(h.store.vibrationDisplacementMm, null);
  assert.equal(h.store.vibrationDisplacementUm, null);
  await h.stop();
});

test('displacement follows every reply, preserves zero and clears on disconnection', async () => {
  const h = harness();
  await h.start();
  await h.reply(displacementReport(0.21));
  assert.equal(h.store.vibrationDisplacementMm, 0.21);
  assert.equal(h.store.vibrationDisplacementUm, 210);
  await h.reply(displacementReport(0));
  assert.equal(h.store.vibrationDisplacementMm, 0);
  assert.equal(h.store.vibrationDisplacementUm, 0);
  await h.reply(failureReport());
  assert.equal(h.store.latestRead, null);
  assert.equal(h.store.vibrationDisplacementMm, null);
  assert.equal(h.store.vibrationDisplacementUm, null);
  await h.fireRetry();
  const recovered = displacementReport(0.1234);
  recovered.measurements[0].value = 123.4;
  await h.reply(recovered);
  assert.equal(h.store.vibrationDisplacementMm, 0.1234);
  assert.equal(h.store.vibrationDisplacementUm, 123.4);
  await h.stop();
  assert.equal(h.store.vibrationDisplacementMm, null);
  assert.equal(h.store.vibrationDisplacementUm, null);
});

test('three-axis sensors use the labelled X-axis displacement', async () => {
  const h = harness();
  h.backend.saved.sensorType = 'three-axis';
  await h.start();
  await h.reply({ ...validReport(), measurements: [
    ...displacementReport(0.11, 'displacement-y').measurements,
    ...displacementReport(0.22, 'displacement-x').measurements,
    ...displacementReport(0.33, 'displacement-z').measurements
  ] });
  assert.equal(h.store.vibrationMeasurement.key, 'displacement-x');
  assert.equal(h.store.vibrationDisplacementMm, 0.22);
  assert.equal(h.store.vibrationDisplacementUm, 220);
  await h.stop();
});

test('missing or invalid displacement never falls back to another measurement', async () => {
  const h = harness();
  await h.start();
  for (const report of [validReport(), displacementReport(NaN), displacementReport(Infinity),
    { ...validReport(), measurements: [{ key: 'displacement', value: 210, unit: 'μm', displacementMm: null }] },
    { ...validReport(), measurements: [{ key: 'displacement', value: NaN, unit: 'μm', displacementMm: 0.21 }] },
    { ...validReport(), measurements: [{ key: 'displacement', value: 0.21, unit: 'mm', displacementMm: 0.21 }] }]) {
    await h.reply(report);
    assert.equal(h.store.vibrationDisplacementMm, null);
    assert.equal(h.store.vibrationDisplacementUm, null);
  }
  await h.stop();
});

test('unsaved manual test parameters cannot replace the monitored displacement', async () => {
  const h = harness();
  await h.start();
  await h.reply(displacementReport(0.15));
  const manual = h.store.test({ ...h.store.config, ip: '192.168.0.8' }, 'read');
  await flush();
  await h.reply(displacementReport(0.2));
  assert.equal(h.reads().at(-1).payload.config.ip, '192.168.0.8');
  await h.reply(displacementReport(0.99));
  const result = await manual;
  assert.equal(result.measurements[0].displacementMm, 0.99);
  assert.equal(h.store.vibrationDisplacementMm, 0.2);
  await h.stop();
});

test('saving a new device clears old readings and ignores late measurements', async () => {
  const h = harness();
  await h.start();
  await h.reply(displacementReport(0.15));
  await h.store.save({ ...h.store.config, ip: '192.168.0.8' });
  assert.equal(h.store.vibrationDisplacementMm, null);
  await h.reply(displacementReport(0.8));
  assert.equal(h.store.vibrationDisplacementMm, null);
  await h.reply(displacementReport(0.3));
  assert.equal(h.store.vibrationDisplacementMm, 0.3);
  assert.equal(h.maxActive(), 1);
  await h.stop();
});
