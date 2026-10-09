<template>
  <div ref="playerRef" class="measurement-animation page">
    <section class="ind-panel">
      <div class="ind-panel__title">{{ props.title }}</div>
      <div class="ind-panel__body playback-body">
        <div class="playback-toolbar">
          <el-button
            type="primary"
            :disabled="isPlaying || isStarting"
            @click="startPlayback"
          >开始</el-button>
          <span class="playback-hint">按空格键暂停，再按空格键继续播放</span>
          <span class="playback-status" role="status" aria-live="polite">{{ statusText }}</span>
          <span class="playback-time num">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
        </div>
        <div v-if="playbackError" class="playback-error" role="alert">{{ playbackError }}</div>
        <div class="animation-stage">
          <video
            ref="videoRef"
            :src="props.src"
            preload="metadata"
            playsinline
            :aria-label="props.label"
            @playing="onPlaying"
            @pause="onPaused"
            @ended="onEnded"
            @loadedmetadata="updateProgress"
            @timeupdate="updateProgress"
            @error="onVideoError"
          ></video>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps<{
  title: string;
  src: string;
  label: string;
}>();

const playerRef = ref<HTMLElement | null>(null);
const videoRef = ref<HTMLVideoElement | null>(null);
const isPlaying = ref(false);
const isStarting = ref(false);
const hasStarted = ref(false);
const hasEnded = ref(false);
const playbackError = ref('');
const currentTime = ref(0);
const duration = ref(0);
let playRequestId = 0;
let disposed = false;
let playbackRequested = false;

const statusText = computed(() => {
  if (playbackError.value) return '播放失败';
  if (isStarting.value) return '正在加载…';
  if (isPlaying.value) return '播放中';
  if (hasEnded.value) return '播放结束，可点击开始或按空格键重播';
  return hasStarted.value ? '已暂停' : '待播放';
});

async function startPlayback() {
  const video = videoRef.value;
  if (!video || disposed || isPlaying.value || isStarting.value) return;
  const requestId = ++playRequestId;
  playbackRequested = true;
  isStarting.value = true;
  playbackError.value = '';
  hasEnded.value = false;
  try {
    if (video.error) video.load();
    if (video.ended) video.currentTime = 0;
    await video.play();
    if (disposed || !playbackRequested) video.pause();
  } catch (error) {
    // A pause or route change can cancel a still-pending play request.
    if (!disposed && requestId === playRequestId) {
      playbackRequested = false;
      isPlaying.value = false;
      playbackError.value = '动画未能播放，请点击开始重试。';
    }
  } finally {
    if (requestId === playRequestId) isStarting.value = false;
  }
}

function pausePlayback() {
  playRequestId++;
  playbackRequested = false;
  isStarting.value = false;
  isPlaying.value = false;
  videoRef.value?.pause();
}

function onPlaybackKeydown(event: KeyboardEvent) {
  if (disposed || event.defaultPrevented || event.isComposing ||
      event.ctrlKey || event.altKey || event.metaKey || event.shiftKey ||
      (event.code !== 'Space' && event.key !== ' ' && event.key !== 'Spacebar')) return;

  const target = event.target instanceof Element ? event.target : null;
  // Leave text entry, dropdowns and controls outside this player to the app.
  if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]')) return;
  const control = target?.closest('button, a[href], [role="button"], [role="menuitem"], [role="option"]');
  if (control && !playerRef.value?.contains(control)) return;

  // Also prevent a focused start button from firing a second click on Space.
  event.preventDefault();
  if (event.repeat) return;
  if (isPlaying.value || isStarting.value) pausePlayback();
  else void startPlayback();
}

function onPlaying() {
  if (disposed || !playbackRequested) {
    videoRef.value?.pause();
    return;
  }
  isPlaying.value = true;
  hasStarted.value = true;
  hasEnded.value = false;
  playbackError.value = '';
}

function onPaused() {
  isPlaying.value = false;
}

function onEnded() {
  playbackRequested = false;
  isPlaying.value = false;
  hasEnded.value = true;
  updateProgress();
}

function updateProgress() {
  const video = videoRef.value;
  if (!video) return;
  currentTime.value = Number.isFinite(video.currentTime) ? video.currentTime : 0;
  duration.value = Number.isFinite(video.duration) ? video.duration : 0;
}

function onVideoError() {
  pausePlayback();
  playbackError.value = '动画加载失败，请点击开始重试。';
}

function formatTime(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

onMounted(() => window.addEventListener('keydown', onPlaybackKeydown));

onBeforeUnmount(() => {
  disposed = true;
  window.removeEventListener('keydown', onPlaybackKeydown);
  pausePlayback();
});
</script>

<style scoped>
.measurement-animation {
  height: 100%;
  padding: 8px;
  display: flex;
  min-height: 0;
}
.measurement-animation > .ind-panel {
  flex: 1;
  min-width: 0;
  min-height: 0;
}
.playback-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.playback-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  flex-shrink: 0;
}
.playback-hint {
  color: var(--c-text-2);
  font-size: 13px;
}
.playback-status {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
.playback-time {
  margin-left: auto;
  color: var(--c-text-muted);
  font-size: 13px;
  white-space: nowrap;
}
.playback-error {
  color: var(--c-accent);
  font-size: 13px;
  flex-shrink: 0;
}
.animation-stage {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  background: var(--c-bg-panel);
  border: 1px solid var(--c-border-soft);
  border-radius: var(--radius);
}
.animation-stage video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: fill;
}
</style>
