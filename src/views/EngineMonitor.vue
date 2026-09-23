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

      <!-- 中央列：主机仪表 + 动力轴系综合监测 -->
      <div class="col col-center">
        <div class="ind-panel gauges-panel">
          <div class="ind-panel__body row-gauges">
            <RpmGauge
              :value="t.state.rpm"
              :max="80"
              :size="170"
              :direction="session.direction"
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
              :max="35"
              unit="bar"
              :size="170"
              :digits="1"
            />
          </div>
        </div>

        <div class="ind-panel powertrain-panel">
          <div class="ind-panel__title">船 舶 动 力 系 统 — 轴 系 故 障 诊 断</div>
          <div class="ind-panel__body powertrain-body">
            <section class="exhaust-strip" aria-label="各缸排气温度数字表">
              <div class="exhaust-strip__title">各缸排气温度</div>
              <div class="exhaust-readings">
                <div
                  v-for="(value, index) in t.state.cylExhaust"
                  :key="index"
                  class="exhaust-reading"
                  :class="{ fault: value >= 450 }"
                >
                  <span>{{ index + 1 }}#</span>
                  <strong class="num">{{ value.toFixed(1) }}</strong>
                  <em>℃</em>
                </div>
              </div>
            </section>

            <section class="powertrain-stage" aria-label="船舶主机轴系和螺旋桨监测">
              <div class="powertrain-composition">
                <div class="monitor-circles">
                  <div class="sensor-card bearing" :class="{ fault: bearingHigh }">
                    <span>中间轴承温度</span>
                    <strong class="num">{{ t.state.bearingTemp.toFixed(1) }}</strong>
                    <em>℃</em>
                  </div>

                  <div class="sensor-card vibration" :class="{ fault: vibrationHigh }">
                    <span>中间轴振动位移</span>
                    <strong class="num">{{ t.state.shaftVibration.toFixed(2) }}</strong>
                    <em>mm</em>
                  </div>

                  <div class="camera-monitor">
                    <div class="camera-circle">
                      <UsbCameraCircle />
                    </div>
                  </div>
                </div>

                <img
                  class="powertrain-img"
                  src="/powertrain.jpg"
                  alt="船舶柴油机、轴系和螺旋桨示意图"
                />
              </div>
            </section>
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
import RpmGauge from '@/components/industrial/RpmGauge.vue';
import StatusCard, { type StatusItem } from '@/components/industrial/StatusCard.vue';
import UsbCameraCircle from '@/components/industrial/UsbCameraCircle.vue';
import { useTelemetryStore } from '@/stores/telemetry';
import { useSessionStore } from '@/stores/session';

const t = useTelemetryStore();
const session = useSessionStore();
const bearingHigh = computed(() => t.state.bearingTemp >= 58);
const vibrationHigh = computed(() => t.state.shaftVibration > 0.2);

// 启动空气压力：启动前 28 bar（瓶压），启动后 23 bar（消耗后）
const startAirPressure = computed(() => {
  if (Math.abs(t.state.rpm) < 5) {
    return 28.0 + Math.sin(t.state.t * 0.1) * 0.1;
  }
  return 23.0 + Math.sin(t.state.t * 0.3) * 0.3;
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
  { label: '主机超功率降速', state: t.state.power > 43000 ? 'warn' : 'on' },
  { label: '主机超速降速', state: t.state.rpm > 82 ? 'warn' : 'on' },
  { label: '排烟总管温度高', state: t.state.exhaustManifold > 450 ? 'warn' : 'on' },
  { label: '滑油进口温度高', state: t.state.lubeOilTemp > 60 ? 'warn' : 'on' },
  { label: '冷却水进口温度高', state: 'on' },
  { label: '中间轴承温度高', state: t.state.bearingTemp >= 58 ? 'warn' : 'on' },
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
.col-left :deep(.status-card:nth-child(1)),
.col-left :deep(.status-card:nth-child(3)),
.col-left :deep(.status-card:nth-child(5)) {
  flex-grow: 4;
}
.col-left :deep(.status-card:nth-child(2)) {
  flex-grow: 5;
}
.col-left :deep(.status-card:nth-child(4)) {
  flex-grow: 7;
}
.col-right :deep(.status-card:nth-child(1)) {
  flex-grow: 5;
}
.col-right :deep(.status-card:nth-child(2)) {
  flex-grow: 11;
}
.col-right :deep(.status-card:nth-child(3)) {
  flex-grow: 7;
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
.powertrain-panel {
  flex: 1;
  min-height: 0;
}

.powertrain-body {
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 8px 10px 6px;
  overflow: hidden;
}

.exhaust-strip {
  position: relative;
  z-index: 2;
  flex-shrink: 0;
  padding: 5px 7px 7px;
  border: 1px solid var(--c-border-soft);
  border-radius: 4px;
  background: var(--c-bg-panel-alt);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.exhaust-strip__title {
  margin-bottom: 4px;
  color: var(--c-text-2);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  text-align: center;
}

.exhaust-readings {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.exhaust-reading {
  min-width: 0;
  height: 39px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 3px;
  padding: 0 7px;
  border: 1px solid #7c86a2;
  border-radius: 4px;
  background: linear-gradient(180deg, #465e91 0%, #354c7f 100%);
  color: #fff;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.22),
    0 1px 3px rgba(42, 45, 66, 0.2);
}

.exhaust-reading span {
  font-size: 10px;
  opacity: 0.85;
}

.exhaust-reading strong {
  overflow: hidden;
  font-size: clamp(13px, 1.2vw, 17px);
  line-height: 1;
  text-align: right;
  text-overflow: clip;
}

.exhaust-reading em {
  font-size: 9px;
  font-style: normal;
  opacity: 0.85;
}

.exhaust-reading.fault {
  border-color: #b91f1f;
  background: linear-gradient(180deg, #db3838 0%, #b91f1f 100%);
  box-shadow: 0 0 8px rgba(199, 59, 59, 0.48);
}

.powertrain-stage {
  --monitor-circle-size: clamp(82px, 7.5vw, 112px);
  position: relative;
  flex: 1;
  min-height: 0;
  margin-top: 5px;
  overflow: hidden;
  border: 1px solid var(--c-border-soft);
  border-radius: 4px;
  background: #dfdfdf;
}

.powertrain-composition {
  position: absolute;
  right: 1.5%;
  bottom: 2%;
  left: 1.5%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(8px, 1vh, 14px);
}

.powertrain-img {
  position: relative;
  width: 100%;
  height: auto;
  display: block;
  object-fit: contain;
  object-position: center;
  filter: saturate(0.94) contrast(1.03);
}

.monitor-circles {
  position: relative;
  z-index: 2;
  width: 100%;
  height: var(--monitor-circle-size);
}

.sensor-card {
  position: absolute;
  top: 0;
  z-index: 2;
  width: var(--monitor-circle-size);
  aspect-ratio: 1;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  transform: translateX(-50%);
  border: 3px solid #68779d;
  border-radius: 50%;
  background: rgba(247, 247, 249, 0.94);
  color: var(--c-text);
  box-shadow: 0 5px 14px rgba(45, 42, 63, 0.14);
}

.sensor-card span {
  margin-bottom: 2px;
  color: var(--c-text);
  font-size: clamp(10px, 0.85vw, 12px);
  font-weight: 700;
  white-space: nowrap;
}

.sensor-card strong {
  font-size: clamp(20px, 2vw, 28px);
  line-height: 1.1;
}

.sensor-card em {
  color: var(--c-text);
  font-size: 9px;
  font-style: normal;
}

.sensor-card.fault {
  color: var(--c-accent);
  border-color: var(--c-accent);
  box-shadow: 0 0 12px rgba(190, 45, 45, 0.32);
}

.sensor-card.bearing {
  left: 43%;
}

.sensor-card.vibration {
  left: 60%;
}

.camera-monitor {
  position: absolute;
  top: 0;
  left: 87%;
  width: var(--monitor-circle-size);
  transform: translateX(-50%);
}

.camera-circle {
  width: 100%;
  aspect-ratio: 1;
}

@media (max-width: 1360px), (max-height: 820px) {
  .col-left :deep(.ind-panel__title),
  .col-right :deep(.ind-panel__title) {
    padding: 3px 6px;
    font-size: 11px;
  }

  .col-left :deep(.status-body),
  .col-right :deep(.status-body) {
    padding: 4px 8px;
    gap: 2px;
  }

  .col-left :deep(.status-row),
  .col-right :deep(.status-row) {
    height: 20px;
    padding-bottom: 2px;
    font-size: 10px;
  }

  .gauges-panel {
    height: 216px;
  }

  .row-gauges {
    padding: 0;
    overflow: hidden;
  }

  .row-gauges :deep(.rpm-gauge),
  .row-gauges :deep(.circle-gauge) {
    margin-right: -15px;
    margin-left: -15px;
    transform: scale(0.82);
  }

  .sensor-card strong {
    font-size: 20px;
  }

  .powertrain-stage {
    --monitor-circle-size: 84px;
  }

  .exhaust-reading {
    height: 35px;
    padding: 0 5px;
  }
}

@media (max-width: 1100px) {
  .grid {
    grid-template-columns: 180px minmax(0, 1fr) 180px;
  }

  .row-gauges :deep(.rpm-gauge),
  .row-gauges :deep(.circle-gauge) {
    margin-right: -25px;
    margin-left: -25px;
    transform: scale(0.68);
  }

  .powertrain-stage {
    --monitor-circle-size: 72px;
  }

  .sensor-card span {
    font-size: 9px;
    letter-spacing: -0.3px;
  }

  .sensor-card strong {
    font-size: 18px;
  }
}
</style>
