<template>
  <div class="aux page">
    <div class="grid">
      <StatusCard title="暖 缸 系 统" :items="warm" />
      <StatusCard title="滑 油 系 统" :items="lube" />
      <StatusCard title="冷 却 水 系 统" :items="cool" />
      <StatusCard title="增 压 系 统" :items="boost" />
      <StatusCard title="空 气 源 系 统" :items="air" />
      <StatusCard title="燃 油 系 统" :items="fuel" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import StatusCard, { type StatusItem } from '@/components/industrial/StatusCard.vue';
import { useTelemetryStore } from '@/stores/telemetry';

const t = useTelemetryStore();

const warm = computed<StatusItem[]>(() => [
  { label: '暖缸蒸汽进口压力', value: 0.4, unit: 'MPa', state: 'on' },
  { label: '暖缸蒸汽进口温度', value: 145, unit: '℃', state: 'on' },
  { label: '暖缸出口阀位', state: 'on' },
  { label: '暖缸完成信号', state: 'on' }
]);
const lube = computed<StatusItem[]>(() => [
  { label: '滑油进口压力', value: t.state.lubeOilPressure.toFixed(2), unit: 'bar', state: 'on' },
  { label: '滑油进口温度', value: t.state.lubeOilTemp.toFixed(1), unit: '℃', state: 'on' },
  { label: '滑油滤器压差', value: 0.18, unit: 'bar', state: 'on' },
  { label: '滑油泵 1 运行', state: 'on' },
  { label: '滑油泵 2 备用', state: 'off' }
]);
const cool = computed<StatusItem[]>(() => [
  { label: '高温淡水进口压力', value: 3.2, unit: 'bar', state: 'on' },
  { label: '高温淡水进口温度', value: 78, unit: '℃', state: 'on' },
  { label: '低温淡水进口压力', value: 2.5, unit: 'bar', state: 'on' },
  { label: '低温淡水进口温度', value: 36, unit: '℃', state: 'on' },
  { label: '海水冷却泵运行', state: 'on' }
]);
const boost = computed<StatusItem[]>(() => [
  { label: '扫气箱压力', value: t.state.scavPressure.toFixed(2), unit: 'bar', state: 'on' },
  { label: '扫气箱温度', value: 40, unit: '℃', state: 'on' },
  { label: '增压器入口温度', value: 410, unit: '℃', state: 'on' },
  { label: '增压器出口温度', value: 450, unit: '℃', state: 'on' },
  { label: 'EGB 阀开度', value: 60, unit: '%', state: 'on' }
]);
const air = computed<StatusItem[]>(() => [
  { label: '主起动空气压力', value: 28, unit: 'bar', state: 'on' },
  { label: '控制空气压力', value: 7.2, unit: 'bar', state: 'on' },
  { label: '工作空气压力', value: 6.5, unit: 'bar', state: 'on' },
  { label: '空压机 1 运行', state: 'on' },
  { label: '空压机 2 备用', state: 'off' }
]);
const fuel = computed<StatusItem[]>(() => [
  { label: '重油进口压力', value: 12, unit: 'bar', state: 'on' },
  { label: '重油进口温度', value: 130, unit: '℃', state: 'on' },
  { label: '重油黏度', value: 13, unit: 'cSt', state: 'on' },
  { label: '燃油消耗量', value: 9200, unit: 'kg/h', state: 'on' },
  { label: '分油机运行', state: 'on' }
]);
</script>

<style scoped>
.page {
  padding: 8px;
  height: 100%;
  overflow: hidden;
}
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(2, 1fr);
  gap: 10px;
  height: 100%;
}
</style>
