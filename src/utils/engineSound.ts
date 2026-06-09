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

export function updateEngineSound(running: boolean, _rpm: number) {
  const a = ensure();
  wantPlaying = running;
  if (running) {
    a.volume = 0.95;
    // 不检查 paused，无脑 play()（已在播放则 Promise 直接 resolve）
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
