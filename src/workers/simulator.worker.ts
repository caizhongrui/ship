/**
 * 仿真 Worker (L1)
 *
 * - 内部物理 50ms tick
 * - UI 推送节流 500ms 墙钟（报警立即推）
 * - 启动剧本 0–300s 自动推进；手动切档退出剧本
 * - 故障 290~295s 触发"排温过高"+80℃（**不累积**：base 与显示值分离）
 * - STOP 严格归零
 */

import type { EngineState, TelegraphPosition } from '@/types';
import { stepRpm } from '@/engine/models/rpm';
import { stepLoad } from '@/engine/models/load';
import { stepExhaustTemp } from '@/engine/models/exhaustTemp';
import { stepScavPressure } from '@/engine/models/scavPressure';
import { stepBearingTemp } from '@/engine/models/bearingTemp';
import { stepElectric } from '@/engine/models/electric';
import { AlarmEngine } from '@/engine/alarmEngine';
import { FaultInjector } from '@/engine/faultInjector';
import { getScriptedState, SCRIPT_DURATION } from '@/engine/scenarios/startupScript';

const TICK_MS = 50;
const UI_POST_MS = 500;
const CYL_BIAS = [0, -2, -3, +2, +1, -1, +3, -2];

function emptyState(): EngineState {
  return {
    t: 0,
    rpm: 0,
    rpmTarget: 0,
    loadPct: 0,
    power: 0,
    scavPressure: 0,
    cylExhaust: Array(8).fill(25),
    exhaustManifold: 25,
    cylPmax: Array(8).fill(0),
    bearingTemp: 25,
    shaftVibration: 0,
    lubeOilTemp: 35,
    lubeOilPressure: 2.1,
    busVoltage: 0,
    busFrequency: 0,
    busCurrent: 0,
    busActivePower: 0,
    telegraph: 'STOP',
    faults: {}
  };
}

let state = emptyState();
// ===== 物理基线（不含故障/噪声），每 tick 由脚本或物理模型更新 =====
let baseCylExhaust: number[] = Array(8).fill(25);
let baseExhaustManifold = 25;

let timeScale = 5;
let running = false;
let scriptMode = true;
const alarmEngine = new AlarmEngine();
const faultInjector = new FaultInjector();

let timer: number | null = null;
let cylAccum = 0;
let elecAccum = 0;
let scavAccum = 0;
let lastPostMs = 0;

// 故障渐变：各缸排温向目标值过渡的进度 0..1（一阶滞后）
let exhaustFaultProgress = 0;
const FAULT_RAMP_TAU = 3; // 时间常数（秒）

// 故障级联：排温报警发出后 1 秒，触发中间轴承超温至 79℃
let cylAlarmFiredAt = -1; // 仿真时间（秒），<0 表示未触发
let bearingFaultActive = false;
let autoSlowedDown = false; // 报警后是否已自动降速
const BEARING_FAULT_TARGET = 79; // ℃
const BEARING_FAULT_TAU = 1.2; // 约 1-2 秒升到位

function jitter(amp: number) {
  return (Math.random() - 0.5) * amp;
}

function applyScriptedValues() {
  const s = getScriptedState(state.t);
  if (!s) return false;

  state.telegraph = s.tg;
  state.rpmTarget = s.rpm;
  state.rpm = s.rpm;
  state.loadPct = s.load;
  state.power = (s.load / 100) * 42310;
  state.lubeOilPressure = s.lube;

  // 更新排温基线（不含故障）
  for (let i = 0; i < 8; i++) {
    baseCylExhaust[i] = s.exh + CYL_BIAS[i];
  }
  baseExhaustManifold = s.exh - 5;

  state.lubeOilTemp = 35 + (s.load / 100) * 15;

  if (s.tg === 'STOP') {
    state.rpm = 0;
    state.loadPct = 0;
    state.power = 0;
  }
  return true;
}

/** 把基线（含故障渐变）+ 噪声合成最终排温（每帧重算，不累积） */
function composeExhaust(dt: number) {
  const exhFault = state.faults['EXHAUST_TEMP_HIGH'];
  const faultActive = !!exhFault?.active;
  const targets: number[] | null = faultActive
    ? ((exhFault as any).targets ?? null)
    : null;

  // 故障进度 0->1 一阶滞后（8 缸一起慢慢升到各自目标值）
  const progressTarget = faultActive ? 1 : 0;
  exhaustFaultProgress +=
    ((progressTarget - exhaustFaultProgress) / FAULT_RAMP_TAU) * dt;

  for (let i = 0; i < 8; i++) {
    const normalVal = baseCylExhaust[i];
    if (targets) {
      const faultVal = targets[i];
      state.cylExhaust[i] =
        normalVal + (faultVal - normalVal) * exhaustFaultProgress + jitter(0.6);
    } else {
      state.cylExhaust[i] = normalVal + jitter(0.5);
    }
  }
  const avg = state.cylExhaust.reduce((s, v) => s + v, 0) / 8;
  state.exhaustManifold = avg - 5 + jitter(0.4);
}

function applyOtherJitter() {
  if (state.telegraph === 'STOP' || state.rpm < 0.5) {
    state.rpm = 0;
    state.loadPct = 0;
    state.power = 0;
    return;
  }
  state.rpm += jitter(0.06);
  state.loadPct += jitter(0.15);
  state.power += jitter(60);
  state.lubeOilPressure += jitter(0.02);
}

function tick() {
  if (!running) return;
  const dt = (TICK_MS / 1000) * timeScale;
  state.t += dt;

  let scripted = false;
  if (scriptMode && state.t <= SCRIPT_DURATION) {
    scripted = applyScriptedValues();
  }

  if (!scripted) {
    // 物理仿真
    stepRpm(state, dt);
    if (state.telegraph === 'STOP' && state.rpm < 0.5) state.rpm = 0;
    stepLoad(state);

    const lubeTarget = lubeTargetFromRpm(state.rpm);
    state.lubeOilPressure += ((lubeTarget - state.lubeOilPressure) / 15) * dt;

    cylAccum += dt;
    if (cylAccum >= 1.0) {
      const elapsed = cylAccum;
      cylAccum = 0;
      // stepExhaustTemp 现在写到 baseCylExhaust，不再写 state.cylExhaust
      stepExhaustTempBase(elapsed);
      // 轴承故障时滑油温度由故障逻辑接管（升到 71℃），物理层不覆盖
      // 否则用一阶滞后向负荷对应值靠拢（τ≈20s，冷却平滑）
      if (!bearingFaultActive) {
        const target = 35 + (state.loadPct / 100) * 15;
        state.lubeOilTemp += ((target - state.lubeOilTemp) / 20) * elapsed;
      }
    }
  } else {
    cylAccum += dt;
    if (cylAccum >= 1.0) cylAccum = 0;
  }

  applyOtherJitter();

  // 故障注入（转速达 68 rpm 触发）
  faultInjector.step(state);

  // ===== 故障保持阶段：报警前锁定"68转 + 100%负荷过载"场景 =====
  const exhFaultActive = !!state.faults['EXHAUST_TEMP_HIGH']?.active;
  if (exhFaultActive && !autoSlowedDown) {
    scriptMode = false; // 停止剧本爬升
    state.rpm = 68 + jitter(0.3); // 转速锁在海速 85%（68 转）
    state.rpmTarget = 68;
    state.loadPct = 100 + jitter(0.3); // 负荷异常拉到 100%（过载）
    state.power = 42310 + jitter(80);
  }

  // 用基线 + 故障渐变 + 噪声 合成最终排温（每 tick 重算，不累积）
  composeExhaust(dt);

  // ===== 中间轴承温度 =====
  if (bearingFaultActive) {
    // 故障级联：快速逼近 79℃
    state.bearingTemp +=
      ((BEARING_FAULT_TARGET - state.bearingTemp) / BEARING_FAULT_TAU) * dt;
  } else {
    stepBearingTemp(state, dt);
  }
  state.bearingTemp += jitter(0.05);

  // ===== 滑油温度：轴承超温时随之明显上升至 71℃ =====
  if (bearingFaultActive) {
    state.lubeOilTemp += ((71 - state.lubeOilTemp) / 3) * dt + jitter(0.05);
  }

  for (let i = 0; i < 8; i++) {
    state.cylPmax[i] = (state.loadPct / 100) * 195 + jitter(1.5);
  }
  scavAccum += dt;
  if (scavAccum >= 1.0) {
    scavAccum = 0;
    stepScavPressure(state);
  }
  elecAccum += dt;
  if (elecAccum >= 1.0) {
    elecAccum = 0;
    stepElectric(state);
  }

  const alarms = alarmEngine.check(state, dt);

  // ===== 故障级联 =====
  if (cylAlarmFiredAt < 0) {
    if (alarms.some(a => a.id === 'A_CYL_EXH_HIGH')) {
      cylAlarmFiredAt = state.t;
      // 排温报警 → 系统自动降速至 DEAD SLOW 微速档位（驾控/集控均生效，方向不变）
      if (!autoSlowedDown) {
        autoSlowedDown = true;
        scriptMode = false;
        state.telegraph = 'DEAD_SLOW_AHEAD';
      }
    }
  } else if (!bearingFaultActive && state.t - cylAlarmFiredAt >= 1) {
    // 报警 1 秒后触发中间轴承超温
    bearingFaultActive = true;
  }

  const nowMs = performance.now();
  const shouldPost = nowMs - lastPostMs >= UI_POST_MS || alarms.length > 0;
  if (shouldPost) {
    lastPostMs = nowMs;
    postMessage({
      type: 'tick',
      state: structuredClone(state),
      alarms
    });
  }
}

/** 物理排温一阶逼近，作用在基线（baseCylExhaust）上 */
function stepExhaustTempBase(dt: number) {
  // 借用现有 stepExhaustTemp：临时让它写 state.cylExhaust，再拷到 base
  const tmp = state.cylExhaust;
  state.cylExhaust = baseCylExhaust;
  const tmpM = state.exhaustManifold;
  state.exhaustManifold = baseExhaustManifold;
  stepExhaustTemp(state, dt);
  baseCylExhaust = state.cylExhaust;
  baseExhaustManifold = state.exhaustManifold;
  // 恢复 state.cylExhaust（接下来 composeExhaust 会重写）
  state.cylExhaust = tmp;
  state.exhaustManifold = tmpM;
}

function lubeTargetFromRpm(rpm: number) {
  // STOP (rpm=0) 待机由备用泵维持 3.1 bar；运行中由主泵提升至 4.5
  const TBL: [number, number][] = [
    [0, 3.1], [12, 3.4], [28, 3.8], [42, 4.2], [56, 4.5], [80, 4.51]
  ];
  if (rpm <= TBL[0][0]) return TBL[0][1];
  if (rpm >= TBL[TBL.length - 1][0]) return TBL[TBL.length - 1][1];
  for (let i = 1; i < TBL.length; i++) {
    if (rpm <= TBL[i][0]) {
      const [x0, y0] = TBL[i - 1];
      const [x1, y1] = TBL[i];
      const k = (rpm - x0) / (x1 - x0);
      return y0 + k * (y1 - y0);
    }
  }
  return 2.1;
}

self.onmessage = (e: MessageEvent) => {
  const msg = e.data;
  switch (msg.type) {
    case 'cmd.start':
      running = true;
      lastPostMs = 0;
      if (!timer) timer = self.setInterval(tick, TICK_MS) as unknown as number;
      break;
    case 'cmd.stop':
      running = false;
      break;
    case 'cmd.shutdown': {
      // "停止"按钮：无条件进入"停车冷却模式"
      //   - 车钟切 STOP（不论之前在什么档位）
      //   - 清除所有故障，温度/转速自然回落到 STOP 对应值
      //   - worker 继续 tick，UI 可看到温度逐渐下降
      //   - session.running 由 UI 端置为 false（不写历史 + 允许故障诊断）
      state.telegraph = 'STOP';
      state.rpmTarget = 0;
      scriptMode = false; // 退出剧本
      const exhFault = state.faults['EXHAUST_TEMP_HIGH'];
      if (exhFault) exhFault.active = false;
      bearingFaultActive = false;
      postMessage({ type: 'tick', state: structuredClone(state), alarms: [] });
      break;
    }
    case 'cmd.reset':
      running = false;
      state = emptyState();
      baseCylExhaust = Array(8).fill(25);
      baseExhaustManifold = 25;
      cylAccum = elecAccum = scavAccum = 0;
      exhaustFaultProgress = 0;
      cylAlarmFiredAt = -1;
      bearingFaultActive = false;
      autoSlowedDown = false;
      scriptMode = true;
      alarmEngine.reset();
      faultInjector.reset();
      postMessage({ type: 'tick', state: structuredClone(state), alarms: [] });
      break;
    case 'cmd.telegraph':
      state.telegraph = msg.position as TelegraphPosition;
      // 手动切档 → 进入手动模式（关闭剧本）
      scriptMode = false;
      break;
    case 'cmd.setMode':
      // 'AUTO' 启用剧本（仅当 t<=300）；'MANUAL' 关闭剧本
      scriptMode = msg.value === 'AUTO';
      break;
    case 'cmd.timeScale':
      timeScale = msg.value;
      break;
    case 'cmd.clearFault': {
      // === 故障修复 = 主机直接进入"STOP 待机"状态（无故障数据，等待人工启动）===
      // 车钟停在 STOP，转速/负荷为 0，关键参数显示正常待机值，无任何报警/故障标记。
      // 集控/驾控模式下都一致：用户后续点档位（手动）或重新点开始（自动）才会再次驱动。
      faultInjector.clear(state);
      alarmEngine.reset();
      exhaustFaultProgress = 0;
      cylAlarmFiredAt = -1;
      bearingFaultActive = false;
      autoSlowedDown = false;
      scriptMode = false; // 不再自动跑剧本
      state.t = 300;
      state.rpm = 0;
      state.rpmTarget = 0;
      state.loadPct = 0;
      state.power = 0;
      state.bearingTemp = 30;
      state.lubeOilTemp = 40;
      state.lubeOilPressure = 3.1; // STOP 待机滑油压力
      state.scavPressure = 1.0;
      state.telegraph = 'STOP';
      // 8 缸排温恢复至 STOP 待机温度（接近环境温度）
      baseCylExhaust = [35, 35, 35, 35, 35, 35, 35, 35];
      baseExhaustManifold = 35;
      for (let i = 0; i < 8; i++) state.cylExhaust[i] = baseCylExhaust[i];
      state.exhaustManifold = baseExhaustManifold;
      cylAccum = elecAccum = scavAccum = 0;
      postMessage({ type: 'tick', state: structuredClone(state), alarms: [] });
      break;
    }
  }
};
