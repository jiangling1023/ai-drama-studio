import {
  PROJECT_KEY, BACKUP_KEY, UI_KEY, SECRETS_KEY,
  createEmptyProject, migrate, validateProject
} from './schema.js';

function ls() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; }
  catch { return null; }
}

// 会话内只从 localStorage 恢复一次：重复读取会新建第二份 Project 引用并丢弃未落盘的更改
let loaded = null;

function damaged() {
  const p = createEmptyProject();
  p.保存状态 = '损坏';
  return { project: p, status: 'damaged' };
}

// 只读不写：E-17 判定必须保留原始串，损坏时绝不 setItem 覆盖
export function readRaw() {
  const s = ls();
  return s ? s.getItem(PROJECT_KEY) : null;
}

export function readSecrets() {
  const s = ls();
  if (!s) return {};
  try {
    const v = JSON.parse(s.getItem(SECRETS_KEY) || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}

// 密钥剥离落点：递归深拷贝并删除 'API Key' / 'Authorization'，主备槽与导出物结构上就不含密钥
export function stripApiKeys(value) {
  if (Array.isArray(value)) return value.map(stripApiKeys);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (k === 'API Key' || k === 'Authorization') continue;
    out[k] = stripApiKeys(v);
  }
  return out;
}

export function estimateBytes(project) {
  try { return JSON.stringify(project).length * 2; }
  catch { return 0; }
}

export function loadProject() {
  if (loaded) return loaded;
  const raw = readRaw();
  if (raw === null || raw === '') return (loaded = { project: createEmptyProject(), status: 'empty' });
  let parsed, project;
  try { parsed = JSON.parse(raw); } catch { return (loaded = damaged()); }
  try { project = migrate(parsed); } catch { return (loaded = damaged()); }
  if (!validateProject(project)) return (loaded = damaged());
  // 已恢复只置内存态，不立即回写，避免覆盖 BACKUP_KEY 里的上一次可用数据
  project.保存状态 = '已恢复';
  return (loaded = { project, status: 'ok' });
}

// E-17「恢复上一次可用数据」：只读备槽，就地灌回唯一引用，不动主槽原始串
export function loadBackup() {
  const s = ls();
  if (!s) return null;
  const raw = s.getItem(BACKUP_KEY);
  if (!raw) return null;
  let project;
  try {
    project = migrate(JSON.parse(raw));
    if (!validateProject(project)) return null;
  } catch { return null; }
  project.保存状态 = '已恢复';
  const target = loadProject().project;
  for (const k of Object.keys(target)) delete target[k];
  Object.assign(target, project);
  loaded = { project: target, status: 'ok' };
  return target;
}

function isQuota(e) {
  return !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);
}

export function saveProject(project) {
  const s = ls();
  const usedBytes = estimateBytes(project);
  if (!s) return { ok: false, reason: 'unknown', usedBytes };
  const prev = s.getItem(PROJECT_KEY);
  // 密钥抽出到 SECRETS_KEY（键=配置ID），工程 JSON 中删除该键；主/备槽永不含密钥
  const secrets = readSecrets();
  for (const cfg of (Array.isArray(project.modelConfigs) ? project.modelConfigs : [])) {
    if (cfg && cfg.配置ID && typeof cfg['API Key'] === 'string') secrets[cfg.配置ID] = cfg['API Key'];
  }
  const clean = stripApiKeys(project);
  clean.保存状态 = '已保存';
  const text = JSON.stringify(clean);
  try {
    // 双槽：先备份主槽旧值再写主槽；任一写入抛 QuotaExceededError 时主槽旧值仍完整、状态保持原值（E-18）
    if (prev !== null) s.setItem(BACKUP_KEY, prev);
    s.setItem(SECRETS_KEY, JSON.stringify(secrets));
    s.setItem(PROJECT_KEY, text);
    project.保存状态 = '已保存';
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: isQuota(e) ? 'quota' : 'unknown', usedBytes };
  }
}

export function loadUiState() {
  const s = ls();
  if (!s) return { 当前步骤: 1, 滚动位置: {} };
  try {
    const ui = JSON.parse(s.getItem(UI_KEY) || '{}');
    return {
      当前步骤: Number.isInteger(ui.当前步骤) ? ui.当前步骤 : 1,
      滚动位置: ui.滚动位置 && typeof ui.滚动位置 === 'object' && !Array.isArray(ui.滚动位置) ? ui.滚动位置 : {}
    };
  } catch { return { 当前步骤: 1, 滚动位置: {} }; }
}

export function saveUiState(ui) {
  const s = ls();
  if (!s) return;
  // UI 态不随工程导出；写失败只影响步骤/滚动记忆，不阻断主链路
  try { s.setItem(UI_KEY, JSON.stringify(ui || {})); } catch { return; }
}
