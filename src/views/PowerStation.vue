<template>
  <div class="power-station page">
    <div class="grid">
      <!-- 左侧两栏子系统状态卡 -->
      <div class="left-col">
        <StatusCard title="暖 缸 系 统" :items="warmItems" />
        <StatusCard title="滑 油 系 统" :items="lubeItems" />
        <StatusCard title="冷 却 水 系 统" :items="coolItems" />
        <StatusCard title="增 压 系 统" :items="boostItems" />
        <StatusCard title="空 气 源" :items="airItems" />
      </div>

      <!-- 中间：3 路圆形大仪表 + 3 台发电机 -->
      <div class="center-col">
        <div class="gauges-row">
          <div class="big-gauge">
            <CircleGauge
              label="电网电压"
              :value="t.state.busVoltage"
              :min="0"
              :max="500"
              unit="V"
              :size="200"
            />
          </div>
          <div class="big-gauge">
            <CircleGauge
              label="电网电流"
              :value="t.state.busCurrent"
              :min="0"
              :max="4000"
              unit="A"
              :size="200"
            />
          </div>
          <div class="big-gauge">
            <CircleGauge
              label="电网频率"
              :value="t.state.busFrequency"
              :min="50"
              :max="65"
              unit="Hz"
              :size="200"
              :digits="2"
            />
          </div>
        </div>

        <div class="ae-row">
          <div v-for="i in 3" :key="i" class="ae-card">
            <div class="ae-title">No.{{ i }} A/E</div>
            <div class="ae-stats num">
              <div>电压 V {{ aeVolt(i) }}</div>
              <div>电流 A {{ aeCurr(i) }}</div>
              <div>频率 Hz {{ aeFreq(i) }}</div>
            </div>
            <div class="ae-leds">
              <StatusDot :state="aeRunning(i) ? 'off' : 'fault'" :size="14" />
              <StatusDot :state="aeRunning(i) ? 'on' : 'off'" :size="14" />
            </div>
          </div>
        </div>

        <div class="ae-legend">运 行 指 示 灯</div>
      </div>

      <!-- 右侧两栏子系统状态卡 -->
      <div class="right-col">
        <StatusCard title="主 机 停 车" :items="stopItems" />
        <StatusCard title="主 机 降 速" :items="slowdownItems" />
        <StatusCard title="主 机 安 全" :items="safetyItems" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import CircleGauge from '@/components/industrial/CircleGauge.vue';
import StatusCard, { type StatusItem } from '@/components/industrial/StatusCard.vue';
import StatusDot from '@/components/industrial/StatusDot.vue';
import { useTelemetryStore } from '@/stores/telemetry';

const t = useTelemetryStore();

const warmItems = computed<StatusItem[]>(() => [
  { label: '主机暖缸进口气压力监控', state: 'on' },
  { label: '主机暖缸加热控制', state: 'on' }
]);
const lubeItems = computed<StatusItem[]>(() => [
  { label: '主机滑油进口压力监控', state: 'on' },
  { label: '主机滑油进口温度监控', state: 'on' },
  { label: '主机气罐排气控制', state: 'on' }
]);
const coolItems = computed<StatusItem[]>(() => [
  { label: '主机缸套冷却水进口压力监控', state: 'on' },
  { label: '主机缸套冷却水进口温度监控', state: 'on' }
]);
const boostItems = computed<StatusItem[]>(() => [
  { label: '主机扫气箱进口压力监控', value: 5.4, unit: 'bar', state: 'on' },
  { label: '主机扫气箱进口温度监控', value: 40.5, unit: '℃', state: 'on' },
  { label: '增压器进口温度监控', value: 40.2, unit: '℃', state: 'on' },
  { label: '增压器排气温度监控', value: 41.9, unit: '℃', state: 'on' }
]);
const airItems = computed<StatusItem[]>(() => [
  { label: '主机控制空气进口压力监控', state: 'on' },
  { label: '主机起动空气进口压力监控', state: 'on' },
  { label: '主机扫气箱空气压力监控', state: 'on' }
]);
const stopItems = computed<StatusItem[]>(() => [
  { label: '主机超速保护', state: t.state.rpm > 84 ? 'fault' : 'on' },
  { label: '滑油压力低紧停', state: 'on' },
  { label: '主轴瓦温度高', state: t.state.bearingTemp > 90 ? 'fault' : 'on' }
]);
const slowdownItems = computed<StatusItem[]>(() => [
  { label: '主机超功率降速', state: t.state.power > 41000 ? 'warn' : 'on' },
  { label: '主机超速降速', state: t.state.rpm > 82 ? 'warn' : 'on' },
  { label: '排烟总管温度高', state: t.state.exhaustManifold > 430 ? 'warn' : 'on' },
  { label: '滑油进口温度高', state: t.state.lubeOilTemp > 60 ? 'warn' : 'on' },
  { label: '冷却水进口温度高', state: 'on' },
  { label: '中间轴承温度高', state: t.state.bearingTemp > 75 ? 'warn' : 'on' },
  { label: '扫气箱温度高', state: 'on' },
  { label: '主机轴承温度高', state: 'on' }
]);
const safetyItems = computed<StatusItem[]>(() => [
  { label: '滑油压力监视', state: 'on' },
  { label: '滑油温度监视', state: 'on' },
  { label: '冷却水温度监视', state: 'on' },
  { label: '空气源压力监视', state: 'on' },
  { label: '燃油压力监视', state: 'on' }
]);

function aeRunning(i: number) {
  // 系泊试验：1、2 号发电机并联运行，3 号备用
  return i === 1 || i === 2;
}
function aeVolt(i: number) {
  return aeRunning(i) ? t.state.busVoltage.toFixed(0) : '0';
}
function aeCurr(i: number) {
  // 两台并联，单台电流约为总电流的一半
  return aeRunning(i) ? (t.state.busCurrent / 2).toFixed(0) : '0';
}
function aeFreq(i: number) {
  return aeRunning(i) ? t.state.busFrequency.toFixed(2) : '0';
}
</script>

<style scoped>
.page {
  padding: 8px;
  height: 100%;
  overflow: hidden;
}
.grid {
  display: grid;
  grid-template-columns: 230px 1fr 230px;
  gap: 8px;
  height: 100%;
}
.left-col,
.right-col {
  display: grid;
  grid-template-rows: repeat(5, 1fr);
  gap: 6px;
  min-height: 0;
}
.right-col {
  grid-template-rows: repeat(3, 1fr);
}

.center-col {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  justify-content: flex-start;
  padding: 12px;
}
.gauges-row {
  display: flex;
  justify-content: space-around;
  width: 100%;
  gap: 32px;
}
.big-gauge {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.ae-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  width: 100%;
}
.ae-card {
  border: 1px solid var(--c-border);
  background: var(--c-bg-panel);
  padding: 10px;
  text-align: center;
}
.ae-title {
  color: var(--c-accent);
  font-size: 24px;
  font-weight: 800;
  letter-spacing: 1px;
  margin-bottom: 8px;
}
.ae-stats {
  font-size: 13px;
  color: var(--c-text);
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
  padding-left: 16px;
}
.ae-leds {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 10px;
}
.ae-legend {
  background: var(--c-warn);
  color: #000;
  padding: 4px 16px;
  font-weight: 600;
  letter-spacing: 4px;
}
</style>
