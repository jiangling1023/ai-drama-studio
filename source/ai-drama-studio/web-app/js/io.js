import { migrate, validateProject } from './schema.js';
import { stripApiKeys, readSecrets, estimateBytes } from './storage.js';
import { getProject } from './store.js';

// localStorage 单 origin 约 5MB；导入前先估容量，避免 hydrate 之后才在 E-18 暴露超限
const MAX_BYTES = 5 * 1024 * 1024;

export function stripSecrets(project) {
  return stripApiKeys(project);
}

// 双保险：序列化串既不含 'API Key' 键名，也不含 SECRETS_KEY 中任何已知密钥值
export function validateNoKey(text) {
  if (typeof text !== 'string') return false;
  if (text.includes('API Key') || text.includes('Authorization')) return false;
  for (const value of Object.values(readSecrets())) {
    if (typeof value === 'string' && value && text.includes(value)) return false;
  }
  return true;
}

function toCsv(payload) {
  const rows = Array.isArray(payload) ? payload
    : (payload && Array.isArray(payload.片段清单) ? payload.片段清单 : [payload]);
  const keys = [];
  for (const row of rows) {
    if (row && typeof row === 'object') for (const k of Object.keys(row)) if (!keys.includes(k)) keys.push(k);
  }
  const cell = (v) => {
    const s = v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [keys.map(cell).join(','), ...rows.map(row => keys.map(k => cell(row && row[k])).join(','))].join('\n');
}

// 唯一下载出口：stripSecrets → 序列化 → validateNoKey，任一步不通过即中止，不产生文件
export function exportFile(payload, format, filename) {
  const clean = stripSecrets(payload);
  const text = format === 'csv' ? toCsv(clean) : JSON.stringify(clean, null, 2);
  if (!validateNoKey(text)) throw new Error('导出中止：检测到密钥字段或已知密钥值');
  const ext = format === 'csv' ? 'csv' : 'json';
  const name = /\.[A-Za-z0-9]+$/.test(filename) ? filename : `${filename}.${ext}`;
  const mime = format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8';
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function exportProject(project) {
  exportFile(project, 'bundle', 'ai-drama-project.json');
}

export function exportStoryboard(project, format) {
  const ext = format === 'csv' ? 'csv' : 'json';
  exportFile(project.storyboardItems || [], format, `ai-drama-storyboard.${ext}`);
}

export function exportAssembly(project, format) {
  const ext = format === 'csv' ? 'csv' : 'json';
  const assembly = project.videoAssembly || { 片段清单: [], 导出配置: null };
  exportFile(format === 'csv' ? (assembly.片段清单 || []) : assembly, format, `ai-drama-assembly.${ext}`);
}

export function importProject(file) {
  return new Promise((resolve) => {
    if (typeof FileReader === 'undefined') { resolve({ ok: false, reason: 'parse' }); return; }
    const reader = new FileReader();
    reader.onerror = () => resolve({ ok: false, reason: 'parse' });
    reader.onload = () => {
      let raw, project;
      try { raw = JSON.parse(String(reader.result)); }
      catch { resolve({ ok: false, reason: 'parse' }); return; }
      try { project = migrate(raw); }
      catch { resolve({ ok: false, reason: 'version' }); return; }
      if (!validateProject(project)) { resolve({ ok: false, reason: 'schema' }); return; }
      if (estimateBytes(project) > MAX_BYTES) { resolve({ ok: false, reason: 'quota' }); return; }
      resolve({ ok: true, project });
    };
    try { reader.readAsText(file); }
    catch { resolve({ ok: false, reason: 'parse' }); }
  });
}

// 就地覆盖唯一引用：清空原键再灌入，不新建对象、不 reload，已持有该引用的视图切换后仍读到新值
export function hydrate(project) {
  const target = getProject();
  if (!project || target === project) return;
  for (const k of Object.keys(target)) delete target[k];
  Object.assign(target, project);
  target.保存状态 = '已恢复';
}
