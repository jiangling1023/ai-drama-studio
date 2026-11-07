import { SOURCE_MARK, V1_TEXT } from '../constants.js';

const dedupe = (list) => [...new Set((list || []).filter(w => typeof w === 'string' && w.trim()))];

// NEG-03/04：单条声明移除/置空/覆盖/注释锁定词一律拒绝，只可追加
export function rejectLockedWordRemoval(lockedWords, attempt) {
  const locked = dedupe(lockedWords);
  const s = String(attempt ?? '');
  const 移除意图 = /移除|删除|去掉|排除|置空|清空|覆盖|注释|忽略|remove|exclude/i.test(s);
  const hit = locked.some(w => s.includes(w) && (移除意图 || s.trim() === w));
  return hit
    ? { ok: false, message: V1_TEXT.LOCKED_WORD_REJECT }
    : { ok: true, message: '' };
}

export function appendShotNegative(shot, word) {
  const w = String(word ?? '').trim();
  return w ? dedupe([...(shot?.单条负面词 || []), w]) : dedupe(shot?.单条负面词);
}

// ANC/NEG 唯一组装点：返回纯值新对象，创建瞬间冻结，此后锁定/解锁/编辑不回溯（ANC-05 / NEG-01 / A5）
export function buildPromptSnapshot(ctx) {
  const p = ctx.project || {};
  const ps = p.promptSet || {};
  const 单条正向原文 = String(ctx.单条正向词 || '');

  // ANC-01/02/04：只注入已锁定人物锚点，未锁定/无锚点不注入且不阻断
  const anchors = (ctx.关联资产ID列表 || [])
    .map(id => (p.assets || []).find(a => a.资产ID === id && a.类型 === '人物' && a.锁定状态 === '已锁定'))
    .filter(Boolean);
  const 角色锚点 = anchors.map(a => ({
    资产ID: a.资产ID, 锚点标识: a.锚点标识,
    外貌描述: a.外貌描述, 服装描述: a.服装描述, 特征描述: a.特征描述, 参考图引用: a.参考图引用
  }));

  // ANC-03：锚点 > 单条同类描述，冲突词记入「被锚点覆盖」且不生效
  const 描述词 = anchors.flatMap(a => ['外貌描述', '服装描述', '特征描述']
    .flatMap(k => String(a[k] || '').split(/[，,、；;\s]+/)))
    .filter(w => w.length >= 2);
  const 被锚点覆盖 = dedupe(描述词.filter(w => 单条正向原文.includes(w)));
  let 单条正向词 = 单条正向原文;
  for (const w of 被锚点覆盖) 单条正向词 = 单条正向词.split(w).join('');

  // NEG-02/04：全局锁定词 ∪ 单条词去重；锁定词必定出现，单条移除声明被忽略（A1/A2/A3）
  const 全局锁定负面词 = ps.负面词锁定状态 === '已锁定' ? dedupe(ps.锁定词快照) : [];
  const 单条负面词 = dedupe((ctx.单条负面词 || [])
    .filter(w => rejectLockedWordRemoval(全局锁定负面词, w).ok))
    .filter(w => !全局锁定负面词.includes(w));

  const 来源模型标识 = ctx.来源模型标识
    || (p.是否强制演示数据 ? SOURCE_MARK.演示数据
      : ((p.模型配置引用 || []).length ? SOURCE_MARK.自定义 : SOURCE_MARK.演示数据));

  return {
    正向: {
      全局正向词: String(ps.全局正向词 || ''), 角色锚点,
      单条正向词: 单条正向词.trim(), 被锚点覆盖
    },
    负面: { 全局锁定负面词, 单条负面词 },
    来源标记: {
      来源模型标识, 输入快照摘要: String(ctx.对象ID || ''),
      组装规则版本: 'v1', 不回溯: true, 文本类不适用: ctx.taskType === '文本'
    }
  };
}

// F-012 唯一并入点：NEG 锁定词 ∪ 已启用/锁定的六类一致性表达 ∪ 单条负面词（F-006/F-007/F-010/F-012 共用）
export function assembleNegativePrompt(project, shotOrContext) {
  const neg = [];
  // 先入锁定词：锁定词具最高优先级且必须唯一出现，先 push 再靠末尾去重保持锁定词不被覆盖
  if (project.promptSet && project.promptSet.负面词锁定状态 === '已锁定')
    neg.push(...(project.promptSet.锁定词快照 || []));
  // 再并入一致性表达：全局锁定开启或该类别自身锁定时才计入，避免未启用类别污染负面词集
  for (const r of (project.consistencyRules || []))
    if (project.一致性约束锁定 || r.全局锁定状态) neg.push(r.提示词表达);
  if (shotOrContext && shotOrContext.单条负面词) neg.push(...shotOrContext.单条负面词);
  // 末尾去重：保持锁定词唯一，同时合并重复的一致性表达与单条词
  return [...new Set(neg)];
}
