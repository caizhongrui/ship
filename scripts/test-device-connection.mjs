import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import * as pinia from 'pinia';
import * as vue from 'vue';
import ts from 'typescript';

// Run the actual store with fake IPC and a deterministic timer; no hardware is touched.
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
const displacementReport = (millimeters, key = 'displacement') => ({
  ...validReport(),
  measurements: [{ key, label: '振动位移', value: millimeters * 1000, unit: 'μm', displacementMm: millimeters }]
});

function harness(desktop = true) {
  const timers = new Map();
  let timerId = 0;
  let now = 0;
  const calls = [];
  let activeRequests = 0;
  let maxActiveRequests = 0;
  const backend = {
    saved: { ip: '192.168.0.7', port: 20108, transport: 'rtu-over-tcp', sensorType: 'single-axis', unitId: 1, functionCode: 3, timeoutMs: 2000, pollIntervalMs: 1000, baudRate: 9600 },
    load: null,
    read: () => validReport()
  };
  async function invoke(command, payload) {
    calls.push({ command, payload });
    if (command === 'load_device_config') return backend.load ? backend.load() : { ...backend.saved };
    if (command === 'save_device_config') { backend.saved = { ...payload.config }; return; }
    assert.equal(command, 'test_sensor_device');
    activeRequests++;
    maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
    try { return await backend.read(payload); }
    finally { activeRequests--; }
  }
  const imports = { pinia, vue, '@tauri-apps/api/core': { invoke, isTauri: () => desktop } };
  const context = vm.createContext({
    exports: {},
    require: name => { assert.ok(imports[name], `Unexpected import ${name}`); return imports[name]; },
    Date: { now: () => now },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay, due: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  vm.runInContext(compiled, context);
  const store = context.exports.useDeviceConfigStore(pinia.createPinia());
  return {
    store, backend, calls, timers,
    reads: () => calls.filter(call => call.command === 'test_sensor_device'),
    maxActive: () => maxActiveRequests,
    async fireTimer() {
      assert.equal(timers.size, 1, 'There must be exactly one scheduled health check');
      const [id, timer] = timers.entries().next().value;
      timers.delete(id);
      now = timer.due;
      timer.fn();
      await flush();
      return timer.delay;
    }
  };
}

test('new defaults match the supplied gateway settings while saved custom settings are preserved', async () => {
  const h = harness();
  assert.deepEqual(JSON.parse(JSON.stringify(h.store.config)), {
    ip: '192.168.0.177', port: 20108, transport: 'modbus-tcp', sensorType: 'single-axis',
    unitId: 1, functionCode: 3, timeoutMs: 2000, pollIntervalMs: 1000, baudRate: 4800
  });
  await h.store.load();
  assert.deepEqual(JSON.parse(JSON.stringify(h.store.config)), h.backend.saved);
  assert.equal(h.store.config.ip, '192.168.0.7');
  assert.equal(h.store.config.transport, 'rtu-over-tcp');
  assert.equal(h.store.config.baudRate, 9600);
});

test('valid sensor data reports connected; later loss retries and recovers', async () => {
  const h = harness();
  const responses = [validReport(), { ok: false, message: '读取超时', measurements: [] }, validReport()];
  h.backend.read = () => responses.shift();
  h.store.startMonitoring();
  await flush();
  assert.equal(h.store.connection.status, 'connected');
  assert.equal(await h.fireTimer(), 1000);
  assert.equal(h.store.connection.status, 'failed');
  assert.equal(h.store.connection.retryCount, 1);
  assert.equal(await h.fireTimer(), 3000);
  assert.equal(h.store.connection.status, 'connected');
  assert.equal(h.store.connection.retryCount, 0);
  assert.equal(h.maxActive(), 1);
  h.store.stopMonitoring();
});

test('persistent failure keeps retrying every three seconds without a retry limit', async () => {
  const h = harness();
  h.backend.read = () => ({ ok: false, message: '未收到响应', measurements: [] });
  h.store.startMonitoring();
  h.store.startMonitoring(); // Calling start twice must not create a second loop.
  await flush();
  for (let attempt = 1; attempt <= 8; attempt++) {
    assert.equal(h.store.connection.status, 'failed');
    assert.equal(h.store.connection.retryCount, attempt);
    assert.equal(h.reads().length, attempt);
    assert.equal(await h.fireTimer(), 3000);
  }
  assert.equal(h.maxActive(), 1);
  h.store.stopMonitoring();
  assert.equal(h.timers.size, 0);
});

test('TCP success without sensor data cannot report device connected', async () => {
  const h = harness();
  h.backend.read = () => ({ ok: true, message: '', measurements: [] });
  h.store.startMonitoring();
  await flush();
  assert.equal(h.store.connection.status, 'failed');
  assert.ok(h.store.connection.message.includes('有效传感器数据'));
  h.store.stopMonitoring();
});

test('save immediately uses new parameters and ignores an old in-flight response', async () => {
  const h = harness();
  const oldRequest = deferred();
  h.backend.read = payload => payload.config.ip === '192.168.0.7' ? oldRequest.promise : validReport();
  h.store.startMonitoring();
  await flush();
  await h.store.save({ ...h.store.config, ip: '192.168.0.8', port: 502, transport: 'modbus-tcp' });
  assert.equal(h.store.connection.status, 'connecting');
  oldRequest.resolve({ ok: false, message: '旧设备失败', measurements: [] });
  await flush();
  assert.equal(h.store.connection.status, 'connected');
  assert.equal(h.reads().at(-1).payload.config.ip, '192.168.0.8');
  assert.equal(h.reads().at(-1).payload.config.port, 502);
  assert.equal(h.timers.size, 1);
  assert.equal(h.maxActive(), 1);
  h.store.stopMonitoring();
});

test('late config loading cannot overwrite parameters just saved', async () => {
  const h = harness();
  const oldLoad = deferred();
  h.backend.load = () => oldLoad.promise;
  h.store.startMonitoring();
  await flush();
  await h.store.save({ ...h.store.config, ip: '192.168.0.8' });
  await flush();
  oldLoad.resolve({ ...h.backend.saved, ip: '192.168.0.7' });
  await flush();
  assert.equal(h.store.config.ip, '192.168.0.8');
  assert.equal(h.store.connection.status, 'connected');
  assert.equal(h.reads().length, 1);
  h.store.stopMonitoring();
});

test('stopping monitoring ignores late responses and does not schedule another retry', async () => {
  const h = harness();
  const pending = deferred();
  h.backend.read = () => pending.promise;
  h.store.startMonitoring();
  await flush();
  h.store.stopMonitoring();
  pending.resolve(validReport());
  await flush();
  assert.equal(h.store.connection.status, 'idle');
  assert.equal(h.timers.size, 0);
});

test('manual tests share the queue; stopped background jobs are cancelled before sending', async () => {
  const h = harness();
  h.store.startMonitoring();
  await flush();
  const manualResult = deferred();
  h.backend.read = () => manualResult.promise;
  const manualTest = h.store.test(h.store.config, 'connection');
  await flush();
  await h.fireTimer();
  assert.equal(h.reads().length, 2, 'The background request must wait for the manual request');
  h.store.stopMonitoring();
  manualResult.resolve({ ok: true, measurements: [] });
  await manualTest;
  await flush();
  assert.equal(h.reads().length, 2, 'A cancelled queued job must not reach the gateway');
  assert.equal(h.maxActive(), 1);
  assert.equal(h.timers.size, 0);
});

test('config loading failures retry and can recover', async () => {
  const h = harness();
  h.backend.load = () => { throw new Error('配置读取失败'); };
  h.store.startMonitoring();
  await flush();
  assert.equal(h.store.connection.status, 'failed');
  assert.equal(h.reads().length, 0);
  h.backend.load = null;
  assert.equal(await h.fireTimer(), 3000);
  assert.equal(h.store.connection.status, 'connected');
  h.store.stopMonitoring();
});

test('browser preview is explicitly unavailable and never fakes a connection', async () => {
  const h = harness(false);
  h.store.startMonitoring();
  await flush();
  assert.equal(h.store.connection.status, 'unavailable');
  assert.equal(h.calls.length, 0);
  assert.equal(h.timers.size, 0);
  assert.equal(h.store.vibrationDisplacementMm, null);
  h.store.stopMonitoring();
});

test('real displacement follows every sensor read, preserves zero, and clears on disconnection', async () => {
  const h = harness();
  const responses = [displacementReport(0.21), displacementReport(0),
    { ok: false, message: '读取超时', measurements: [] }, displacementReport(0.1234)];
  h.backend.read = () => responses.shift();
  assert.equal(h.store.vibrationDisplacementMm, null);
  h.store.startMonitoring();
  await flush();
  assert.equal(h.store.vibrationDisplacementMm, 0.21);
  await h.fireTimer();
  assert.equal(h.store.vibrationDisplacementMm, 0);
  await h.fireTimer();
  assert.equal(h.store.connection.status, 'failed');
  assert.equal(h.store.latestRead, null);
  assert.equal(h.store.vibrationDisplacementMm, null);
  await h.fireTimer();
  assert.equal(h.store.vibrationDisplacementMm, 0.1234);
  h.store.stopMonitoring();
  assert.equal(h.store.vibrationDisplacementMm, null);
});

test('three-axis sensors use the labelled X-axis displacement', async () => {
  const h = harness();
  h.backend.saved.sensorType = 'three-axis';
  h.backend.read = () => ({ ...validReport(), measurements: [
    ...displacementReport(0.11, 'displacement-y').measurements,
    ...displacementReport(0.22, 'displacement-x').measurements,
    ...displacementReport(0.33, 'displacement-z').measurements
  ] });
  h.store.startMonitoring();
  await flush();
  assert.equal(h.store.vibrationMeasurement.key, 'displacement-x');
  assert.equal(h.store.vibrationDisplacementMm, 0.22);
  h.store.stopMonitoring();
});

test('missing or invalid displacement never falls back to another measurement', async () => {
  const h = harness();
  const responses = [validReport(), displacementReport(NaN), displacementReport(Infinity),
    { ...validReport(), measurements: [{ key: 'displacement', value: 210, displacementMm: null }] }];
  h.backend.read = () => responses.shift();
  h.store.startMonitoring();
  await flush();
  for (let index = 0; index < 4; index++) {
    assert.equal(h.store.vibrationDisplacementMm, null);
    if (index < 3) await h.fireTimer();
  }
  h.store.stopMonitoring();
});

test('unsaved manual test parameters cannot replace the monitored device displacement', async () => {
  const h = harness();
  h.backend.read = payload => displacementReport(payload.config.ip === '192.168.0.7' ? 0.15 : 0.99);
  h.store.startMonitoring();
  await flush();
  const manual = await h.store.test({ ...h.store.config, ip: '192.168.0.8' }, 'read');
  assert.equal(manual.measurements[0].displacementMm, 0.99);
  assert.equal(h.store.vibrationDisplacementMm, 0.15);
  h.store.stopMonitoring();
});

test('saving a new device clears old readings and ignores old in-flight measurements', async () => {
  const h = harness();
  const pending = deferred();
  h.store.startMonitoring();
  await flush();
  h.backend.read = payload => payload.config.ip === '192.168.0.7' ? pending.promise : displacementReport(0.3);
  await h.fireTimer();
  await h.store.save({ ...h.store.config, ip: '192.168.0.8' });
  assert.equal(h.store.vibrationDisplacementMm, null);
  pending.resolve(displacementReport(0.8));
  await flush();
  assert.equal(h.store.vibrationDisplacementMm, 0.3);
  assert.equal(h.store.latestRead.measurements[0].displacementMm, 0.3);
  h.store.stopMonitoring();
});
