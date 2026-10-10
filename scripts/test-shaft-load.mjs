import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import * as vue from 'vue';
import ts from 'typescript';

const pageSource = readFileSync(new URL('../src/components/industrial/MeasurementAnimation.vue', import.meta.url), 'utf8');
const script = pageSource.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
const compiled = ts.transpileModule(`${script}
export { playerRef, videoRef, isPlaying, isStarting, playbackError, currentTime, duration,
  statusText, startPlayback, pausePlayback, onPlaying, onPaused, onEnded,
  updateProgress, onVideoError, formatTime };`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

function player(src = '/shaft-load.mp4') {
  const hooks = [];
  const mounts = [];
  const keyListeners = new Set();
  const calls = { play: 0, pause: 0, load: 0 };
  const media = {
    currentTime: 0, duration: src.startsWith('/arm-span.mp4') ? 23.336009 : 32.02, ended: false, error: null,
    async play() { calls.play++; },
    pause() { calls.pause++; },
    load() { calls.load++; }
  };
  const context = vm.createContext({ exports: {}, Element: KeyTarget,
    window: {
      addEventListener(name, listener) { assert.equal(name, 'keydown'); keyListeners.add(listener); },
      removeEventListener(name, listener) { assert.equal(name, 'keydown'); keyListeners.delete(listener); }
    },
    defineProps: () => ({ src, title: '测量演示', label: '测量演示动画' }),
    require(name) {
      assert.equal(name, 'vue');
      return { ...vue, onBeforeUnmount: callback => hooks.push(callback), onMounted: callback => mounts.push(callback) };
    }
  });
  vm.runInContext(compiled, context);
  const page = context.exports;
  page.videoRef.value = media;
  page.playerRef.value = { contains: element => element.inPlayer };
  mounts.forEach(callback => callback());
  return {
    page, media, calls, keyListeners,
    key(overrides = {}) {
      const event = { code: 'Space', key: ' ', repeat: false, target: null,
        defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...overrides };
      keyListeners.forEach(listener => listener(event));
      return event;
    },
    close() { hooks.forEach(callback => callback()); }
  };
}

class KeyTarget {
  constructor(kind, inPlayer = false) { this.kind = kind; this.inPlayer = inPlayer; }
  closest(selector) {
    if (selector.startsWith('input')) return ['input', 'textarea', 'select', 'editable', 'textbox', 'combobox'].includes(this.kind) ? this : null;
    return ['button', 'link', 'menuitem', 'option'].includes(this.kind) ? this : null;
  }
}

test('both measurement menus route to separate videos using the shared player', () => {
  const router = readFileSync(new URL('../src/router/index.ts', import.meta.url), 'utf8');
  assert.match(router, /path: '\/shaft-load'[\s\S]*?title: '测量轴系负荷'[\s\S]*?views\/ShaftLoad.vue/);
  assert.match(router, /path: '\/arm-span'[\s\S]*?title: '测量臂距差'[\s\S]*?views\/ArmSpan.vue/);
  const sidebar = readFileSync(new URL('../src/layouts/AppSidebar.vue', import.meta.url), 'utf8');
  assert.ok(sidebar.includes('route.path === item.path || route.path.startsWith(`${item.path}/`)'));
  assert.ok(!'/shaft-load'.startsWith('/shaft/'));
  for (const [view, title, asset] of [
    ['ShaftLoad', '测量轴系负荷', '/shaft-load.mp4?v=5'],
    ['ArmSpan', '测量臂距差', '/arm-span.mp4?v=4']
  ]) {
    const wrapper = readFileSync(new URL(`../src/views/${view}.vue`, import.meta.url), 'utf8');
    assert.ok(wrapper.includes('<MeasurementAnimation'));
    assert.ok(wrapper.includes(`title="${title}"`));
    assert.ok(wrapper.includes(`src="${asset}"`));
  }
  assert.match(pageSource, /:src="props.src"/);
  assert.doesNotMatch(pageSource, /\bautoplay\b/);
  assert.doesNotMatch(pageSource, /@click="pausePlayback"/);
  assert.doesNotMatch(pageSource, /playback-hint|按空格键暂停，再按空格键继续播放/);
});

test('both animations fill the playback region without black letterbox backgrounds', () => {
  const styles = pageSource.match(/<style scoped>([\s\S]*?)<\/style>/)[1];
  assert.match(styles, /\.animation-stage\s*\{[^}]*background:\s*var\(--c-bg-panel\)/);
  assert.match(styles, /\.animation-stage video\s*\{[^}]*object-fit:\s*fill/);
});

test('separate page instances cannot carry playback state into another animation', async () => {
  const load = player();
  await load.page.startPlayback();
  load.page.onPlaying();
  load.media.currentTime = 12.5;
  load.close();
  assert.equal(load.calls.pause, 1);
  const span = player('/arm-span.mp4');
  assert.equal(span.page.statusText.value, '待播放');
  assert.equal(span.media.currentTime, 0);
  assert.equal(span.calls.play, 0);
  await span.page.startPlayback();
  span.page.onPlaying();
  assert.equal(span.page.statusText.value, '播放中');
  assert.equal(load.page.isPlaying.value, false);
});

test('start plays and pause/resume preserves the playback position', async () => {
  const h = player();
  assert.equal(h.page.statusText.value, '待播放');
  assert.equal(h.calls.play, 0);
  await h.page.startPlayback();
  h.page.onPlaying();
  assert.equal(h.page.statusText.value, '播放中');
  await h.page.startPlayback();
  assert.equal(h.calls.play, 1, 'Repeated starts while playing are ignored');
  h.media.currentTime = 12.5;
  h.page.pausePlayback();
  assert.equal(h.page.statusText.value, '已暂停');
  assert.equal(h.calls.pause, 1);
  await h.page.startPlayback();
  h.page.onPlaying();
  assert.equal(h.calls.play, 2);
  assert.equal(h.media.currentTime, 12.5);
});

test('finished animation restarts from the beginning', async () => {
  const h = player();
  h.media.currentTime = h.media.duration;
  h.media.ended = true;
  h.page.onEnded();
  assert.equal(h.page.statusText.value, '播放结束，可点击开始或按空格键重播');
  await h.page.startPlayback();
  assert.equal(h.media.currentTime, 0);
  assert.equal(h.calls.play, 1);
});

test('pausing while start is pending cancels late playback without an error', async () => {
  const h = player();
  let finish;
  h.media.play = () => new Promise(resolve => { h.calls.play++; finish = resolve; });
  const pending = h.page.startPlayback();
  assert.equal(h.page.isStarting.value, true);
  await h.page.startPlayback();
  assert.equal(h.calls.play, 1);
  h.page.pausePlayback();
  finish();
  await pending;
  h.page.onPlaying();
  assert.equal(h.page.isStarting.value, false);
  assert.equal(h.page.isPlaying.value, false);
  assert.equal(h.page.playbackError.value, '');
  assert.ok(h.calls.pause >= 2);
});

test('leaving the page stops playback, including a pending start', async () => {
  const h = player();
  let finish;
  h.media.play = () => new Promise(resolve => { finish = resolve; });
  const pending = h.page.startPlayback();
  h.close();
  assert.equal(h.calls.pause, 1);
  finish();
  await pending;
  h.page.onPlaying();
  assert.equal(h.page.isPlaying.value, false);
  assert.equal(h.page.isStarting.value, false);
  assert.ok(h.calls.pause >= 2);
  await h.page.startPlayback();
  assert.equal(h.page.isStarting.value, false);
});

test('play rejection and media loading errors show a retryable message', async () => {
  const h = player();
  h.media.play = async () => { throw new Error('NotSupportedError'); };
  await h.page.startPlayback();
  assert.equal(h.page.statusText.value, '播放失败');
  assert.equal(h.page.isStarting.value, false);
  h.page.onVideoError();
  assert.match(h.page.playbackError.value, /加载失败/);
  h.media.error = { code: 4 };
  h.media.play = async () => { h.calls.play++; };
  await h.page.startPlayback();
  h.page.onPlaying();
  assert.equal(h.calls.load, 1);
  assert.equal(h.page.playbackError.value, '');
  assert.equal(h.page.statusText.value, '播放中');
});

test('progress formatting handles metadata not loaded yet and actual video duration', () => {
  const h = player();
  h.media.duration = NaN;
  h.page.updateProgress();
  assert.equal(h.page.duration.value, 0);
  h.media.duration = 32.02;
  h.media.currentTime = 12.5;
  h.page.updateProgress();
  assert.equal(h.page.currentTime.value, 12.5);
  assert.equal(h.page.formatTime(h.page.duration.value), '00:32');
  const span = player('/arm-span.mp4');
  span.page.updateProgress();
  assert.equal(span.page.duration.value, 23.336009);
  assert.equal(span.page.formatTime(span.page.duration.value), '00:23');
  assert.equal(h.page.formatTime(65.1), '01:05');
});

for (const src of ['/shaft-load.mp4', '/arm-span.mp4']) {
  test(`${src}: Space starts, pauses and resumes without losing the position`, async () => {
    const h = player(src);
    assert.equal(h.keyListeners.size, 1);
    assert.equal(h.key().defaultPrevented, true);
    await Promise.resolve();
    h.page.onPlaying();
    assert.equal(h.calls.play, 1);
    h.media.currentTime = 9.5;
    h.key();
    assert.equal(h.page.statusText.value, '已暂停');
    assert.equal(h.calls.pause, 1);
    assert.equal(h.media.currentTime, 9.5);
    h.key();
    await Promise.resolve();
    h.page.onPlaying();
    assert.equal(h.calls.play, 2);
    assert.equal(h.media.currentTime, 9.5);
    h.close();
    assert.equal(h.keyListeners.size, 0);
    assert.equal(h.key().defaultPrevented, false);
    assert.equal(h.calls.play, 2, 'Shortcuts are removed when leaving the page');
  });
}

test('Space never interferes with typing, other controls, composing or modified shortcuts', () => {
  const h = player();
  for (const kind of ['input', 'textarea', 'select', 'editable', 'textbox', 'combobox', 'button', 'link', 'menuitem', 'option']) {
    assert.equal(h.key({ target: new KeyTarget(kind) }).defaultPrevented, false, kind);
  }
  for (const overrides of [
    {code: 'Enter', key: 'Enter'}, {ctrlKey: true}, {altKey: true}, {metaKey: true},
    {shiftKey: true}, {isComposing: true}, {defaultPrevented: true}
  ]) h.key(overrides);
  assert.equal(h.calls.play, 0);
  assert.equal(h.calls.pause, 0);
});

test('holding Space does not repeatedly toggle and a focused player button triggers only one toggle', async () => {
  const h = player();
  assert.equal(h.key({repeat: true}).defaultPrevented, true);
  assert.equal(h.calls.play, 0);
  h.key({target: new KeyTarget('button', true)});
  await Promise.resolve();
  h.page.onPlaying();
  assert.equal(h.calls.play, 1);
  h.key({repeat: true});
  assert.equal(h.calls.pause, 0);
  h.key({target: new KeyTarget('button', true)});
  assert.equal(h.calls.pause, 1);
  assert.equal(h.page.statusText.value, '已暂停');
});

test('Space can cancel a pending start and replay a finished animation', async () => {
  const h = player();
  let finish;
  h.media.play = () => new Promise(resolve => { h.calls.play++; finish = resolve; });
  const pending = h.page.startPlayback();
  h.key();
  assert.equal(h.page.isStarting.value, false);
  finish();
  await pending;
  assert.equal(h.page.playbackError.value, '');
  h.media.play = async () => { h.calls.play++; };
  h.media.currentTime = h.media.duration;
  h.media.ended = true;
  h.page.onEnded();
  h.key();
  await Promise.resolve();
  assert.equal(h.media.currentTime, 0);
  assert.equal(h.calls.play, 2);
});
