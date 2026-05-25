// 设计 token：颜色 / 间距 / 字号
// 颜色风格暂定深色工业风（参照康富科技船电系统布局），可调整。

export const colors = {
  bg: '#000000',
  bgPanel: '#0B0F14',
  bgPanelAlt: '#121821',
  border: '#FFFFFF',
  borderSoft: '#33425A',

  textPrimary: '#FFFFFF',
  textSecondary: '#B5C0D0',
  textMuted: '#7A8699',

  accent: '#FF2D2D', // 红：选中/告警/标题
  warn: '#FFD000', // 黄：特殊菜单/警告
  ok: '#22CC55', // 绿：运行
  info: '#33A8FF',

  alarmL1: '#FFD000',
  alarmL2: '#FF8800',
  alarmL3: '#FF2222'
} as const;

export const sizes = {
  headerH: 56,
  sidebarW: 200,
  statusH: 32,
  radius: 4
} as const;

export const fonts = {
  cn: '"Microsoft YaHei", "PingFang SC", "Source Han Sans CN", system-ui, sans-serif',
  num: '"JetBrains Mono", "Roboto Mono", Consolas, "Courier New", monospace'
} as const;
