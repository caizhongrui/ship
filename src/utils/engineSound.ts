/**
 * 主机运行背景音（船舱内大型船舶发动机录音，循环播放）
 * 运行状态时连续大音量循环；停止/重置后干净归零。
 */
let audio: HTMLAudioElement | null = null;
let wantPlaying = false;

function ensure(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio('/engine-sound.mp3');
    audio.loop = true;
    audio.volume = 0.95;
    audio.preload = 'auto';

    // 兜底循环：mp3 文件末尾静音 padding 可能让原生 loop 失效
    audio.addEventListener('ended', () => {
      if (audio && wantPlaying) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
    });
  }
  return audio;
}

export function updateEngineSound(running: boolean, rpm: number) {
  const a = ensure();
  // 只有"运行 + rpm 真在转"才播放：集控点开始/STOP 待机 rpm=0 时静音
  const shouldPlay = running && Math.abs(rpm) > 0.5;
  wantPlaying = shouldPlay;
  if (shouldPlay) {
    a.volume = 0.95;
    a.play().catch(() => {});
  } else {
    if (!a.paused) a.pause();
  }
}

/** 重置：暂停并回到起始位置（供 重置按钮 调用） */
export function resetEngineSound() {
  wantPlaying = false;
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
}

/** 登出：彻底停止 */
export function stopEngineSound() {
  resetEngineSound();
}
