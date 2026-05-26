<template>
  <div class="report page">
    <div class="grid">
      <!-- 左：报告列表 -->
      <div class="ind-panel">
        <div class="ind-panel__title">
          已保存报告 ({{ reportStore.records.length }})
        </div>
        <div class="ind-panel__body sessions-body">
          <div v-if="reportStore.records.length === 0" class="empty">
            尚无诊断报告<br />
            <span class="empty-hint">
              系统将在故障诊断页点击"故障修复"时自动生成报告
            </span>
          </div>
          <div
            v-for="rec in reportStore.records"
            :key="rec.id"
            class="record-row"
            :class="{ 'is-active': currentId === rec.id }"
            @click="onPick(rec)"
          >
            <div class="rec-main">
              <div class="rec-title">
                {{ rec.form.shipName || '(未命名)' }}
              </div>
              <div class="rec-sub">
                {{ rec.savedAt }} · {{ rec.user }}
              </div>
            </div>
            <button
              class="rec-del"
              @click.stop="onDelete(rec.id)"
              title="删除"
            >
              ×
            </button>
          </div>
        </div>
      </div>

      <!-- 右：诊断报告（模板格式） -->
      <div class="ind-panel">
        <div class="ind-panel__title">
          诊 断 分 析 报 告
          <div class="header-actions">
            <button
              class="mini-btn ok"
              :disabled="!currentId"
              @click="onSave"
            >
              更新保存
            </button>
            <button class="mini-btn" :disabled="!currentId" @click="onPrint">
              打印
            </button>
            <button
              class="mini-btn primary"
              :disabled="!currentId"
              @click="onExportExcel"
            >
              导出 Excel
            </button>
          </div>
        </div>
        <div class="ind-panel__body report-body">
          <div class="report-sheet">
            <div class="row title-row">
              <div class="cell title">船 舶 数 字 孪 生 诊 断 分 析 报 告</div>
            </div>

            <div class="row">
              <div class="cell label half-1">船名：</div>
              <div class="cell input half-2">
                <input v-model="form.shipName" />
              </div>
              <div class="cell label half-1">IMO编号：</div>
              <div class="cell input half-2">
                <input v-model="form.imo" />
              </div>
            </div>

            <div class="row">
              <div class="cell label half-1">造船厂：</div>
              <div class="cell input full-3">
                <input v-model="form.shipyard" />
              </div>
              <div class="cell label half-1">壳体建造编号：</div>
              <div class="cell input half-2">
                <input v-model="form.hullNo" />
              </div>
            </div>

            <div class="row">
              <div class="cell label half-1">主机型号：</div>
              <div class="cell input full-3">
                <input v-model="form.engineModel" />
              </div>
              <div class="cell label half-1">主机编号：</div>
              <div class="cell input half-2">
                <input v-model="form.engineNo" />
              </div>
            </div>

            <div class="row">
              <div class="cell label half-1">主机建造厂：</div>
              <div class="cell input full-3">
                <input v-model="form.engineBuilder" />
              </div>
              <div class="cell input full-3"></div>
            </div>

            <div class="row">
              <div class="cell label half-1">测量地点：</div>
              <div class="cell input full-3">
                <input v-model="form.location" />
              </div>
              <div class="cell label half-1">诊断日期：</div>
              <div class="cell input half-2">
                <input v-model="form.diagDate" />
              </div>
            </div>

            <div class="row">
              <div class="cell label full-1">故障现象：</div>
              <div class="cell input wide">
                <textarea v-model="form.symptom" rows="3" />
              </div>
            </div>

            <div class="row">
              <div class="cell label full-1">故障原因分析：</div>
              <div class="cell input wide">
                <textarea v-model="form.cause" rows="4" />
              </div>
            </div>

            <div class="row">
              <div class="cell label full-1">修复后数据值：</div>
              <div class="cell input wide">
                <textarea v-model="form.repairedData" rows="4" />
              </div>
            </div>

            <div class="row">
              <div class="cell label full-1">结论：</div>
              <div class="cell input wide">
                <textarea v-model="form.conclusion" rows="3" />
              </div>
            </div>

            <div class="row">
              <div class="cell label sign">人员签字：</div>
              <div class="cell input sign-area">
                <input v-model="form.signature" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useSessionStore } from '@/stores/session';
import { useTelemetryStore } from '@/stores/telemetry';
import { useAlarmStore } from '@/stores/alarms';
import { useDiagnosisStore } from '@/stores/diagnosis';
import { useReportStore, type ReportForm, type ReportRecord } from '@/stores/report';
import ExcelJS from 'exceljs';

const session = useSessionStore();
const telemetry = useTelemetryStore();
const alarms = useAlarmStore();
const diagnosis = useDiagnosisStore();
const reportStore = useReportStore();

const currentId = ref<string>('');

const form = reactive<ReportForm>({
  shipName: '',
  imo: '',
  shipyard: '',
  hullNo: '',
  engineModel: 'MAN B&W 8G95ME-C',
  engineNo: '',
  engineBuilder: '',
  location: '',
  diagDate: '',
  symptom: '',
  cause: '',
  repairedData: '',
  conclusion: '',
  signature: ''
});

function fillFromCurrentSession() {
  form.diagDate = new Date().toISOString().slice(0, 10);
  form.signature = session.user || '';

  if (alarms.history.length > 0) {
    const lines = alarms.history
      .slice(-5)
      .map(
        a =>
          `${new Date(a.ts * 1000).toLocaleTimeString()}  L${a.level} ${a.message} (${a.tag}=${a.value})`
      );
    form.symptom = lines.join('\n');
  }
  if (diagnosis.latest?.candidates.length) {
    const top = diagnosis.latest.candidates[0];
    form.cause =
      `${top.fault}（置信度 ${(top.probability * 100).toFixed(0)}%）\n` +
      `证据：\n  • ${top.evidence.join('\n  • ')}`;
  }
  const s = telemetry.state;
  form.repairedData =
    `主机转速：${s.rpm.toFixed(1)} rpm\n` +
    `主机负荷：${s.loadPct.toFixed(1)} %\n` +
    `主机功率：${s.power.toFixed(0)} kW\n` +
    `滑油压力：${s.lubeOilPressure.toFixed(2)} bar\n` +
    `排烟总管温度：${s.exhaustManifold.toFixed(1)} ℃\n` +
    `各缸排温：${s.cylExhaust.map(v => v.toFixed(1)).join(' / ')} ℃\n` +
    `中间轴承温度：${s.bearingTemp.toFixed(1)} ℃`;
}

function clearForm() {
  Object.assign(form, {
    shipName: '',
    imo: '',
    shipyard: '',
    hullNo: '',
    engineModel: 'MAN B&W 8G95ME-C',
    engineNo: '',
    engineBuilder: '',
    location: '',
    diagDate: '',
    symptom: '',
    cause: '',
    repairedData: '',
    conclusion: '',
    signature: ''
  });
}

onMounted(async () => {
  await reportStore.load();
  // 自动选中最新一条报告（如果有）
  if (reportStore.records.length > 0) {
    onPick(reportStore.records[0]);
  } else {
    clearForm();
  }
});

function onPick(rec: ReportRecord) {
  currentId.value = rec.id;
  Object.assign(form, rec.form);
}

async function onSave() {
  if (!currentId.value) return;
  await reportStore.update(currentId.value, { ...form });
  ElMessage.success('已更新保存');
}

async function onDelete(id: string) {
  try {
    await ElMessageBox.confirm('确定删除这条报告记录？', '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    });
    await reportStore.remove(id);
    if (currentId.value === id) {
      currentId.value = '';
      clearForm();
      fillFromCurrentSession();
    }
    ElMessage.success('已删除');
  } catch {}
}

function onAutofill() {
  fillFromCurrentSession();
  ElMessage.info('已用当前会话数据重新填充');
}

function onPrint() {
  window.print();
}

// === Excel 导出（按模板结构） ===
async function onExportExcel() {
  const wb = new ExcelJS.Workbook();
  wb.creator = '船舶数字孪生诊断系统';
  const ws = wb.addWorksheet('诊断分析报告');
  ws.columns = [
    { width: 15.11 }, { width: 9 }, { width: 15 }, { width: 9 },
    { width: 7.33 }, { width: 9 }, { width: 7.66 }, { width: 9.44 }
  ];

  const fontTitle = { name: '仿宋', size: 16 };
  const fontDefault = { name: '等线', size: 11 };
  const center = { horizontal: 'center', vertical: 'middle', wrapText: true } as const;
  const left = { horizontal: 'left', vertical: 'middle', wrapText: true } as const;
  const thin = { style: 'thin', color: { argb: 'FF000000' } } as const;
  const border = { top: thin, bottom: thin, left: thin, right: thin };

  function setCell(coord: string, value: any, opts?: any) {
    const c = ws.getCell(coord);
    c.value = value;
    c.font = opts?.font ?? fontDefault;
    c.alignment = opts?.alignment ?? center;
    c.border = border;
  }

  ws.mergeCells('A1:H1');
  setCell('A1', '船舶数字孪生诊断分析报告', { font: fontTitle, alignment: center });
  ws.getRow(1).height = 27;

  ws.mergeCells('A2:B2'); ws.mergeCells('C2:D2'); ws.mergeCells('E2:F2'); ws.mergeCells('G2:H2');
  setCell('A2', '船名：'); setCell('C2', form.shipName); setCell('E2', 'IMO编号：'); setCell('G2', form.imo);

  ws.mergeCells('A3:B3'); ws.mergeCells('C3:D3'); ws.mergeCells('E3:F3'); ws.mergeCells('G3:H3');
  setCell('A3', '造船厂：'); setCell('C3', form.shipyard); setCell('E3', '壳体建造编号：'); setCell('G3', form.hullNo);

  ws.mergeCells('A4:B4'); ws.mergeCells('C4:D4'); ws.mergeCells('E4:F4'); ws.mergeCells('G4:H4');
  setCell('A4', '主机型号：'); setCell('C4', form.engineModel); setCell('E4', '主机编号：'); setCell('G4', form.engineNo);

  ws.mergeCells('A5:B5'); ws.mergeCells('C5:D5'); ws.mergeCells('E5:F5');
  setCell('A5', '主机建造厂：'); setCell('C5', form.engineBuilder); setCell('E5', '');

  ws.mergeCells('A6:B6'); ws.mergeCells('C6:D6'); ws.mergeCells('E6:F6'); ws.mergeCells('G6:H6');
  setCell('A6', '测量地点：'); setCell('C6', form.location); setCell('E6', '诊断日期：'); setCell('G6', form.diagDate);

  ws.mergeCells('A7:A8'); ws.mergeCells('B7:H8');
  setCell('A7', '故障现象：', { alignment: left });
  setCell('B7', form.symptom, { alignment: left });
  ws.getRow(8).height = 64.8;

  ws.mergeCells('A9:A10'); ws.mergeCells('B9:H10');
  setCell('A9', '故障原因分析：', { alignment: left });
  setCell('B9', form.cause, { alignment: left });
  ws.getRow(10).height = 76.2;

  ws.mergeCells('A11:A12'); ws.mergeCells('B11:H12');
  setCell('A11', '修复后数据值：', { alignment: left });
  setCell('B11', form.repairedData, { alignment: left });
  ws.getRow(12).height = 75;

  ws.mergeCells('A13:A14'); ws.mergeCells('B13:H14');
  setCell('A13', '结论：', { alignment: left });
  setCell('B13', form.conclusion, { alignment: left });
  ws.getRow(14).height = 46.2;

  ws.mergeCells('A15:H15');
  const c15 = ws.getCell('A15');
  c15.value = `人员签字：${form.signature}`;
  c15.font = fontDefault;
  c15.alignment = left;
  c15.border = border;
  ws.getRow(15).height = 18.75;

  for (let row = 1; row <= 15; row++) {
    for (let col = 1; col <= 8; col++) {
      const cell = ws.getRow(row).getCell(col);
      if (!cell.border || !cell.border.top) cell.border = border;
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const filename = `船舶数字孪生诊断分析报告_${form.shipName || form.diagDate || Date.now()}.xlsx`;

  // Tauri 环境：写到 Downloads 目录；浏览器环境：传统 a download 下载
  try {
    const { writeFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
    await writeFile(filename, new Uint8Array(buf as ArrayBuffer), {
      baseDir: BaseDirectory.Download
    });
    ElMessage.success(`已导出到下载目录：${filename}`);
  } catch (e) {
    const blob = new Blob([buf as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    ElMessage.success(`已导出 ${filename}`);
  }
}
</script>

<style scoped>
.page {
  padding: 8px;
  height: 100%;
}
.grid {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 10px;
  height: 100%;
}
.ind-panel {
  height: 100%;
}
.ind-panel__title {
  position: relative;
}
.header-actions {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  gap: 6px;
}
.mini-btn {
  background: var(--c-bg-panel);
  border: 1px solid var(--c-border-soft);
  color: var(--c-text);
  padding: 3px 10px;
  font-size: 11px;
  cursor: pointer;
  border-radius: 2px;
}
.mini-btn:hover {
  background: var(--c-bg-active);
}
.mini-btn.primary {
  background: var(--c-accent);
  color: #fff;
  border-color: var(--c-accent);
}
.mini-btn.ok {
  background: var(--c-ok);
  color: #fff;
  border-color: var(--c-ok);
}
.sessions-body {
  padding: 6px;
  overflow: auto;
}
.empty {
  text-align: center;
  color: var(--c-text-muted);
  padding: 40px 12px;
  font-size: 12px;
  line-height: 1.8;
}
.record-row {
  display: flex;
  align-items: center;
  border: 1px solid var(--c-border-soft);
  border-radius: 3px;
  background: var(--c-bg-panel-alt);
  padding: 8px 10px;
  margin-bottom: 5px;
  cursor: pointer;
  transition: all 0.12s;
}
.record-row:hover {
  border-color: var(--c-text-2);
}
.record-row.is-active {
  border-color: var(--c-accent);
  background: rgba(199, 59, 59, 0.06);
}
.rec-main {
  flex: 1;
  min-width: 0;
}
.rec-title {
  font-size: 13px;
  color: var(--c-text);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rec-sub {
  font-size: 11px;
  color: var(--c-text-muted);
  margin-top: 2px;
}
.rec-del {
  background: transparent;
  border: 1px solid var(--c-border-soft);
  color: var(--c-text-muted);
  width: 20px;
  height: 20px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 14px;
  line-height: 16px;
  margin-left: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.rec-del:hover {
  background: var(--c-accent);
  color: #fff;
  border-color: var(--c-accent);
}

.report-body {
  overflow: auto;
  padding: 12px;
  background: var(--c-bg);
}

.report-sheet {
  background: #fff;
  border: 1px solid #000;
  margin: 0 auto;
  max-width: 880px;
  font-family: '仿宋', '宋体', serif;
  color: #000;
}
.row {
  display: flex;
  border-bottom: 1px solid #000;
}
.row:last-child {
  border-bottom: none;
}
.cell {
  border-right: 1px solid #000;
  padding: 6px 10px;
  font-size: 13px;
  display: flex;
  align-items: center;
  min-height: 32px;
}
.cell:last-child {
  border-right: none;
}
.cell.title {
  width: 100%;
  justify-content: center;
  font-size: 18px;
  font-family: '仿宋', '宋体', serif;
  padding: 14px;
  letter-spacing: 4px;
  font-weight: 600;
}
.cell.label {
  background: #f5f4f8;
  color: #000;
  font-weight: 600;
  white-space: nowrap;
}
.cell.input {
  flex: 1;
}
.cell.input input,
.cell.input textarea {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  font-family: inherit;
  font-size: 13px;
  color: #000;
  resize: none;
  padding: 0;
}
.cell.input textarea {
  min-height: 60px;
  line-height: 1.6;
}
.cell.half-1 { width: 19%; }
.cell.half-2 { width: 31%; }
.cell.full-1 { width: 19%; }
.cell.full-3 { flex: 1; }
.cell.wide { flex: 1; align-items: flex-start; padding: 8px 10px; }
.cell.sign { width: 15%; }
.cell.sign-area { flex: 1; }

@media print {
  .header-actions,
  .ind-panel:first-child,
  .ind-panel__title {
    display: none !important;
  }
  .report-body {
    overflow: visible;
  }
}
</style>
