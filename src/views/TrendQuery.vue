<template>
  <div class="trend page">
    <div class="ind-panel">
      <div class="ind-panel__title">曲 线 查 询</div>
      <div class="ind-panel__body">
        <div class="toolbar">
          <span class="lbl">测点：</span>
          <el-select
            v-model="selectedTags"
            multiple
            size="small"
            placeholder="选择测点"
            style="min-width: 320px"
            collapse-tags
            collapse-tags-tooltip
          >
            <el-option
              v-for="opt in tagOptions"
              :key="opt.key"
              :label="opt.label"
              :value="opt.key"
            />
          </el-select>
          <span class="lbl">时间窗：</span>
          <el-select v-model="windowSec" size="small" style="width: 120px">
            <el-option label="近 60 秒" :value="60" />
            <el-option label="近 5 分钟" :value="300" />
            <el-option label="近 10 分钟" :value="600" />
          </el-select>
        </div>

        <div class="chart-wrap">
          <TrendChart :series="series" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import TrendChart from '@/components/industrial/TrendChart.vue';
import { useTelemetryStore } from '@/stores/telemetry';

const t = useTelemetryStore();

interface TagOpt {
  key: string;
  label: string;
  color: string;
  pick: (s: any) => number;
}

const tagOptions: TagOpt[] = [
  { key: 'rpm', label: '主机转速 rpm', color: '#FF2D2D', pick: s => s.rpm },
  { key: 'load', label: '主机负荷 %', color: '#FFD000', pick: s => s.loadPct },
  { key: 'power', label: '主机功率 kW', color: '#FF8800', pick: s => s.power },
  { key: 'manifold', label: '排烟总管温度 ℃', color: '#22CC55', pick: s => s.exhaustManifold },
  { key: 'bearing', label: '中间轴承温度 ℃', color: '#33A8FF', pick: s => s.bearingTemp },
  { key: 'scav', label: '扫气压力 bar', color: '#B14EFF', pick: s => s.scavPressure },
  { key: 'vib', label: '轴系振动 mm/s', color: '#00E0E0', pick: s => s.shaftVibration },
  { key: 'volt', label: '电网电压 V', color: '#FFFFFF', pick: s => s.busVoltage },
  { key: 'freq', label: '电网频率 Hz', color: '#FF99CC', pick: s => s.busFrequency }
];

const selectedTags = ref<string[]>(['rpm', 'load', 'bearing']);
const windowSec = ref(300);

const series = computed(() => {
  // 以单调时间轴 monoT 为 x，确保故障修复后剧本重放也能在曲线上连续显示
  const lastMono =
    t.history.length > 0 ? t.history[t.history.length - 1].monoT : 0;
  const min = lastMono - windowSec.value;
  const filtered = t.history.filter(h => h.monoT >= min);
  return selectedTags.value
    .map(k => tagOptions.find(o => o.key === k))
    .filter((x): x is TagOpt => !!x)
    .map(opt => ({
      name: opt.label,
      color: opt.color,
      data: filtered.map(h => [h.monoT, opt.pick(h)] as [number, number])
    }));
});
</script>

<style scoped>
.page {
  padding: 8px;
  height: 100%;
}
.ind-panel {
  height: 100%;
}
.toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 10px;
  font-size: 12px;
}
.lbl {
  color: var(--c-text-2);
}
.chart-wrap {
  height: calc(100% - 40px);
}
</style>
