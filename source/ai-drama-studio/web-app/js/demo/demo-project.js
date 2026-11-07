// 示例工程种子：零网络 / 零随机 / 可重复；数据一律取自 demo-data.js，页面不得另造
import {
  DEMO_MARK, DEMO_SCRIPT, DEMO_EPISODES, DEMO_SCENES, DEMO_ASSETS, DEMO_SHOTS,
  DEMO_PROMPT, DEMO_STORYBOARD, DEMO_CLIPS, DEMO_DIRECTOR_PLAN, DEMO_DIRECTOR_TASKS,
  DEMO_DIRECTOR_REVIEW
} from './demo-data.js';
import { demoKeyFrame } from './demo-image.js';
import { applyCanvasCommand, buildCanvasNodes } from '../core/canvas-command.js';
import { diagnose } from '../core/diagnosis.js';
import { defaultExportConfig } from '../core/video-assembly.js';
import { now } from '../core/uid.js';
import { generateReview, generateShotTimeline, buildPromptArchitect, getConsistencyRules } from '../core/director.js';
import { TASK_STATUS, SOURCE_MARK, SAVE_STATUS, LOCK_STATE } from '../constants.js';

const clone = v => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

const 示例集 = 'demo-ep-01';

// 每条分镜两帧：帧ID 由分镜ID派生，保证重复载入后 ID 不变
// 中间事件与轮廓/尺度标注一并给全，R-06「首尾帧连续性」才有可判材料，不会整片报缺帧
function 帧列表(shots) {
  const 类型 = ['首帧', '尾帧'];
  return shots.flatMap(s => 类型.map((帧, i) => ({
    帧ID: `${s.分镜ID}-kf-${i ? 'b' : 'a'}`,
    分镜ID: s.分镜ID,
    帧类型: 帧,
    图片引用: demoKeyFrame(s.分镜ID, 帧),
    中间事件: `${s.分镜ID} ${帧 === '首帧' ? '主体推门入画' : '主体转身出画，雨声渐弱'}`,
    // R-06 读三态字符串（一致/不一致/未检查），布尔会被判成「未检查」
    轮廓位置一致: '一致',
    尺度连续: '一致',
    生成状态: '成功',
    来源标记: DEMO_MARK,
    数据来源标记: DEMO_MARK,
    创建时间: now()
  })));
}

// 4 条历史任务：2 成功 / 1 已降级(演示数据) / 1 进行中，字段对齐 gen-task.js 的 createTask 结构
const 历史任务 = [
  { 类型: '剧本', 用途: '文本', 对象ID: 'script', 状态: TASK_STATUS.成功, 来源: SOURCE_MARK['agnes-ai 文本'], 进度: 100, 降级原因: '' },
  { 类型: '资产', 用途: '文本', 对象ID: 'assets', 状态: TASK_STATUS.成功, 来源: SOURCE_MARK['agnes-ai 文本'], 进度: 100, 降级原因: '' },
  { 类型: '关键帧', 用途: '媒体', 对象ID: 'demo-sh-01', 状态: TASK_STATUS['已降级(演示数据)'], 来源: SOURCE_MARK.演示数据, 进度: 100, 降级原因: '未配置' },
  { 类型: '分镜', 用途: '文本', 对象ID: 'storyboard', 状态: TASK_STATUS.进行中, 来源: SOURCE_MARK['agnes-ai 文本'], 进度: 60, 降级原因: '' }
];

function 生成任务() {
  return 历史任务.map((t, i) => ({
    任务ID: `demo-task-0${i + 1}`,
    任务类型: t.类型, 类型: t.类型, 用途: t.用途,
    输入快照: {
      对象ID: t.对象ID,
      关联资产ID列表: t.类型 === '剧本' ? [] : ['demo-as-01'],
      帧类型: t.类型 === '关键帧' ? '首帧' : undefined
    },
    最终提示词快照: {
      // 角色锚点随快照冻结：F-004 锁定后注入，缺它会让「锚点携带完整性」整片判不通过
      正向: {
        全局正向词: DEMO_PROMPT.全局正向词, 单条正向词: '',
        角色锚点: [{ 锚点标识: 'ANC-LINXIA-01', 参考标识: 'demo-ref-01' }]
      },
      负面: { 全局锁定负面词: DEMO_PROMPT.全局负面词.slice(), 单条负面词: [] }
    },
    来源模型标识: t.来源, 来源类型: t.来源,
    状态: t.状态, 进度: t.进度,
    降级原因: t.降级原因,
    输出引用: t.状态 === TASK_STATUS['已降级(演示数据)'] ? demoKeyFrame('demo-sh-01', '首帧') : '',
    耗时: 0, 重试次数: 0,
    // 降级原因写进错误信息：状态条与调用链都从这条文案里解析「降级原因：X」
    错误信息: t.降级原因 ? `已降级为演示数据；降级原因：${t.降级原因}` : '',
    数据来源标记: DEMO_MARK,
    创建时间: now()
  }));
}

// 引擎返回空/抛错时的兜底报告：只保证页面非空，条数口径以 core 为准
function 兜底复核(p) {
  p.directorReviews = [{
    ...clone(DEMO_DIRECTOR_REVIEW),
    项目ID: p.项目ID || '',
    数据来源标记: DEMO_MARK,
    生成时间: now()
  }];
}

// 顺序：时间轴 → 成品提示词 → 复核报告；成品提示词以时间轴条目 ID 为唯一输入，复核读诊断/任务/成品
function seedDirector(p) {
  // seed 前清空这 5 个集合：core 函数是追加写，不清空会让重复 seed 条数翻倍
  p.directorReviews = [];
  p.reviewFindings = [];
  p.shotDeconstructions = [];
  p.promptArchitectResults = [];
  p.reverseAnalyses = [];

  let 时间轴 = [];
  try {
    if (!getConsistencyRules(p).length) p.consistencyRules = [];
    时间轴 = generateShotTimeline(p, { 来源类型: '项目内分镜' }) || [];
    const 镜头IDs = 时间轴.map(s => s.条目ID).filter(Boolean);
    if (镜头IDs.length) buildPromptArchitect(p, 镜头IDs, { 类型: '演示', 名称: '演示模型' });
  } catch (e) {
    时间轴 = 时间轴 || [];
  }

  let 报告 = null;
  try {
    报告 = generateReview(p, '全片');
  } catch (e) {
    报告 = null;
  }
  if (!报告) 兜底复核(p);
}

export function seedDemoProject(project) {
  const p = project || {};

  p.名称 = '示例工程 · 雨夜来信';
  p.一句话创意 = '雨夜里，一封不该出现的信把两个人重新拽回旧公寓。';
  p.剧本原文 = DEMO_SCRIPT;
  p.剧本来源 = '生成';
  p.当前集ID = 示例集;

  // 深拷贝：页面的锁定/编辑会就地改这些集合，绝不能污染模块常量
  p.episodes = clone(DEMO_EPISODES).map(e => ({ ...e, 数据来源标记: DEMO_MARK }));
  p.scenes = clone(DEMO_SCENES).map(s => ({ ...s, 数据来源标记: DEMO_MARK }));
  // 来源片段取场次正文原文（同源数据），交给 CSS 两行 clamp 出省略号；demo 数据里的 24 字硬切会让文字像被裁断
  p.assets = clone(DEMO_ASSETS).map((a, i) => ({
    ...a,
    来源文本片段: (p.scenes[i] || {}).正文 || a.来源文本片段,
    数据来源标记: DEMO_MARK
  }));
  p.shots = clone(DEMO_SHOTS).map(s => ({
    ...s,
    // 分镜引用自己那两帧：ID 规则与 帧列表 一致，缺失会让复核报「悬空引用」
    关联关键帧ID列表: [`${s.分镜ID}-kf-a`, `${s.分镜ID}-kf-b`],
    数据来源标记: DEMO_MARK
  }));
  p.keyFrames = 帧列表(p.shots);
  p.storyboardItems = clone(DEMO_STORYBOARD).map(s => ({ ...s, 数据来源标记: DEMO_MARK }));

  const 组ID = p.提示词组ID || (p.promptSet && p.promptSet.组ID) || 'demo-prompt-set';
  p.提示词组ID = 组ID;
  p.promptSet = {
    组ID,
    全局正向词: DEMO_PROMPT.全局正向词,
    全局负面词: DEMO_PROMPT.全局负面词.slice(),
    负面词锁定状态: LOCK_STATE.已锁定,
    锁定词快照: DEMO_PROMPT.全局负面词.slice(),
    锁定时间: now(),
    解锁时间: null
  };

  p.videoAssembly = {
    产物ID: 'demo-asm-01',
    片段清单: clone(DEMO_CLIPS),
    导出配置: defaultExportConfig(),
    生成时间: now()
  };

  // 画布节点由唯一指令入口生成；数据源为空时退回 buildCanvasNodes 取同构节点
  p.canvasNodes = [];
  const r = applyCanvasCommand(p, '按分镜生成', '当前集', true);
  if (!r || !r.changed || !(p.canvasNodes || []).length) {
    p.canvasNodes = buildCanvasNodes(p, '按分镜生成', '当前集').nodes || [];
  }

  p.directorPlans = [clone(DEMO_DIRECTOR_PLAN)];
  p.directorTasks = clone(DEMO_DIRECTOR_TASKS);

  // 只留一条「剧本」级诊断：复核口径取 scriptDiagnoses 末条，按场次存会让覆盖率/密度只量到最后一场
  p.scriptDiagnoses = [{ ...diagnose(p, '剧本', 'script', p.剧本原文), 来源标记: DEMO_MARK }];

  p.genTasks = 生成任务();

  // 示例工程已跑完整条链路（剧本→资产→分镜→关键帧→成品→整合）：三级前置与三方面审阅据实置为已确认
  p.检查前置确认 = { 文字: true, 图: true, 视频: true };
  p.审阅勾选 = { 故事理解: true, 画面镜头: true, 声音效果: true };

  // 基础数据（分镜 / 成品 / 诊断 / 任务）全部就位后再跑引擎，产物才与页面手动点击的结果一致
  seedDirector(p);

  p.保存状态 = SAVE_STATUS.已保存;
  p.更新时间 = now();
  return p;
}

export function resetToDemo(project) {
  const p = project || {};
  // 只清工程内容，保留项目ID / 画布ID / 模型配置等身份与配置字段
  p.episodes = [];
  p.scenes = [];
  p.assets = [];
  p.shots = [];
  p.keyFrames = [];
  p.canvasNodes = [];
  p.storyboardItems = [];
  p.genTasks = [];
  p.directorPlans = [];
  p.directorTasks = [];
  p.directorReviews = [];
  p.scriptDiagnoses = [];
  p.reviewFindings = [];
  p.videoAssembly = null;
  p.剧本原文 = '';
  p.剧本来源 = null;
  p.一句话创意 = '';
  return seedDemoProject(p);
}
