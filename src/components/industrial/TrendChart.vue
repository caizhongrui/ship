<template>
  <div ref="el" class="trend-chart"></div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import * as echarts from 'echarts';

const props = defineProps<{
  title?: string;
  series: { name: string; color?: string; data: [number, number][] }[];
  yMin?: number;
  yMax?: number;
  unit?: string;
}>();

const el = ref<HTMLElement>();
let chart: echarts.ECharts | null = null;

function buildOption() {
  return {
    backgroundColor: 'transparent',
    grid: { top: 28, right: 16, bottom: 24, left: 48 },
    title: props.title
      ? {
          text: props.title,
          textStyle: { color: '#4a4660', fontSize: 12, fontWeight: 400 },
          left: 8,
          top: 4
        }
      : undefined,
    legend: {
      textStyle: { color: '#4a4660' },
      right: 8,
      top: 4,
      itemWidth: 12,
      itemHeight: 8
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#fff',
      borderColor: '#5e5b78',
      textStyle: { color: '#1f1e33' },
      valueFormatter: (v: number | string) =>
        typeof v === 'number' ? v.toFixed(2) : String(v)
    },
    xAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: '#b6b4c2' } },
      axisLabel: { color: '#7a7790', fontSize: 10 },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      min: props.yMin,
      max: props.yMax,
      axisLine: { lineStyle: { color: '#b6b4c2' } },
      axisLabel: {
        color: '#7a7790',
        fontSize: 10,
        formatter: (v: number) => v.toFixed(0)
      },
      splitLine: { lineStyle: { color: '#d6d4dc' } }
    },
    series: props.series.map(s => ({
      name: s.name,
      type: 'line',
      smooth: true,
      symbol: 'none',
      lineStyle: { color: s.color || '#c73b3b', width: 1.6 },
      itemStyle: { color: s.color || '#c73b3b' },
      data: s.data
    }))
  };
}

onMounted(() => {
  if (!el.value) return;
  chart = echarts.init(el.value, undefined, { renderer: 'canvas' });
  chart.setOption(buildOption() as any);
  window.addEventListener('resize', resize);
});
onUnmounted(() => {
  window.removeEventListener('resize', resize);
  chart?.dispose();
});

function resize() {
  chart?.resize();
}

watch(
  () => props.series,
  () => chart?.setOption(buildOption() as any),
  { deep: true }
);
</script>

<style scoped>
.trend-chart {
  width: 100%;
  height: 100%;
  min-height: 120px;
}
</style>
