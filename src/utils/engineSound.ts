/**
 * 主机运行背景音（船舱内大型船舶发动机录音，循环播放）
 * 仿真运行且转速 > 0 时播放，音量随转速变化，停止时淡出暂停。
 */
let audio: HTMLAudioElement | null = null;

function ensure(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio('/engine-sound.mp3');
    audio.loop = true;
    audio.volume = 0.35;
    audio.preload = 'auto';
  }
  return audio;
}

/** 根据转速更新播放/音量（rpm 0~80 → 音量 0.2~0.6） */
export function updateEngineSound(running: boolean, rpm: number) {
  const a = ensure();
  if (running && rpm > 3) {
    a.volume = Math.max(0, Math.min(0.6, 0.2 + (rpm / 80) * 0.4));
    if (a.paused) a.play().catch(() => {});
  } else {
    if (!a.paused) a.pause();
  }
}

export function stopEngineSound() {
  if (audio && !audio.paused) {
    audio.pause();
    audio.currentTime = 0;
  }
}
