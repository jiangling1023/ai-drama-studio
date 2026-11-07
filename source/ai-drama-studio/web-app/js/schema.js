// 数据契约唯一真源；uid/now/DIAGNOSIS_CONFIG 均唯一来源，不内联（G-1 / §20.1）
import { uid, now } from './core/uid.js';
import { DIAGNOSIS_CONFIG } from './constants.js';
// CR-05-05：3 集合内置数据随包预置，内置区只读（不提供用户改写入口）
import { BUILTIN_RULES, BUILTIN_TEMPLATES, BUILTIN_COMPOSITIONS } from './demo/rules-library.js';

/**
 * V3 四类新对象字段（§2.1，逐字照抄 V3 §9，中文键名；仅注释，不导出 class）
 *
 * @typedef {Object} ShotDeconstruction
 * @property {string} 条目ID @property {string} 项目ID
 * @property {('项目内分镜'|'逆向工程')} 来源类型
 * @property {string} [关联分镜ID] @property {string} [逆向工程源]
 * @property {number} 镜头序号 @property {string} 时间码 @property {number} 时长
 * @property {string[]} 主体身份 @property {{锚点标识:string,参考标识:string}} 外观锚点
 * @property {string} 动作轨迹 @property {string} 表情变化
 * @property {{前景:string,后景:string,关系:string}} 场景空间
 * @property {string} 景别 @property {string} 机位 @property {string} 焦段 @property {string} 构图 @property {string} 景深
 * @property {string} 运镜方式 @property {string} 运动速度 @property {string} 光线方向
 * @property {string} 综合色温 @property {string} 材质
 * @property {string} 节奏 @property {string} 转场 @property {string} 特效 @property {string} 环境声音
 * @property {{起始画面:string,人物动作:string,摄影运动:string,结束画面:string,镜头衔接:string}} 衔接标注
 * @property {string[]} 一致性标记 @property {string} 生成时间
 *
 * @typedef {Object} PromptArchitectResult
 * @property {string} 结果ID @property {string} 项目ID @property {string} 关联镜头拆解ID
 * @property {string} 目标模型 @property {('agnes-ai视频'|'自定义视频模型'|'演示')} 目标模型类型
 * @property {string} 正向提示词 @property {string} 负面提示词
 * @property {Record<string,unknown>} 八要素结构
 * @property {('真实模型'|'演示数据')} 来源标记
 * @property {string[]} 一致性约束组 @property {string} 生成时间
 *
 * @typedef {Object} ConsistencyRule
 * @property {string} 规则ID
 * @property {('人物变脸'|'服装脱落'|'肢体错位'|'背景闪烁'|'动作断裂'|'物理关系失真')} 类别
 * @property {string} 判定口径 @property {string} 提示词表达
 * @property {string} 关联时间轴字段
 * @property {boolean} 全局锁定状态
 * @property {('回写修正建议'|'阻断标记')} 处置方式
 *
 * @typedef {Object} ReverseAnalysis
 * @property {string} 分析ID @property {string} 项目ID @property {string} 输入描述文本
 * @property {ShotDeconstruction[]} 镜头拆解
 * @property {Array<{要素:string,取值:string}>} 八要素提取
 * @property {string} 可迁移方法摘要 @property {boolean} 已脱敏声明
 * @property {('真实模型'|'演示数据')} 数据来源标记 @property {string} 生成时间
 */
export const SCHEMA_VERSION = 4;
// 四键沿用 V1 冻结名；ai-drama: 前缀即 Pages 同 origin 下的命名空间（§11e）
export const PROJECT_KEY = 'ai-drama:project:v1', BACKUP_KEY = 'ai-drama:project:backup:v1';
export const UI_KEY = 'ai-drama:ui:v1', SECRETS_KEY = 'ai-drama:secrets:v1';
export { uid, now };

export function createEmptyProject() {
  const t = now(), promptSetId = uid('ps');
  return {
    项目ID: uid('prj'), 名称: '未命名工程', 一句话创意: '', 剧本原文: '', 剧本来源: null,
    提示词组ID: promptSetId, 画布ID: uid('cv'), 模型配置引用: [],
    保存状态: '新建', 创建时间: t, 更新时间: t,
    schemaVersion: SCHEMA_VERSION,
    是否强制演示数据: false, 关闭动效: false, 诊断口径配置: DIAGNOSIS_CONFIG.VERSION,
    episodes: [], scenes: [], assets: [], shots: [], keyFrames: [],
    promptSet: { 组ID: promptSetId, 全局正向词: '', 全局负面词: [],
                 负面词锁定状态: '未锁定', 锁定词快照: [], 锁定时间: null, 解锁时间: null },
    canvasNodes: [], storyboardItems: [], genTasks: [], modelConfigs: [], videoAssembly: null,
    directorPlans: [], directorTasks: [], directorReviews: [], scriptDiagnoses: [], reviewFindings: [],
    一致性约束锁定: true,
    shotDeconstructions: [],
    promptArchitectResults: [],
    reverseAnalyses: [],
    consistencyRules: [
      { 规则ID:'cr-1', 类别:'人物变脸', 判定口径:'同角色相邻镜头外貌/年龄/种族突变', 提示词表达:'锁定角色外观锚点，禁止面部特征突变或换脸', 关联时间轴字段:'主体身份 + 外观锚点', 全局锁定状态:true, 处置方式:'回写修正建议' },
      { 规则ID:'cr-2', 类别:'服装脱落', 判定口径:'同角色相邻镜头服装材质/颜色/配饰缺失或改变', 提示词表达:'保持角色服装一致，禁止服装消失或材质突变', 关联时间轴字段:'外观锚点(服装)', 全局锁定状态:true, 处置方式:'回写修正建议' },
      { 规则ID:'cr-3', 类别:'肢体错位', 判定口径:'肢体数量/位置/比例违背解剖或上一镜', 提示词表达:'保持人体结构正确，禁止肢体扭曲或错位', 关联时间轴字段:'动作轨迹 + 衔接标注.人物动作', 全局锁定状态:true, 处置方式:'回写修正建议' },
      { 规则ID:'cr-4', 类别:'背景闪烁', 判定口径:'同场景背景元素/光照跳变或噪点闪烁', 提示词表达:'保持背景稳定连贯，禁止背景闪烁或跳变', 关联时间轴字段:'场景空间 + 综合色温', 全局锁定状态:true, 处置方式:'回写修正建议' },
      { 规则ID:'cr-5', 类别:'动作断裂', 判定口径:'动作轨迹不连续/物体凭空出现消失', 提示词表达:'保持动作与物体运动连续，禁止动作断裂', 关联时间轴字段:'动作轨迹 + 运镜方式', 全局锁定状态:true, 处置方式:'回写修正建议' },
      { 规则ID:'cr-6', 类别:'物理关系失真', 判定口径:'遮挡/重力/透视/尺度违背物理常理', 提示词表达:'保持物理关系真实，禁止违反重力/透视/尺度', 关联时间轴字段:'场景空间 + 景深', 全局锁定状态:true, 处置方式:'回写修正建议' },
    ],
    // CR-05：检查前置三级确认唯一真值（三布尔），默认全部未确认；生成视频前须 3/3
    检查前置确认: { 文字: false, 图: false, 视频: false },
    // 内置区 18 条只读，固定项由 固定引用 派生（固定ID / 规则ID / 固定时间）
    rulesLibrary: { 内置规则: BUILTIN_RULES.map(r => ({ ...r, 标签: [...(r.标签 || [])] })), 固定引用: [] },
    ruleTemplates: BUILTIN_TEMPLATES.map(t => ({ ...t, 占位符: [...(t.占位符 || [])] })),
    compositionPresets: BUILTIN_COMPOSITIONS.map(c => ({ ...c }))
  };
}

const ROOT_KEYS = [
  '项目ID', '名称', '一句话创意', '剧本原文', '剧本来源', '提示词组ID', '画布ID',
  '模型配置引用', '保存状态', '创建时间', '更新时间', 'schemaVersion',
  '是否强制演示数据', '关闭动效', '诊断口径配置', 'promptSet', 'videoAssembly'
];
const ARRAY_KEYS = [
  'episodes', 'scenes', 'assets', 'shots', 'keyFrames', 'canvasNodes',
  'storyboardItems', 'genTasks', 'modelConfigs',
  'directorPlans', 'directorTasks', 'directorReviews', 'scriptDiagnoses', 'reviewFindings'
];
const V2_ARRAY_KEYS = ['directorPlans', 'directorTasks', 'directorReviews', 'scriptDiagnoses', 'reviewFindings'];
const PROMPT_KEYS = ['组ID', '全局正向词', '全局负面词', '负面词锁定状态', '锁定词快照', '锁定时间', '解锁时间'];
const ID_FIELD = {
  episodes: '集ID', scenes: '场次ID', assets: '资产ID', shots: '分镜ID', keyFrames: '帧ID',
  canvasNodes: '节点ID', storyboardItems: '成品ID', genTasks: '任务ID', modelConfigs: '配置ID',
  directorPlans: '规划书ID', directorTasks: '任务ID', directorReviews: '报告ID',
  scriptDiagnoses: '诊断ID', reviewFindings: 'findingID'
};

export function validateProject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  for (const k of ROOT_KEYS) if (!(k in obj)) return false;
  if (!Number.isInteger(obj.schemaVersion)) return false;
  for (const k of ARRAY_KEYS) if (!Array.isArray(obj[k])) return false;
  const ps = obj.promptSet;
  if (!ps || typeof ps !== 'object' || Array.isArray(ps)) return false;
  for (const k of PROMPT_KEYS) if (!(k in ps)) return false;
  if (obj.videoAssembly !== null && (typeof obj.videoAssembly !== 'object' || Array.isArray(obj.videoAssembly))) return false;
  if (!Array.isArray(obj.模型配置引用) || obj.模型配置引用.some(id => typeof id !== 'string')) return false;
  // 引用 ID 可解析只校验形态：悬空校验属 derive.js（V1 §3.5 / E-16），损坏判定不越界重建引用图
  for (const k of ARRAY_KEYS) {
    const field = ID_FIELD[k];
    for (const item of obj[k]) {
      if (!item || typeof item !== 'object' || typeof item[field] !== 'string' || !item[field]) return false;
    }
  }
  return true;
}

export function migrate(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('工程数据格式非法');
  const v = raw.schemaVersion;
  // 高于当前版本拒绝且不静默降级，importProject 据此返回 reason='version'
  if (typeof v === 'number' && v > SCHEMA_VERSION) throw new Error('工程文件版本高于当前工作台，无法导入');
  if (v === SCHEMA_VERSION) return raw;
  // 无版本视为 v1：按 createEmptyProject 形状逐字段补默认值，不覆盖已有值
  const base = createEmptyProject();
  for (const k of Object.keys(base)) {
    if (V2_ARRAY_KEYS.includes(k) || k === '关闭动效' || k === '诊断口径配置') continue;
    if (!(k in raw)) raw[k] = base[k];
  }
  if (raw.promptSet && typeof raw.promptSet === 'object') {
    for (const k of PROMPT_KEYS) if (!(k in raw.promptSet)) raw.promptSet[k] = base.promptSet[k];
  }
  // v1→v2 唯一新增分支：5 类空集合 + 关闭动效=false + 诊断口径配置=VERSION，逐项补默认值不覆盖已有值
  for (const k of V2_ARRAY_KEYS) if (!(k in raw)) raw[k] = [];
  if (!('关闭动效' in raw)) raw.关闭动效 = false;
  if (!('诊断口径配置' in raw)) raw.诊断口径配置 = DIAGNOSIS_CONFIG.VERSION;
  // v2→v3：补 4 空集合 + 一致性约束锁定=true + 6 条一致性种子；不覆盖已有值，已有 consistencyRules 则保留（§2.2）
  if (raw && raw.schemaVersion === 2) {
    if (!('一致性约束锁定' in raw)) raw.一致性约束锁定 = true;
    if (!Array.isArray(raw.shotDeconstructions)) raw.shotDeconstructions = [];
    if (!Array.isArray(raw.promptArchitectResults)) raw.promptArchitectResults = [];
    if (!Array.isArray(raw.reverseAnalyses)) raw.reverseAnalyses = [];
    if (!Array.isArray(raw.consistencyRules)) raw.consistencyRules = [
      { 规则ID:'cr-1', 类别:'人物变脸', 判定口径:'同角色相邻镜头外貌/年龄/种族突变', 提示词表达:'锁定角色外观锚点，禁止面部特征突变或换脸', 关联时间轴字段:'主体身份 + 外观锚点', 全局锁定状态:true, 处置方式:'回写修正建议' },
      { 规则ID:'cr-2', 类别:'服装脱落', 判定口径:'同角色相邻镜头服装材质/颜色/配饰缺失或改变', 提示词表达:'保持角色服装一致，禁止服装消失或材质突变', 关联时间轴字段:'外观锚点(服装)', 全局锁定状态:true, 处置方式:'回写修正建议' },
      { 规则ID:'cr-3', 类别:'肢体错位', 判定口径:'肢体数量/位置/比例违背解剖或上一镜', 提示词表达:'保持人体结构正确，禁止肢体扭曲或错位', 关联时间轴字段:'动作轨迹 + 衔接标注.人物动作', 全局锁定状态:true, 处置方式:'回写修正建议' },
      { 规则ID:'cr-4', 类别:'背景闪烁', 判定口径:'同场景背景元素/光照跳变或噪点闪烁', 提示词表达:'保持背景稳定连贯，禁止背景闪烁或跳变', 关联时间轴字段:'场景空间 + 综合色温', 全局锁定状态:true, 处置方式:'回写修正建议' },
      { 规则ID:'cr-5', 类别:'动作断裂', 判定口径:'动作轨迹不连续/物体凭空出现消失', 提示词表达:'保持动作与物体运动连续，禁止动作断裂', 关联时间轴字段:'动作轨迹 + 运镜方式', 全局锁定状态:true, 处置方式:'回写修正建议' },
      { 规则ID:'cr-6', 类别:'物理关系失真', 判定口径:'遮挡/重力/透视/尺度违背物理常理', 提示词表达:'保持物理关系真实，禁止违反重力/透视/尺度', 关联时间轴字段:'场景空间 + 景深', 全局锁定状态:true, 处置方式:'回写修正建议' },
    ];
    raw.schemaVersion = 3;
  }
  // v3→v4：补 3 集合与检查前置确认（三布尔默认 false）；已有 rulesLibrary / 固定引用 一律保留，只补缺失内置区
  if (raw && raw.schemaVersion === 3) {
    if (!raw.检查前置确认 || typeof raw.检查前置确认 !== 'object') raw.检查前置确认 = { 文字: false, 图: false, 视频: false };
    else for (const k of ['文字', '图', '视频']) if (typeof raw.检查前置确认[k] !== 'boolean') raw.检查前置确认[k] = false;
    if (!raw.rulesLibrary || typeof raw.rulesLibrary !== 'object') raw.rulesLibrary = { 内置规则: [], 固定引用: [] };
    if (!Array.isArray(raw.rulesLibrary.内置规则) || !raw.rulesLibrary.内置规则.length) {
      raw.rulesLibrary.内置规则 = BUILTIN_RULES.map(r => ({ ...r, 标签: [...(r.标签 || [])] }));
    }
    if (!Array.isArray(raw.rulesLibrary.固定引用)) raw.rulesLibrary.固定引用 = [];
    if (!Array.isArray(raw.ruleTemplates) || !raw.ruleTemplates.length) {
      raw.ruleTemplates = BUILTIN_TEMPLATES.map(t => ({ ...t, 占位符: [...(t.占位符 || [])] }));
    }
    if (!Array.isArray(raw.compositionPresets) || !raw.compositionPresets.length) {
      raw.compositionPresets = BUILTIN_COMPOSITIONS.map(c => ({ ...c }));
    }
    raw.schemaVersion = 4;
  }
  raw.schemaVersion = SCHEMA_VERSION;
  return raw;
}
