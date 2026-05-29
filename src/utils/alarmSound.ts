/**
 * 报警音效（Web Audio API 合成，无需外部音频文件）
 * 浏览器自动播放策略要求先有用户交互——登录点击即满足。
 */
let ctx: AudioContext | null = null;

function ensureCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const AC =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      ctx = new AC();
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * 播放报警"嘀-嘀-嘀"三连音（双频交替，类似工业报警器）
 */
export function playAlarmBeep(times = 3) {
  const c = ensureCtx();
  if (!c) return;
  const now = c.currentTime;
  const dur = 0.22;
  const gap = 0.13;
  for (let i = 0; i < times; i++) {
    const t0 = now + i * (dur + gap);
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'square';
    // 双频交替：880 / 740 Hz
    osc.frequency.value = i % 2 === 0 ? 880 : 740;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.22, t0 + 0.02);
    gain.gain.setValueAtTime(0.22, t0 + dur - 0.04);
    gain.gain.linearRampToValueAtTime(0, t0 + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
}
