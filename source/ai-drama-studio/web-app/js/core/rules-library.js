// 规则库唯一读写入口（G-1）：内置规则只读，本模块只写 rulesLibrary.固定引用
import { BUILTIN_RULES, BUILTIN_TEMPLATES, BUILTIN_COMPOSITIONS, RULES_SOURCE } from '../demo/rules-library.js';
import { uid, now } from './uid.js';

export { RULES_SOURCE };

const 五阶段 = ['剧本', '分镜', '画面资产', '视频', '审阅'];

function 内置(project) {
  const lib = (project || {}).rulesLibrary;
  // 旧工程（v3 及以前）无 rulesLibrary 时回落打包副本，不因缺字段报错
  return Array.isArray(lib?.内置规则) && lib.内置规则.length ? lib.内置规则 : BUILTIN_RULES;
}

function 保证库(project) {
  const p = project || {};
  if (!p.rulesLibrary || typeof p.rulesLibrary !== 'object') {
    p.rulesLibrary = { 内置规则: BUILTIN_RULES.map(r => ({ ...r })), 固定引用: [] };
  }
  if (!Array.isArray(p.rulesLibrary.固定引用)) p.rulesLibrary.固定引用 = [];
  return p.rulesLibrary;
}

// 合并内置（只读）与固定引用：是否固定到项目 由 固定引用 派生，不存第二份布尔（CR-05-05）
export function getRules(project) {
  const 固定 = new Set(((project || {}).rulesLibrary?.固定引用 || []).map(x => x.规则ID));
  return 内置(project).map(r => ({ ...r, 是否固定到项目: 固定.has(r.规则ID), 来源: RULES_SOURCE }));
}

// 阶段 + 类型双维筛选可叠加；关键词命中 标题 / 摘要 / 正文 / 标签 任一即算
export function queryRules(project, { 阶段, 类型, 关键词 } = {}) {
  const 词 = String(关键词 ?? '').trim();
  return getRules(project).filter(r =>
    (!阶段 || r.阶段 === 阶段) &&
    (!类型 || r.类型 === 类型) &&
    (!词 || r.标题.includes(词) || String(r.摘要 || '').includes(词) ||
      String(r.正文 || '').includes(词) || (r.标签 || []).some(t => String(t).includes(词))));
}

export function countByStage(project) {
  const 统计 = Object.fromEntries(五阶段.map(s => [s, 0]));
  for (const r of getRules(project)) if (r.阶段 in 统计) 统计[r.阶段] += 1;
  return 统计;
}

export function isFixed(project, ruleId) {
  return ((project || {}).rulesLibrary?.固定引用 || []).some(x => x.规则ID === ruleId);
}

// 幂等固定：重复固定不产生第二条引用，直接返回原因（E-31）
export function toggleFix(project, ruleId) {
  if (!内置(project).some(r => r.规则ID === ruleId)) return { ok: false, reason: '规则不存在' };
  const lib = 保证库(project);
  if (lib.固定引用.some(x => x.规则ID === ruleId)) return { ok: false, reason: '已固定' };
  lib.固定引用.push({ 固定ID: uid('fx'), 规则ID: ruleId, 固定时间: now() });
  return { ok: true };
}

export function unfixRule(project, ruleId) {
  const 引用 = (project || {}).rulesLibrary?.固定引用;
  if (!Array.isArray(引用)) return { ok: false, reason: '未固定' };
  const i = 引用.findIndex(x => x.规则ID === ruleId);
  if (i < 0) return { ok: false, reason: '未固定' };
  引用.splice(i, 1);
  return { ok: true };
}

export function getTemplates(project) {
  const list = (project || {}).ruleTemplates;
  return (Array.isArray(list) && list.length ? list : BUILTIN_TEMPLATES).map(t => ({ ...t, 占位符: [...(t.占位符 || [])], 来源: RULES_SOURCE }));
}

export function getCompositions(project) {
  const list = (project || {}).compositionPresets;
  return (Array.isArray(list) && list.length ? list : BUILTIN_COMPOSITIONS).map(c => ({ ...c, 来源: RULES_SOURCE }));
}

// 按镜头场景文本与情绪标签命中「适用场景」词条数排序，命中数相同保持原组别顺序
export function recommendCompositions(project, sceneText, emotionTag, topN = 3) {
  const 文本 = `${sceneText ?? ''} ${emotionTag ?? ''}`;
  return getCompositions(project)
    .map(c => {
      const 命中 = String(c.适用场景 || '').split(/[/、]/).map(t => t.trim()).filter(Boolean)
        .filter(t => 文本.includes(t)).length;
      return { ...c, 命中数: 命中, 推荐理由: `适用场景命中 ${命中}` };
    })
    .sort((a, b) => b.命中数 - a.命中数)
    .slice(0, topN);
}
