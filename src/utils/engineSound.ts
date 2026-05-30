/**
 * 主机运行背景音（船舱内大型船舶发动机录音，循环播放）
 * 只要主机处于运转状态（session.running）就持续播放，大音量。
 *
 * 双重保险循环：HTMLAudioElement.loop = true + ended 事件兜底
 * （某些 mp3 文件末尾有静音 padding 会让原生 loop 失效）
 */
let audio: HTMLAudioElement | null = null;
let wantPlaying = false; // 期望播放状态（用户/系统意图）

function ensure(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio('/engine-sound.mp3');
    audio.loop = true;
    audio.volume = 0.95;
    audio.preload = 'auto';

    // 兜底循环：到结尾后强制重置并继续播放
    audio.addEventListener('ended', () => {
      if (audio && wantPlaying) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
    });

    // 兜底自动恢复：如果意外暂停（系统休眠、焦点切换等）而我们仍想播放，恢复
    audio.addEventListener('pause', () => {
      if (audio && wantPlaying) {
        // 微延迟避免与正常 pause 操作冲突
        setTimeout(() => {
          if (audio && wantPlaying && audio.paused) {
            audio.play().catch(() => {});
          }
        }, 200);
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
    if (a.paused) a.play().catch(() => {});
  } else {
    if (!a.paused) a.pause();
  }
}

export function stopEngineSound() {
  wantPlaying = false;
  if (audio && !audio.paused) {
    audio.pause();
    audio.currentTime = 0;
  }
}
