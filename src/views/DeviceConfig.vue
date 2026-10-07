<template>
  <div class="device-page">
    <div class="page-heading">
      <div>
        <h1>设备配置</h1>
        <p>RS485 温振传感器 · 通过以太网网关连接</p>
      </div>
      <span class="save-state" :class="{ dirty }">{{ loading ? '正在加载配置…' : loadError ? '配置加载失败' : dirty ? '有未保存的修改' : '配置已同步' }}</span>
    </div>

    <div v-if="loadError" class="notice error" role="alert">{{ loadError }}</div>
    <div v-if="!desktop" class="notice">当前为浏览器预览，请在桌面客户端进行设备连接与读取测试。</div>

    <div class="device-layout">
      <section class="ind-panel config-panel">
        <div class="ind-panel__title">网关与传感器参数</div>
        <form class="config-form" @submit.prevent="saveConfig">
          <fieldset :disabled="loading || saving || !!busy || autoReading">
            <label class="field wide" for="device-ip">
              <span>网关 IP 地址 <b>*</b></span>
              <input id="device-ip" v-model="form.ip" placeholder="例如：192.168.1.100" autocomplete="off" />
            </label>
            <label class="field" for="device-port">
              <span>TCP 端口</span>
              <input id="device-port" v-model.number="form.port" type="number" min="1" max="65535" />
            </label>
            <label class="field" for="device-unit">
              <span>传感器地址</span>
              <input id="device-unit" v-model.number="form.unitId" type="number" min="1" max="254" />
            </label>
            <label class="field wide" for="device-transport">
              <span>网关通信模式</span>
              <select id="device-transport" v-model="form.transport">
                <option value="modbus-tcp">Modbus TCP（协议转换网关）</option>
                <option value="rtu-over-tcp">RTU over TCP（透明传输）</option>
              </select>
              <small>{{ transportHint }}</small>
            </label>
            <label class="field" for="device-model">
              <span>传感器型号</span>
              <select id="device-model" v-model="form.sensorType">
                <option value="single-axis">单轴温振传感器</option>
                <option value="three-axis">三轴温振传感器</option>
              </select>
            </label>
            <label class="field" for="device-function">
              <span>读取功能码</span>
              <select id="device-function" v-model.number="form.functionCode">
                <option :value="3">03 · 读保持寄存器</option>
                <option :value="4">04 · 读输入寄存器</option>
              </select>
            </label>
            <label class="field" for="device-timeout">
              <span>通信超时（ms）</span>
              <input id="device-timeout" v-model.number="form.timeoutMs" type="number" min="500" max="10000" step="100" />
            </label>
            <label class="field wide" for="device-baud">
              <span>网关 RS485 侧波特率（备忘）</span>
              <select id="device-baud" v-model="form.baudRate">
                <option :value="null">按现场网关设置</option>
                <option v-for="baud in baudRates" :key="baud" :value="baud">{{ baud }} bps</option>
              </select>
              <small>网关串口使用 8 数据位、无校验、1 停止位（8N1）。波特率须与传感器一致，请在网关管理页面设置。</small>
            </label>
          </fieldset>
          <div v-if="formError" class="form-error" role="alert">{{ formError }}</div>
          <div class="form-actions">
            <button class="device-btn primary" type="submit" :disabled="loading || saving || !!busy || autoReading">{{ saving ? '保存中…' : '保存配置' }}</button>
            <button class="device-btn" type="button" :disabled="loading || saving || !!busy || autoReading || !dirty" @click="restoreConfig">还原已保存</button>
          </div>
          <p class="form-footnote">保存后下次启动自动恢复。单次测试使用当前参数；自动读取与后台监测共享已保存配置的采集结果，不重复发送请求。停止自动读取只暂停本页刷新，后台监测继续。</p>
        </form>
      </section>

      <div class="test-column">
        <section class="ind-panel">
          <div class="ind-panel__title">通信测试</div>
          <div class="test-body">
            <div class="connection-path"><span>桌面客户端</span><i>→</i><span>网口网关</span><i>→ RS485 →</i><span>温振传感器</span></div>
            <div class="test-actions">
              <button class="device-btn" :disabled="!canTest || autoReading" @click="runTest('connection')">{{ busy === 'connection' ? '正在连接…' : '测试连接' }}</button>
              <button class="device-btn primary" :disabled="!canTest || autoReading" @click="runTest('read')">{{ busy === 'read' && !autoReading ? '正在读取…' : '读取传感器' }}</button>
              <button class="device-btn" :class="{ active: autoReading }" :disabled="!autoReading && !canTest" @click="toggleAutoRead">{{ autoReading ? '停止自动读取' : '自动读取' }}</button>
            </div>
            <div class="test-status" :class="statusClass" role="status" aria-live="polite">
              <div class="status-heading"><span class="status-dot"></span><strong>{{ statusTitle }}</strong></div>
              <p>{{ statusMessage }}</p>
              <div v-if="report" class="test-meta">
                <span class="num">{{ report.endpoint }}</span>
                <span>耗时 {{ report.elapsedMs }} ms</span>
                <span v-if="report.action === 'read'">{{ report.connectionReused ? '长连接复用' : '新建连接' }}</span>
                <span>{{ formatTime(report.sampledAt) }}</span>
                <span v-if="report.errorStage">失败环节：{{ report.errorStage }}</span>
              </div>
            </div>
          </div>
        </section>

        <section class="ind-panel measurement-panel">
          <div class="ind-panel__title">传感器测试数据<span v-if="sensorVersion !== null" class="version-note">版本寄存器：{{ sensorVersion }}</span></div>
          <div class="measurement-body">
            <template v-if="report?.ok && report.action === 'read'">
              <div class="measurement-grid" :class="{ triple: form.sensorType === 'three-axis' }">
                <div v-for="item in report.measurements" :key="item.key" class="measurement-card" :class="{ temperature: item.key === 'temperature' }">
                  <span>{{ item.label }}</span>
                  <div><strong class="num">{{ item.value.toFixed(1) }}</strong><em>{{ item.unit }}</em></div>
                  <small v-if="item.displacementMm !== null">{{ item.displacementMm.toFixed(4) }} mm</small>
                </div>
              </div>
              <p class="data-note">数据来自当前传感器；位移按 μm 显示，并提供 mm 换算。</p>
            </template>
            <div v-else class="measurement-empty">
              <span>◎</span><strong>{{ report && !report.ok ? '尚未获得有效读数' : '等待传感器数据' }}</strong>
              <p>填写网关地址后点击“读取传感器”，查看温度、振动速度、位移和加速度。</p>
            </div>
          </div>
        </section>

        <details v-if="report?.frames.length" class="ind-panel diagnostic-details">
          <summary>报文与寄存器详情 <span>{{ report.frames.length }} 组收发</span></summary>
          <div class="diagnostic-body">
            <div v-for="(frame, index) in report.frames" :key="index" class="frame-row">
              <strong>读取 {{ registerHex(frame.startAddress) }} 起的 {{ frame.count }} 个寄存器</strong>
              <div><span>发送</span><code>{{ frame.request }}</code></div>
              <div><span>接收</span><code>{{ frame.response || '未收到数据' }}</code></div>
            </div>
            <div class="register-list"><span v-for="register in report.registers" :key="register.address" class="num">{{ registerHex(register.address) }} = {{ register.raw }} ({{ registerHex(register.raw) }})</span></div>
          </div>
        </details>
        <details class="ind-panel protocol-details">
          <summary>协议及接线说明</summary>
          <div class="protocol-body">
            <p>传感器出厂地址为 1，测量寄存器使用 03 / 04 功能码、16 位大端数据，测量值除以 10。</p>
            <p v-if="form.sensorType === 'single-axis'">单轴：0x0000 温度，0x0001 速度，0x0002 位移，0x0003 加速度。</p>
            <p v-else>三轴：0x0000 温度，0x0001–0003 XYZ 速度，0x0004–0006 XYZ 位移，0x0009 版本号，0x000A–000C XYZ 加速度。</p>
            <p>供电为 10–30V DC；黄色（绿色）线接 485-A，蓝色线接 485-B。同一总线上传感器地址不能重复。</p>
            <p>保存配置不会修改传感器地址、校准值或网关串口设置。测试只读取测量数据。</p>
            <p>网关的 TCP Server 是连接工作方式，不等于 Modbus TCP 协议转换。未启用 TCP 转 RTU 功能时，客户端请选择 RTU over TCP（透明传输）。</p>
          </div>
        </details>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { isTauri } from '@tauri-apps/api/core';
import { ElMessage } from 'element-plus';
import { defaultSensorConfig, useDeviceConfigStore, type SensorDeviceConfig, type SensorTestReport } from '@/stores/deviceConfig';

const store = useDeviceConfigStore();
const desktop = isTauri();
const form = reactive<SensorDeviceConfig>(defaultSensorConfig());
const loading = ref(true);
const saving = ref(false);
const busy = ref<'' | 'connection' | 'read'>('');
const autoReading = ref(false);
const formError = ref('');
const loadError = ref('');
const testError = ref('');
const report = ref<SensorTestReport | null>(null);
const baudRates = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];
let active = true;

const dirty = computed(() => JSON.stringify(form) !== JSON.stringify(store.config));
const canTest = computed(() => desktop && !loading.value && !saving.value && !busy.value);
const transportHint = computed(() => form.transport === 'modbus-tcp'
  ? '适用于支持 Modbus TCP 转 RTU 的网关，常用端口 502。'
  : '适用于串口服务器透明传输（例如当前网关的 TCP Server / 20108）；RTU 报文包含 CRC。');
const sensorVersion = computed(() => report.value?.ok && form.sensorType === 'three-axis'
  ? report.value.registers.find(r => r.address === 9)?.raw ?? null : null);
const statusClass = computed(() => autoReading.value
  ? store.connection.status === 'failed' ? 'failed' : store.connection.status === 'connected' ? 'success' : 'working'
  : busy.value ? 'working' : testError.value || report.value && !report.value.ok ? 'failed' : report.value?.ok ? 'success' : 'idle');
const statusTitle = computed(() => autoReading.value
  ? store.connection.status === 'failed' ? '读取失败，自动重连中' : store.connection.status === 'connected' ? '连续采集中' : '正在连接传感器'
  : busy.value ? '测试进行中' : testError.value || report.value && !report.value.ok ? '测试失败' : report.value?.ok ? report.value.action === 'connection' ? '网口连接成功' : '传感器读取成功' : '尚未测试');
const statusMessage = computed(() => autoReading.value
  ? store.connection.status === 'connected' ? '与后台监测共享采集数据，收到响应后立即继续读取。' : store.connection.message
  : busy.value ? busy.value === 'connection' ? '正在连接网关 TCP 服务…' : '正在读取并校验传感器响应…' : testError.value || report.value?.message || '连接测试确认网关 TCP 服务可达；读取测试进一步确认传感器通信。');

function errorText(error: unknown) { return error instanceof Error ? error.message : String(error); }
function registerHex(value: number) { return `0x${value.toString(16).toUpperCase().padStart(4, '0')}`; }
function formatTime(value: number) { return new Date(value).toLocaleString('zh-CN', { hour12: false }); }

function validate(): string {
  const ip = form.ip.trim();
  let validIp = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip) && ip.split('.').every(p => Number(p) <= 255);
  if (ip.includes(':')) { try { new URL(`http://[${ip}]/`); validIp = true; } catch { validIp = false; } }
  if (!validIp) return '请输入有效的网关 IPv4 或 IPv6 地址。';
  const ranges: [number, number, number, string][] = [
    [form.port, 1, 65535, 'TCP 端口'], [form.unitId, 1, 254, '传感器地址'],
    [form.timeoutMs, 500, 10000, '通信超时']
  ];
  for (const [value, min, max, label] of ranges) {
    if (!Number.isInteger(value) || value < min || value > max) return `${label}须为 ${min}–${max} 范围内的整数。`;
  }
  return '';
}

async function saveConfig() {
  formError.value = validate();
  if (formError.value) return;
  saving.value = true;
  try {
    await store.save({ ...form });
    form.ip = store.config.ip;
    loadError.value = '';
    ElMessage.success('设备配置已保存，下次启动自动恢复');
  } catch (error) { formError.value = errorText(error); }
  finally { saving.value = false; }
}

function restoreConfig() { Object.assign(form, store.config); formError.value = ''; }
function stopAutoRead() { autoReading.value = false; }

async function runTest(action: 'connection' | 'read') {
  if (!active || busy.value) return;
  formError.value = validate();
  if (formError.value) { stopAutoRead(); return; }
  busy.value = action;
  testError.value = '';
  report.value = null;
  try {
    const result = await store.test({ ...form }, action);
    if (!active) return;
    report.value = result;
  } catch (error) {
    if (active) { testError.value = errorText(error); report.value = null; }
  } finally {
    busy.value = '';
  }
}

function toggleAutoRead() {
  if (autoReading.value) { stopAutoRead(); return; }
  formError.value = validate();
  if (formError.value) return;
  if (dirty.value) { formError.value = '自动读取使用后台监测的已保存配置，请先保存当前参数。'; return; }
  testError.value = '';
  autoReading.value = true;
  store.startMonitoring();
  report.value = store.latestReport;
}

watch(() => store.latestReport, value => {
  if (active && autoReading.value) report.value = value;
});
watch(form, () => { report.value = null; testError.value = ''; formError.value = ''; });
onMounted(async () => {
  try { await store.load(); if (active) Object.assign(form, store.config); }
  catch (error) { loadError.value = errorText(error); }
  finally { loading.value = false; }
});
onUnmounted(() => { active = false; stopAutoRead(); });
</script>

<style scoped>
.device-page { padding: 16px; min-height: 100%; }
.page-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
h1 { margin: 0; font-size: 22px; }
.page-heading p { margin: 5px 0 0; color: var(--c-text-2); }
.save-state { padding: 6px 10px; border-radius: 4px; background: var(--c-bg-panel); color: var(--c-text-muted); white-space: nowrap; }
.save-state.dirty { color: #8a5912; background: #fff3d8; }
.device-layout { display: grid; grid-template-columns: minmax(330px, 390px) minmax(0, 1fr); gap: 14px; align-items: start; }
.config-form { padding: 16px; }
fieldset { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 15px 12px; padding: 0; margin: 0; border: 0; min-width: 0; }
.field { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
.field.wide { grid-column: 1 / -1; }
.field > span { font-weight: 600; font-size: 12px; }
.field b { color: var(--c-accent); }
input, select { width: 100%; height: 36px; min-width: 0; padding: 0 10px; border: 1px solid var(--c-border-soft); border-radius: 4px; background: #fafafe; color: var(--c-text); font: inherit; }
input:focus, select:focus { outline: 2px solid #7885a6; outline-offset: 1px; }
.field small, .form-footnote { color: var(--c-text-muted); line-height: 1.6; font-size: 11px; }
.form-footnote { margin: 10px 0 0; }
.form-actions, .test-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.device-btn { min-height: 34px; padding: 7px 14px; border: 1px solid var(--c-border-soft); border-radius: 4px; background: var(--c-bg-active); color: var(--c-text); font: inherit; font-weight: 600; cursor: pointer; }
.device-btn.primary { background: #465a87; border-color: #465a87; color: #fff; }
.device-btn.active { background: #eaf1e8; color: #426a43; border-color: #87a78b; }
.device-btn:hover:not(:disabled) { filter: brightness(0.96); }
.device-btn:disabled, fieldset:disabled { opacity: 0.6; cursor: default; }
.form-error { color: var(--c-accent); margin-top: 12px; line-height: 1.5; }
.test-column { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.test-body { padding: 16px; }
.connection-path { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; color: var(--c-text-2); font-size: 12px; }
.connection-path span { padding: 7px 10px; border: 1px solid var(--c-border-soft); background: #f7f7fa; border-radius: 4px; }
.connection-path i { font-style: normal; color: var(--c-text-muted); }
.test-status { padding: 13px 14px; margin-top: 16px; border: 1px solid var(--c-border-soft); background: #f6f6fa; border-radius: 4px; }
.status-heading { display: flex; align-items: center; gap: 8px; }
.status-dot { width: 8px; height: 8px; background: var(--c-text-muted); border-radius: 50%; }
.test-status p { margin: 8px 0 0; font-size: 12px; color: var(--c-text-2); line-height: 1.6; overflow-wrap: anywhere; }
.test-status.success { background: #eef5ed; border-color: #a4bda1; }
.success .status-dot { background: #5b8a5a; }
.test-status.failed { background: #f9eeee; border-color: #d6aaaa; }
.failed .status-dot { background: var(--c-accent); }
.working .status-dot { background: #657dad; }
.test-meta { display: flex; flex-wrap: wrap; gap: 5px 14px; margin-top: 10px; font-size: 11px; color: var(--c-text-muted); }
.measurement-body { padding: 16px; }
.measurement-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.measurement-grid.triple { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.triple .temperature { grid-column: 1 / -1; }
.measurement-card { padding: 13px; background: #f7f7fa; border: 1px solid var(--c-border-soft); border-radius: 5px; }
.measurement-card > span { color: var(--c-text-2); font-size: 12px; }
.measurement-card > div { display: flex; align-items: baseline; gap: 6px; margin-top: 7px; }
.measurement-card strong { font-size: 27px; }
.measurement-card em { font-style: normal; color: var(--c-text-muted); font-size: 11px; }
.measurement-card small { display: block; color: var(--c-text-muted); margin-top: 5px; }
.measurement-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 190px; gap: 10px; text-align: center; color: var(--c-text-muted); }
.measurement-empty > span { font-size: 35px; color: #85839c; }
.measurement-empty p { margin: 0; max-width: 340px; font-size: 12px; line-height: 1.7; }
.data-note { font-size: 11px; color: var(--c-text-muted); margin: 12px 0 0; }
.version-note { float: right; font-size: 11px; letter-spacing: 0; font-weight: 400; }
details.ind-panel { display: block; }
summary { padding: 11px 14px; font-weight: 600; cursor: pointer; }
summary > span { font-weight: 400; color: var(--c-text-muted); margin-left: 10px; }
.diagnostic-body, .protocol-body { border-top: 1px solid var(--c-border-soft); padding: 12px 14px; }
.protocol-body p { margin: 0 0 9px; font-size: 12px; color: var(--c-text-2); line-height: 1.7; }
.protocol-body p:last-child { margin: 0; }
.frame-row + .frame-row { margin-top: 12px; }
.frame-row > strong { display: block; margin-bottom: 7px; font-size: 12px; }
.frame-row > div { display: flex; gap: 9px; padding: 4px 0; font-size: 11px; }
.frame-row code { overflow-wrap: anywhere; user-select: text; }
.frame-row div > span { color: var(--c-text-muted); flex-shrink: 0; }
.register-list { display: flex; flex-wrap: wrap; gap: 5px 14px; margin-top: 12px; font-size: 11px; color: var(--c-text-2); user-select: text; }
.notice { margin-bottom: 12px; padding: 10px 12px; background: #e9edf4; border: 1px solid #aebbd2; border-radius: 4px; line-height: 1.6; }
.notice.error { background: #f9eeee; border-color: #d6aaaa; color: var(--c-accent); }
@media (max-width: 1200px) {
  .device-page { padding: 10px; }
  .device-layout { grid-template-columns: minmax(300px, 340px) minmax(0, 1fr); gap: 10px; }
  .config-form, .test-body, .measurement-body { padding: 12px; }
  .connection-path { gap: 5px; font-size: 11px; }
  .measurement-card { padding: 10px; }
  .measurement-card strong { font-size: 23px; }
}
@media (max-width: 960px) {
  .device-layout { grid-template-columns: minmax(0, 1fr); }
  .page-heading { align-items: flex-start; }
  .save-state { font-size: 11px; }
}
</style>
