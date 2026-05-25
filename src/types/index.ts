// 全局类型定义

export type AlarmLevel = 1 | 2 | 3;

export interface TelemetryPoint {
  ts: number; // 仿真时间（秒）
  tag: string;
  value: number;
  unit: string;
  quality: 'good' | 'bad';
}

export interface AlarmEvent {
  ts: number;
  id: string;
  level: AlarmLevel;
  tag: string;
  value: number;
  threshold: number | string;
  message: string;
  acknowledged: boolean;
}

export interface DiagCandidate {
  fault: string;
  probability: number;
  evidence: string[];
  advice: string;
  trace: string;
}

export interface DiagResult {
  ts: number;
  candidates: DiagCandidate[];
}

export type TelegraphPosition =
  | 'STOP'
  | 'DEAD_SLOW_AHEAD'
  | 'SLOW_AHEAD'
  | 'HALF_AHEAD'
  | 'FULL_AHEAD'
  | 'NAV_FULL';

export interface EngineState {
  t: number; // 仿真时间秒
  rpm: number;
  rpmTarget: number;
  loadPct: number;
  power: number; // kW
  scavPressure: number; // bar(g)
  cylExhaust: number[]; // 8 个缸 ℃
  exhaustManifold: number; // ℃
  cylPmax: number[]; // 8 个缸 bar
  bearingTemp: number; // ℃ 中间轴承
  shaftVibration: number; // mm/s
  lubeOilTemp: number;
  lubeOilPressure: number;
  // 电站
  busVoltage: number;
  busFrequency: number;
  busCurrent: number;
  busActivePower: number;
  // 控制
  telegraph: TelegraphPosition;
  // 故障
  faults: Record<string, FaultParams | undefined>;
}

export interface FaultParams {
  active: boolean;
  // 例如间隙 mm
  [k: string]: unknown;
}

export interface SessionMeta {
  id: string;
  user: string;
  scenario: string;
  startedAt: number;
  endedAt?: number;
}
