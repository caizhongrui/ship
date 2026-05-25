/**
 * 仿真运行时（主线程侧）：
 *  - 启动两个 Worker（仿真 + 诊断）
 *  - 把 worker 消息桥接到 Pinia stores
 *  - 提供命令式 API 给 UI 调用
 */
import SimulatorWorker from '@/workers/simulator.worker?worker';
import DiagnosisWorker from '@/workers/diagnosis.worker?worker';
import { useTelemetryStore } from '@/stores/telemetry';
import { useAlarmStore } from '@/stores/alarms';
import { useSessionStore } from '@/stores/session';
import { useDiagnosisStore } from '@/stores/diagnosis';
import type { TelegraphPosition } from '@/types';

let simWorker: Worker | null = null;
let diagWorker: Worker | null = null;
let booted = false;

// HMR 清理：模块被热替换前，先杀掉旧 worker，避免"幽灵 worker"和新 worker 同时往 store 写值
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    try { simWorker?.terminate(); } catch {}
    try { diagWorker?.terminate(); } catch {}
    simWorker = null;
    diagWorker = null;
    booted = false;
  });
}

export function bootSimRuntime() {
  if (booted && simWorker && diagWorker) return;

  // 防御性清理：杀掉任何遗留的 worker（HMR 残留、重复调用等情形）
  try { simWorker?.terminate(); } catch {}
  try { diagWorker?.terminate(); } catch {}

  const telemetry = useTelemetryStore();
  const alarms = useAlarmStore();
  const session = useSessionStore();
  const diagnosis = useDiagnosisStore();

  // 清空 store 残留状态
  telemetry.reset();
  alarms.reset();
  diagnosis.reset();

  simWorker = new SimulatorWorker();
  diagWorker = new DiagnosisWorker();

  if (simWorker) {
    simWorker.onmessage = (e: MessageEvent) => {
      const m = e.data;
      if (m.type === 'tick') {
        // 停止状态下：仅刷新当前快照，不写曲线历史
        telemetry.update(m.state, session.running);
        session.simTime = m.state.t;
        if (session.mode === 'AUTO' && session.telegraph !== m.state.telegraph) {
          session.telegraph = m.state.telegraph;
        }
        if (m.alarms?.length) {
          for (const a of m.alarms) alarms.push(a);
        }
      }
    };
  }

  if (diagWorker) {
    diagWorker.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'result') {
        diagnosis.setLatest(e.data.result);
        diagnosis.setRunning(false);
      }
    };
  }

  booted = true;
}

export function simStart() {
  simWorker?.postMessage({ type: 'cmd.start' });
}
export function simStop() {
  simWorker?.postMessage({ type: 'cmd.stop' });
}
export function simShutdown() {
  simWorker?.postMessage({ type: 'cmd.shutdown' });
}
export function simReset() {
  simWorker?.postMessage({ type: 'cmd.reset' });
}
export function simSetTelegraph(p: TelegraphPosition) {
  simWorker?.postMessage({ type: 'cmd.telegraph', position: p });
}
export function simSetTimeScale(v: number) {
  simWorker?.postMessage({ type: 'cmd.timeScale', value: v });
}
export function simClearFault() {
  simWorker?.postMessage({ type: 'cmd.clearFault' });
}
export function simSetMode(mode: 'AUTO' | 'MANUAL') {
  simWorker?.postMessage({ type: 'cmd.setMode', value: mode });
}

export function diagAnalyze() {
  const telemetry = useTelemetryStore();
  const diagnosis = useDiagnosisStore();
  diagnosis.setRunning(true);
  diagWorker?.postMessage({ type: 'analyze', state: telemetry.state });
}
