<template>
  <div class="engine-monitor page">
    <div class="grid">
      <!-- 左列：5 个子系统状态卡 -->
      <div class="col col-left">
        <StatusCard title="暖 缸 系 统" :items="warmItems" />
        <StatusCard title="滑 油 系 统" :items="lubeItems" />
        <StatusCard title="冷 却 水 系 统" :items="coolItems" />
        <StatusCard title="增 压 器" :items="boostItems" />
        <StatusCard title="空 冷 器" :items="airCoolerItems" />
      </div>

      <!-- 中央列：4 仪表 + 8 缸柱图 -->
      <div class="col col-center">
        <div class="ind-panel gauges-panel">
          <div class="ind-panel__body row-gauges">
            <CircleGauge
              label="转 速"
              :value="t.state.rpm"
              :min="0"
              :max="100"
              unit="rpm"
              :size="170"
            />
            <CircleGauge
              label="负 荷"
              :value="t.state.loadPct"
              :min="0"
              :max="110"
              unit="%"
              :size="170"
            />
            <CircleGauge
              label="滑 油 压 力"
              :value="t.state.lubeOilPressure"
              :min="0"
              :max="10"
              unit="bar"
              :size="170"
              :digits="2"
            />
            <CircleGauge
              label="启 动 空 气 压 力"
              :value="startAirPressure"
              :min="0"
              :max="12"
              unit="bar"
              :size="170"
              :digits="1"
            />
          </div>
        </div>

        <div class="ind-panel cyl-bar">
          <div class="ind-panel__title">各 缸 排 气 温 度（℃）</div>
          <div class="ind-panel__body cyl-body">
            <BarChart8Cyl
              :values="t.state.cylExhaust"
              :min="0"
              :max="500"
              :warn="380"
              :danger="390"
              :threshold="390"
            />
          </div>
        </div>
      </div>

      <!-- 右列：3 安全状态卡 -->
      <div class="col col-right">
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
import BarChart8Cyl from '@/components/industrial/BarChart8Cyl.vue';
import { useTelemetryStore } from '@/stores/telemetry';

const t = useTelemetryStore();

// 启动空气压力：启动前正常(≈9bar)，启动后控制稳定在 7-9 bar
const startAirPressure = computed(() => {
  if (t.state.rpm < 5) {
    return 9.0 + Math.sin(t.state.t * 0.1) * 0.2; // 启动前 ~9 bar
  }
  return 8 + Math.sin(t.state.t * 0.3) * 1; // 启动后 7-9 bar 控制带
});

// === 左列五卡 ===
const warmItems = computed<StatusItem[]>(() => [
  { label: '主机暖缸进口蒸汽压力监控', state: 'on' },
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
  { label: '主机扫气箱进口压力', state: 'on' },
  { label: '主机扫气箱进口温度', state: 'on' },
  { label: '增压器进口温度', state: 'on' },
  { label: '增压器排气温度', state: 'on' }
]);

const airCoolerItems = computed<StatusItem[]>(() => [
  { label: '主机扫气箱中冷水进口温度监控', state: 'on' },
  { label: '主机扫气箱中冷水出口温度监控', state: 'on' }
]);

// === 右列三卡（来自 04.24 报警规则） ===
const stopItems = computed<StatusItem[]>(() => [
  { label: '主机超速保护', state: t.state.rpm > 84 ? 'fault' : 'on' },
  { label: '滑油压力低紧停', state: t.state.lubeOilPressure < 1.5 ? 'fault' : 'on' },
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
  { label: '主机轴承温度高', state: 'on' },
  { label: '进气压力低', state: t.state.loadPct > 70 && t.state.scavPressure < 2.5 ? 'warn' : 'on' }
]);

const safetyItems = computed<StatusItem[]>(() => [
  { label: '主轴瓦温度监视', state: 'on' },
  { label: '滑油压力低监视', state: 'on' },
  { label: '冷却水温度监视', state: 'on' },
  { label: '滑油温度监视', state: 'on' },
  { label: '冷却水进口温度监视', state: 'on' }
]);
</script>

<style scoped>
.page {
  padding: 8px;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.grid {
  flex: 1;
  display: grid;
  grid-template-columns: 220px 1fr 220px;
  gap: 8px;
  min-height: 0;
}
.col {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow: hidden;
}
.col-left :deep(.status-card),
.col-right :deep(.status-card) {
  flex: 1 1 0;
  min-height: 0;
}
.col-center {
  min-width: 0;
}
.gauges-panel {
  height: 240px;
  flex-shrink: 0;
}
.row-gauges {
  display: flex;
  justify-content: space-around;
  align-items: center;
  height: 100%;
  padding: 8px;
}
.cyl-bar {
  flex: 1;
  min-height: 0;
}
.cyl-body {
  padding: 0;
}
</style>
