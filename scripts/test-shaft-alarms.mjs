import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const compiled = new Map();
function loadSource(path, globals, modules = new Map()) {
  if (modules.has(path)) return modules.get(path);
  if (!compiled.has(path)) {
    const source = readFileSync(new URL(`../src/${path}.ts`, import.meta.url), 'utf8');
    compiled.set(path, ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText);
  }
  const exports = {};
  modules.set(path, exports);
  const context = vm.createContext({ ...globals, exports, require(name) {
    assert.ok(name.startsWith('@/engine/'), `Unexpected dependency: ${name}`);
    return loadSource(name.slice(2), globals, modules);
  } });
  vm.runInContext(compiled.get(path), context);
  return exports;
}

function simulator({ rate = 5, mode = 'AUTO', random = () => 0.5 } = {}) {
  let now = 0;
  let tick;
  const messages = [];
  const math = Object.create(Math);
  math.random = random;
  const self = { setInterval(callback, ms) {
    assert.equal(ms, 50);
    tick = callback;
    return 1;
  } };
  loadSource('workers/simulator.worker', {
    self, Math: math, Date: { now: () => now },
    performance: { now: () => now }, structuredClone,
    postMessage: message => messages.push({ ...message, at: now })
  });
  const send = (type, data = {}) => self.onmessage({ data: { type, ...data } });
  send('cmd.timeScale', { value: rate });
  send('cmd.setMode', { value: mode });
  if (mode === 'MANUAL') send('cmd.telegraph', { position: 'NAV_FULL' });
  send('cmd.start');
  return {
    send, messages,
    step(ms = 50) { now += ms; tick(); },
    alarms() { return messages.flatMap(message => message.alarms); },
    state() { return messages.at(-1)?.state; },
    now() { return now; }
  };
}

function until(sim, predicate, maxTicks = 8000) {
  for (let n = 0; n < maxTicks; n++) {
    sim.step();
    if (predicate()) return;
  }
  assert.fail('Expected alarm/state not reached');
}

function alarm(sim, id) { return sim.alarms().find(event => event.id === id); }
const VIBRATION = 'A_SHAFT_VIBRATION_HIGH';
const TEMPERATURE = 'A_BEARING_TEMP_HIGH';

for (const rate of [1, 5, 10]) {
  for (const mode of ['AUTO', 'MANUAL']) {
    test(`${mode} at ${rate}x: vibration and temperature alarms fire 1 actual second apart`, () => {
      const sim = simulator({ rate, mode });
      until(sim, () => !!alarm(sim, VIBRATION));
      assert.equal(alarm(sim, TEMPERATURE), undefined);
      for (let n = 0; n < 19; n++) sim.step();
      assert.equal(alarm(sim, TEMPERATURE), undefined, 'No early temperature alarm');
      sim.step();
      const bearing = alarm(sim, TEMPERATURE);
      assert.ok(bearing);
      assert.equal(bearing.ts - alarm(sim, VIBRATION).ts, 1);
      assert.ok(bearing.value >= 58 && bearing.value <= 58.2);
      assert.ok(alarm(sim, VIBRATION).value >= 0.2);
      for (let n = 0; n < 40; n++) sim.step();
      assert.equal(sim.alarms().filter(event => event.id === TEMPERATURE).length, 1);
    });
  }
}

test('pausing and resuming does not count paused time toward the second fault', () => {
  const sim = simulator({ mode: 'MANUAL' });
  until(sim, () => !!alarm(sim, VIBRATION));
  for (let n = 0; n < 8; n++) sim.step();
  sim.send('cmd.stop');
  sim.step(5000);
  assert.equal(alarm(sim, TEMPERATURE), undefined);
  sim.send('cmd.start');
  for (let n = 0; n < 11; n++) sim.step();
  assert.equal(alarm(sim, TEMPERATURE), undefined);
  sim.step();
  assert.equal(Math.round((alarm(sim, TEMPERATURE).ts - alarm(sim, VIBRATION).ts) * 1000), 6000);
});

test('shutdown before 1 second cancels the pending temperature fault', () => {
  const sim = simulator({ mode: 'MANUAL' });
  until(sim, () => !!alarm(sim, VIBRATION));
  sim.send('cmd.shutdown');
  for (let n = 0; n < 100; n++) sim.step();
  assert.equal(alarm(sim, TEMPERATURE), undefined);
  assert.ok(sim.state().bearingTemp < 58);
});

test('repair disables both simulated faults, and reset starts a fresh 1-second sequence', () => {
  const sim = simulator({ mode: 'MANUAL' });
  until(sim, () => !!alarm(sim, TEMPERATURE));
  sim.send('cmd.clearFault');
  sim.messages.length = 0;
  sim.send('cmd.telegraph', { position: 'NAV_FULL' });
  for (let n = 0; n < 100; n++) sim.step();
  assert.equal(sim.alarms().length, 0);
  assert.ok(sim.state().rpm > 75);
  assert.ok(sim.state().bearingTemp < 58);
  assert.ok(sim.state().shaftVibration <= 0.16);
  sim.send('cmd.reset');
  sim.messages.length = 0;
  sim.send('cmd.telegraph', { position: 'NAV_FULL' });
  sim.send('cmd.start');
  until(sim, () => !!alarm(sim, TEMPERATURE));
  assert.equal(alarm(sim, TEMPERATURE).ts - alarm(sim, VIBRATION).ts, 1);
});

test('delayed worker ticks use elapsed actual time rather than tick counts or simulation rate', () => {
  const sim = simulator({ rate: 10, mode: 'MANUAL' });
  until(sim, () => !!alarm(sim, VIBRATION));
  sim.step(900);
  assert.equal(alarm(sim, TEMPERATURE), undefined);
  sim.step(100);
  assert.equal(alarm(sim, TEMPERATURE).ts - alarm(sim, VIBRATION).ts, 1);
});

test('leaving the fault RPM region clears the model countdown', () => {
  const { BearingTempModel } = loadSource('engine/models/bearingTemp', {});
  const model = new BearingTempModel();
  const state = { rpm: 70, bearingTemp: 25, shaftVibration: 0 };
  model.step(state, 0.05);
  model.step(state, 0.9);
  assert.ok(state.bearingTemp < 58);
  state.rpm = 60;
  model.step(state, 0.05);
  state.rpm = 80;
  model.step(state, 0.05);
  model.step(state, 0.9);
  assert.ok(state.bearingTemp < 58);
  model.step(state, 0.1);
  assert.equal(state.bearingTemp, 58.2);
});

test('threshold jitter keeps the first fault time, without raising temperature while vibration is normal', () => {
  const { BearingTempModel } = loadSource('engine/models/bearingTemp', {});
  const model = new BearingTempModel();
  const state = { rpm: 70, bearingTemp: 25, shaftVibration: 0 };
  model.step(state, 0.05);
  state.rpm = 69.95;
  model.step(state, 1);
  assert.ok(state.shaftVibration < 0.2);
  assert.ok(state.bearingTemp < 58);
  state.rpm = 70;
  model.step(state, 0.05);
  assert.equal(state.bearingTemp, 58);
});

test('alarm thresholds remain based on measured state, without artificial event delays', () => {
  const { AlarmEngine } = loadSource('engine/alarmEngine', {});
  const engine = new AlarmEngine();
  const state = { cylExhaust: [25], bearingTemp: 57.99, shaftVibration: 0.2 };
  assert.equal(engine.check(state, 0.05).length, 0);
  state.bearingTemp = 58;
  state.shaftVibration = 0.201;
  const events = engine.check(state, 0.05);
  assert.deepEqual(Array.from(events, event => event.id), [TEMPERATURE, VIBRATION]);
});

test('normal RPM jitter does not stretch the interval beyond one worker tick', () => {
  for (const rate of [1, 5, 10]) {
    for (let seed = 1; seed <= 20; seed++) {
      let value = seed;
      const random = () => {
        value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
        return value / 2 ** 32;
      };
      const sim = simulator({ rate, random });
      until(sim, () => !!alarm(sim, TEMPERATURE));
      const interval = Math.round((alarm(sim, TEMPERATURE).ts - alarm(sim, VIBRATION).ts) * 1000);
      assert.ok(interval >= 1000 && interval <= 1050, `${rate}x, seed ${seed}: ${interval} ms`);
    }
  }
});

test('alarm log preserves milliseconds when displaying the 1-second event interval', () => {
  const source = readFileSync(new URL('../src/views/AlarmLog.vue', import.meta.url), 'utf8');
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
  const compiledScript = ts.transpileModule(`${script}\nexport { fmt };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const context = vm.createContext({ exports: {}, require(name) {
    if (name === 'vue') return { ref: value => ({ value }), computed: callback => ({ get value() { return callback(); } }) };
    assert.equal(name, '@/stores/alarms');
    return { useAlarmStore: () => ({ history: [] }) };
  } });
  vm.runInContext(compiledScript, context);
  const first = Date.parse('2026-10-10T01:27:24.998Z') / 1000;
  assert.equal(context.exports.fmt(first), '2026-10-10 01:27:24.998');
  assert.equal(context.exports.fmt(first + 1.05), '2026-10-10 01:27:26.048');
});
