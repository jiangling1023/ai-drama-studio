import { STEP_DOT } from '../constants.js';

// 派生只读：页面不得自行遍历统计，全部从真实工程数据现算
export function effectiveConstraints(project) {
  const p = project || {};
  const ps = p.promptSet || {};
  return {
    锁定锚点数: (p.assets || []).filter(a => a.类型 === '人物' && a.锁定状态 === '已锁定' && a.锚点标识).length,
    锁定负面词数: ps.负面词锁定状态 === '已锁定' ? (ps.锁定词快照 || []).length : 0,
    强制演示数据: !!p.是否强制演示数据
  };
}

export function missingAnchors(project, assetIds) {
  const p = project || {};
  return (assetIds || []).filter(id => {
    const a = (p.assets || []).find(x => x.资产ID === id);
    // ANC-04：资产不存在，或人物资产未锁定 / 锚点标识为空，均视为缺失有效锚点
    return !a || (a.类型 === '人物' && (a.锁定状态 !== '已锁定' || !a.锚点标识));
  });
}

export function isFrameMissing(keyFrame) {
  // 缺失帧是展示标记，由 图片引用==='' 派生，不新增状态枚举值
  return !keyFrame || !keyFrame.图片引用;
}

export function countReferences(project, kind, id) {
  const p = project || {};
  // 资产/关键帧/场次经分镜间接进入成品与片段，先展开相关分镜ID（E-16 级联引用统计）
  const 相关ID = new Set([id]);
  if (['资产', '关键帧', '场次'].includes(kind)) {
    for (const s of (p.shots || [])) {
      if (s.场次ID === id || (s.关联资产ID列表 || []).includes(id) || (s.关联关键帧ID列表 || []).includes(id)) {
        相关ID.add(s.分镜ID);
      }
    }
  }
  const hit = o => Object.values(o || {}).some(v =>
    (typeof v === 'string' && 相关ID.has(v)) || (Array.isArray(v) && v.some(x => 相关ID.has(x))));
  return {
    分镜: (p.shots || []).filter(hit).length,
    关键帧: (p.keyFrames || []).filter(hit).length,
    分镜成品: (p.storyboardItems || []).filter(hit).length,
    片段: (p.videoAssembly?.片段清单 || []).filter(hit).length
  };
}

// 12 步主链路状态点：判定依据为真实集合条目数 / 任务状态，不写死假状态
const STEP_CHECKS = [
  p => !!(p.剧本原文 || '').trim(),
  () => true,
  p => (p.scenes || []).length > 0,
  p => (p.assets || []).length > 0,
  p => (p.assets || []).some(a => a.类型 === '人物' && a.锁定状态 === '已锁定' && a.锚点标识),
  p => (p.shots || []).length > 0,
  p => (p.genTasks || []).some(t => t.类型 === '图片' && ['成功', '已降级(演示数据)'].includes(t.状态)),
  p => (p.keyFrames || []).length > 0,
  p => p.promptSet?.负面词锁定状态 === '已锁定',
  p => (p.canvasNodes || []).length > 0,
  p => (p.storyboardItems || []).length > 0,
  p => !!p.videoAssembly
];

export function stepStatus(project, step) {
  const p = project || {};
  const n = typeof step === 'number' ? step : parseInt(String(step ?? '').replace(/\D/g, ''), 10);
  const i = (Number.isFinite(n) ? n : 1) - 1;
  if (i < 0 || i >= STEP_CHECKS.length) return STEP_DOT.未开始;
  if (STEP_CHECKS[i](p)) return STEP_DOT.已完成;
  if ((p.genTasks || []).some(t => t.状态 === '进行中')) return STEP_DOT.进行中;
  return [2, 9, 10].includes(i + 1) ? STEP_DOT.可跳过 : STEP_DOT.未开始;
}

export function counts(project) {
  const p = project || {};
  return {
    集: (p.episodes || []).length,
    场次: (p.scenes || []).length,
    资产: (p.assets || []).length,
    分镜: (p.shots || []).length,
    关键帧: (p.keyFrames || []).length,
    画布节点: (p.canvasNodes || []).length,
    分镜成品: (p.storyboardItems || []).length,
    生成任务: (p.genTasks || []).length,
    模型配置: (p.modelConfigs || []).length,
    片段: (p.videoAssembly?.片段清单 || []).length,
    规划书: (p.directorPlans || []).length,
    导演任务: (p.directorTasks || []).length,
    复核报告: (p.directorReviews || []).length,
    诊断结果: (p.scriptDiagnoses || []).length,
    发现项: (p.reviewFindings || []).length
  };
}
