import { defineStore, acceptHMRUpdate } from 'pinia';
import { ref } from 'vue';
import {
  BaseDirectory,
  readTextFile,
  writeTextFile,
  exists
} from '@tauri-apps/plugin-fs';

export interface ReportForm {
  shipName: string;
  imo: string;
  shipyard: string;
  hullNo: string;
  engineModel: string;
  engineNo: string;
  engineBuilder: string;
  location: string;
  diagDate: string;
  symptom: string;
  cause: string;
  repairedData: string;
  conclusion: string;
  signature: string;
}

export interface ReportRecord {
  id: string;
  savedAt: string; // YYYY-MM-DD HH:mm:ss
  user: string;
  scenario: string;
  form: ReportForm;
}

const FILE = 'reports.json';

/**
 * 报告记录持久化：
 *  - Tauri 环境下写到 %APPDATA%/com.boyo.shipdigitaltwin/reports.json
 *  - 非 Tauri 环境（纯浏览器）回退 localStorage
 */
export const useReportStore = defineStore('report', () => {
  const records = ref<ReportRecord[]>([]);
  const loaded = ref(false);

  async function load() {
    if (loaded.value) return;
    try {
      const has = await exists(FILE, { baseDir: BaseDirectory.AppData });
      if (has) {
        const text = await readTextFile(FILE, { baseDir: BaseDirectory.AppData });
        records.value = JSON.parse(text);
      }
    } catch (e) {
      // 浏览器模式回退
      try {
        const text = localStorage.getItem('reports.json');
        if (text) records.value = JSON.parse(text);
      } catch {}
    }
    loaded.value = true;
  }

  async function persist() {
    const json = JSON.stringify(records.value, null, 2);
    try {
      await writeTextFile(FILE, json, { baseDir: BaseDirectory.AppData });
    } catch (e) {
      try {
        localStorage.setItem('reports.json', json);
      } catch {}
    }
  }

  async function save(payload: Omit<ReportRecord, 'id' | 'savedAt'>) {
    const rec: ReportRecord = {
      ...payload,
      id: `R${Date.now()}`,
      savedAt: new Date()
        .toISOString()
        .replace('T', ' ')
        .slice(0, 19)
    };
    records.value.unshift(rec);
    await persist();
    return rec;
  }

  async function update(id: string, form: ReportForm) {
    const rec = records.value.find(r => r.id === id);
    if (!rec) return;
    rec.form = { ...form };
    rec.savedAt = new Date()
      .toISOString()
      .replace('T', ' ')
      .slice(0, 19);
    await persist();
  }

  async function remove(id: string) {
    records.value = records.value.filter(r => r.id !== id);
    await persist();
  }

  return { records, loaded, load, save, update, remove };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useReportStore, import.meta.hot));
}
