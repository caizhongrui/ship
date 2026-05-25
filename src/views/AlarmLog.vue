<template>
  <div class="alarm-log page">
    <div class="ind-panel">
      <div class="ind-panel__title">报 警 记 录</div>
      <div class="ind-panel__body">
        <div class="filter-bar">
          <span class="lbl">级别：</span>
          <el-select v-model="filterLevel" size="small" style="width: 120px">
            <el-option label="全部" :value="0" />
            <el-option label="一级" :value="1" />
            <el-option label="二级" :value="2" />
            <el-option label="三级" :value="3" />
          </el-select>
          <span class="lbl">关键词：</span>
          <el-input v-model="kw" size="small" placeholder="测点 / 描述" style="width: 200px" />
          <span class="spacer"></span>
          <el-button size="small" @click="alarms.history = []">清空</el-button>
        </div>

        <el-table :data="filtered" stripe size="small" height="calc(100% - 50px)">
          <el-table-column prop="ts" label="时间" width="180">
            <template #default="{ row }">
              {{ fmt(row.ts) }}
            </template>
          </el-table-column>
          <el-table-column label="级别" width="80">
            <template #default="{ row }">
              <span :class="`lvl L${row.level}`">L{{ row.level }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="tag" label="测点" min-width="220" />
          <el-table-column prop="value" label="当前值" width="100" align="right" />
          <el-table-column prop="threshold" label="阈值" width="100" align="right" />
          <el-table-column prop="message" label="描述" min-width="260" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <span :style="{ color: row.acknowledged ? '#22CC55' : '#FF2D2D' }">
                {{ row.acknowledged ? '已确认' : '未处理' }}
              </span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAlarmStore } from '@/stores/alarms';

const alarms = useAlarmStore();
const filterLevel = ref(0);
const kw = ref('');

const filtered = computed(() =>
  [...alarms.history]
    .reverse()
    .filter(
      a =>
        (filterLevel.value === 0 || a.level === filterLevel.value) &&
        (!kw.value ||
          a.tag.includes(kw.value) ||
          a.message.includes(kw.value))
    )
);

function fmt(ts: number) {
  return new Date(ts * 1000).toISOString().replace('T', ' ').slice(0, 19);
}
</script>

<style scoped>
.page {
  padding: 8px;
  height: 100%;
}
.ind-panel {
  height: 100%;
}
.filter-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 12px;
}
.lbl {
  color: var(--c-text-2);
}
.spacer {
  flex: 1;
}
.lvl {
  display: inline-block;
  width: 28px;
  height: 18px;
  line-height: 18px;
  border-radius: 2px;
  text-align: center;
  font-size: 11px;
  color: #000;
  font-weight: 700;
}
.lvl.L1 {
  background: var(--c-alarm-1);
}
.lvl.L2 {
  background: var(--c-alarm-2);
  color: #fff;
}
.lvl.L3 {
  background: var(--c-alarm-3);
  color: #fff;
}
</style>
