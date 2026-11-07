import {
  DIAGNOSIS_CONFIG, DIRECTOR_TASK_STATUS, REVIEW_VERDICT,
  FINDING_SEVERITY, DATA_MARK, DIAGNOSIS_LEVEL
} from '../constants.js';
// EL_FRAMEWORK 由 0-A(constants.js) 提供；命名空间引用，0-A 未落地时模块仍可加载（G-1 唯一来源不变）
import * as CONST from '../constants.js';
import { uid, now } from './uid.js';
import { diagnose, buildRewriteAdvice, splitSentences, classify } from './diagnosis.js';
import { isForceDemo, selectConfig, getDemoFallback } from './model-adapter.js';
import { assembleNegativePrompt } from './prompt-builder.js';
import { missingAnchors, isFrameMissing } from './derive.js';

const S = DIRECTOR_TASK_STATUS;
const DEST = ['F-001', 'F-002', 'F-003', 'F-004', 'F-005', 'F-006', 'F-007', 'F-008', 'F-009', 'F-010', 'F-011'];

// ── CR-05-02 R-01~R-08 判定词表与口径（唯一实现，禁各页第二套）──
// 因果链四要素：缺项说明故事不可拍，缺 ≥1 判阻塞
const 逻辑四要素 = [
  { 名称: '起因', 词: ['起因', '因为', '由于', '之所以'] },
  { 名称: '转折', 词: ['转折', '但是', '然而', '却', '突然', '没想到', '不料', '原来'] },
  { 名称: '行动', 词: ['行动', '决定', '立刻', '马上', '于是', '返回', '赶往', '上前', '动手', '寻找'] },
  { 名称: '结果', 词: ['结果', '最后', '终于', '找回', '解决', '告一段落', '松了口气', '尘埃落定'] }
];
const 转折归因词 = ['因为', '由于', '原来', '之所以', '起因'];

// 9 类高风险画面：命中即给拆分建议；命中 ≥3 类判阻塞
const 高风险画面 = [
  { 类别: '人物交叉', 词: ['人物交叉', '交错', '擦肩', '穿插', '遮挡'], 拆分建议: '原镜头拆为 ① 人物A反应 ② 人物B反应 ③ 环境空镜三个单一动作镜头' },
  { 类别: '手持小物', 词: ['手持', '拿着', '端着', '握着', '捧着', '捏着'], 拆分建议: '手部持物拆为独立特写镜头，其余部分用反应镜头承接' },
  { 类别: '文字', 词: ['招牌', '屏幕文字', '字幕', '手写', '标语', '海报字'], 拆分建议: '文字内容拆为独立单点聚焦镜头，或用空镜交代，不与人物动作同镜' },
  { 类别: '镜像倒影', 词: ['镜面', '镜子', '倒影', '玻璃反射', '水面反射'], 拆分建议: '倒影拆为独立空镜（单点聚焦），人物与镜像不同镜头出现' },
  { 类别: '左右不对称', 词: ['左脸', '右脸', '一侧饰物', '单耳', '不对称'], 拆分建议: '固定特征侧拆为正面或侧面特写单镜，避免同镜换侧' },
  { 类别: '一镜换光', 词: ['由亮转暗', '白天转黄昏', '光线变化', '灯突然亮', '光线渐变'], 拆分建议: '光线变化拆为变化前 / 变化后两个镜头，用转场承接' },
  { 类别: '连续多动作', 词: ['起身', '走近', '坐下', '进门', '转身离开'], 拆分建议: '原镜头拆为 ① 起身 ② 走近 ③ 落座三个单一动作镜头' },
  { 类别: '俯拍遮脸', 词: ['俯拍', '高角度', '鸟瞰', '头顶俯视'], 拆分建议: '面部信息改为平视或近景单镜，俯拍仅保留交代位置的空镜' },
  { 类别: '配角过多', 词: ['人群', '聚会', '课堂', '街头人', '群演'], 拆分建议: '配角拆为背景虚化镜头 + 主角近景反应镜头' }
];

// 一镜写清六要素缺失时的补写句式：给可填文本，避免只说「补充」
const 六要素句式 = {
  景别: '景别：全景 / 中景 / 特写（写明信息范围）',
  机位: '机位：平视 / 俯视 / 仰视（固定或升降）',
  运镜: '运镜：固定 / 推 / 拉 / 跟 / 摇（写明运动方向）',
  人物左右方向: '人物左右方向：从画面左侧进入、向右走近（全片方向连续）',
  表情推进: '表情推进：平静 → 注意 → 发现 → 确认',
  转场: '转场：硬切 / 叠化 / 淡入淡出'
};

// 合规红线：命中即阻塞，给替换表达而非删场
const 合规红线 = [
  { 类别: '血腥', 词: ['血腥', '鲜血', '血流', '喷血', '割喉', '断肢', '内脏', '尸体'], 替换: '改用光影与暗部剪影暗示，不直接呈现血液与创口' },
  { 类别: '色情', 词: ['色情', '裸体', '裸身', '性爱', '情色', '露骨'], 替换: '改用门窗遮挡与局部构图暗示，不描写裸露与性行为' },
  { 类别: '暴力', 词: ['砍杀', '枪杀', '爆头', '肢解', '虐待', '凌辱', '殴打致死'], 替换: '改用镜头切换与声音留白表达冲突，不直接描写暴力过程' }
];

// A-28：独白 2 秒 ≤8、3 秒 ≤12、其余按总上限 16；对话按 2 秒 ≤6、3 秒 ≤9、4 秒及以上 ≤12
function 台词字数上限(时长, 独白) {
  const d = Number(时长) || 0;
  if (独白) return d <= 2 ? 8 : d <= 3 ? 12 : 16;
  return d <= 2 ? 6 : d <= 3 ? 9 : 12;
}

const 首尾帧三态 = v => (['一致', '不一致', '未检查'].includes(v) ? v : '未检查');

// 规划书 7 项字段全非空；三项目标值直引统一诊断口径配置，禁止硬编码第二份（§12.5）
export function generatePlan(project, input = {}) {
  const p = project || {};
  const cfg = DIAGNOSIS_CONFIG;
  const 创意文本 = String(input.创意文本 ?? p.一句话创意 ?? '').trim();
  const 剧本原文引用 = String(input.剧本原文引用 ?? p.剧本原文 ?? '');
  // 空输入不生成，由页面显示必填提示（E-01 口径）
  if (!创意文本 && !剧本原文引用.trim()) return null;

  // 真实文本分析由页面经 gen-task 统一入口建「类型=文本」GenTask（用途=文本）；此处只经适配层取来源与演示数据，不自建调用通道
  const 演示 = isForceDemo(p) || !selectConfig(p, '文本');
  const 样例 = getDemoFallback(p, '文本', { demoKind: '导演规划书' }).数据;
  const 目标集数 = Number(input.目标集数) || 2;
  const 目标单集时长 = Number(input.目标单集时长) || 3;
  const 假设 = [];
  if (!Number(input.目标集数)) 假设.push('目标集数未填，采用内置默认 2 集');
  if (!Number(input.目标单集时长)) 假设.push('目标单集时长未填，采用内置默认 3 分钟');
  const t = now();
  const plan = {
    规划书ID: uid('plan'), 项目ID: p.项目ID || '',
    来源类型: !创意文本 && 剧本原文引用.trim() ? '导入剧本' : '创意',
    创意文本, 剧本原文引用, 目标集数, 目标单集时长,
    建议集数: 目标集数,
    每集场次数: Math.max(1, Math.ceil((p.scenes || []).length / 目标集数) || 3),
    角色表: { 角色名: (样例.角色表?.角色名 || ['林夏', '顾言']).slice(), 人数: 样例.角色表?.人数 || 2 },
    视觉基调: input.视觉基调 || 样例.视觉基调 || '深色冷调都市写实',
    表演密度目标: {
      动作描述条数下限: cfg.每场次动作描述条数下限,
      动作描述字数下限: cfg.每场次动作描述字数下限
    },
    旁白占比上限: cfg.旁白占比上限,
    台词覆盖率下限: cfg.台词覆盖率下限,
    规划依据: `依据创意与 ${目标集数} 集 / ${目标单集时长} 分钟目标拆解；三项阈值引用 DIAGNOSIS_CONFIG ${cfg.VERSION}${假设.length ? `；[假设] ${假设.join('；')}` : ''}`,
    数据来源标记: 演示 ? DATA_MARK.演示数据 : DATA_MARK.真实模型,
    生成时间: t, 更新时间: t
  };
  (p.directorPlans ||= []).push(plan);
  return plan;
}

function 任务定义(p, plan) {
  const cfg = DIAGNOSIS_CONFIG;
  const 场次IDs = (p.scenes || []).map(s => s.场次ID);
  const 分镜IDs = (p.shots || []).map(s => s.分镜ID);
  const 资产IDs = (p.assets || []).map(a => a.资产ID);
  const 成品IDs = (p.storyboardItems || []).map(s => s.成品ID);
  return [
    { id: 'F-001', 前置: [], 参数: { 建议字数: 800, 目标旁白占比: cfg.旁白占比上限, 目标台词覆盖率: cfg.台词覆盖率下限 } },
    { id: 'F-002', 前置: ['剧本原文'], 参数: { 建议集数: plan?.建议集数 || 2, 每集场次数: plan?.每集场次数 || 3 } },
    { id: 'F-003', 前置: p.剧本原文 ? [] : 场次IDs.slice(0, 1), 参数: { 目标资产条数: 6 } },
    { id: 'F-004', 前置: 资产IDs.slice(0, 1), 参数: { 需锁定人物数: 1 } },
    { id: 'F-005', 前置: 场次IDs, 参数: { 目标镜头数: Math.max(1, 场次IDs.length) } },
    { id: 'F-006', 前置: 资产IDs, 参数: { 目标图片数: 资产IDs.length || 1 } },
    { id: 'F-007', 前置: 分镜IDs, 参数: { 每镜帧数: 2 } },
    { id: 'F-008', 前置: [], 参数: { 建议锁定负面词数: 2 } },
    { id: 'F-009', 前置: 场次IDs.length ? 场次IDs : (分镜IDs.length ? 分镜IDs : 资产IDs), 参数: { 建议节点数: 场次IDs.length || 分镜IDs.length || 资产IDs.length } },
    { id: 'F-010', 前置: 分镜IDs, 参数: { 目标成品数: 分镜IDs.length } },
    { id: 'F-011', 前置: 成品IDs, 参数: { 目标片段数: 成品IDs.length } }
  ];
}

// 11 模块状态判定映射表：状态一律来自真实字段/条目数，不写死假状态，禁手改「已完成」
function 判定(p, id) {
  const 运行中 = (p.genTasks || []).some(t => t.状态 === '进行中');
  const done = 依据 => ({ 状态: S.已完成, 依据, 受阻: '' });
  const doing = 依据 => ({ 状态: S.进行中, 依据, 受阻: '' });
  const none = 依据 => ({ 状态: S.未开始, 依据, 受阻: '' });
  const blocked = (依据, 受阻) => ({ 状态: S.受阻, 依据, 受阻 });
  const ids = list => list.join('、') || '无';

  switch (id) {
    case 'F-001': {
      const n = (p.剧本原文 || '').trim().length;
      if (n > 0 && ['生成', '导入'].includes(p.剧本来源)) return done(`剧本原文非空，字数 ${n}，剧本来源=${p.剧本来源}`);
      if ((p.genTasks || []).some(t => t.类型 === '文本' && t.状态 === '进行中')) return doing('存在 类型=文本 且 状态=进行中 的 GenTask');
      return none('剧本原文为空，无相关产物');
    }
    case 'F-002': {
      const 场次IDs = (p.scenes || []).map(s => s.场次ID);
      if (!(p.剧本原文 || '').trim()) return blocked('前置条件未满足：剧本原文为空', '缺剧本（剧本原文）；缺失对象ID：剧本原文');
      if (场次IDs.length) return done(`scenes.length=${场次IDs.length}；可列出全部场次ID：${ids(场次IDs)}`);
      if (运行中) return doing('存在拆分进行中 GenTask');
      return none('无场次条目且无进行中 GenTask');
    }
    case 'F-003': {
      const 资产IDs = (p.assets || []).map(a => a.资产ID);
      if (资产IDs.length) return done(`assets.length=${资产IDs.length}；可列出全部资产ID：${ids(资产IDs)}`);
      const 有文本 = (p.剧本原文 || '').trim() || (p.scenes || []).some(s => (s.正文 || '').trim());
      if (!有文本) return blocked('前置条件未满足：剧本与场次文本均空', '缺剧本原文与场次正文；缺失对象类型：剧本、场次');
      if (运行中) return doing('存在资产提取进行中 GenTask');
      return none('无资产条目');
    }
    case 'F-004': {
      const 人物 = (p.assets || []).filter(a => a.类型 === '人物');
      if (!人物.length) return blocked('前置条件未满足：无人物资产', '缺人物资产；缺失对象类型：人物；缺失资产ID列表：无');
      const 锁定 = 人物.filter(a => a.锁定状态 === '已锁定' && a.锚点标识);
      if (锁定.length) return done(`已锁定人物锚点 ${锁定.length} 个；锚点标识：${ids(锁定.map(a => a.锚点标识))}`);
      return doing(`有人物资产 ${人物.length} 个但未锁定或无锚点标识；资产ID：${ids(人物.map(a => a.资产ID))}`);
    }
    case 'F-005': {
      const 场次IDs = (p.scenes || []).map(s => s.场次ID);
      const shots = p.shots || [];
      if (!场次IDs.length) return blocked('前置条件未满足：scenes 为空', '缺场次；缺失场次ID列表：无');
      if (shots.length) {
        const 六项 = ['景别', '运镜', '画面描述', '对白', '时长', '镜号'];
        const 缺字段 = shots.filter(s => 六项.some(k => s[k] === '' || s[k] === undefined || s[k] === null));
        const 唯一升序 = 场次IDs.every(sid => {
          const ns = shots.filter(s => s.场次ID === sid).map(s => s.镜号);
          return ns.length > 0 && new Set(ns).size === ns.length && ns.every((v, i) => i === 0 || v > ns[i - 1]);
        });
        if (!缺字段.length && 唯一升序) return done(`shots.length=${shots.length}；六项字段全非空、镜号在场次内唯一升序；分镜ID：${ids(shots.map(s => s.分镜ID))}`);
        return doing(`已产出 ${shots.length} 条分镜但六项字段或镜号未达标；分镜ID：${ids(缺字段.map(s => s.分镜ID))}`);
      }
      if (运行中) return doing('存在分镜生成进行中 GenTask');
      return none('无分镜条目');
    }
    case 'F-006': {
      const 资产IDs = (p.assets || []).map(a => a.资产ID);
      if (!资产IDs.length) return blocked('前置条件未满足：assets 为空', '缺资产；缺失资产ID列表：无');
      const 成功 = (p.genTasks || []).filter(t => t.类型 === '图片' && ['成功', '已降级(演示数据)'].includes(t.状态) && t.输出引用);
      if (成功.length) return done(`图片类 GenTask 成功/已降级且输出引用非空 ${成功.length} 个；任务ID：${ids(成功.map(t => t.任务ID))}`);
      if ((p.genTasks || []).some(t => t.类型 === '图片' && t.状态 === '进行中')) return doing('存在图片类进行中 GenTask');
      return none('无图片任务产物');
    }
    case 'F-007': {
      const 分镜IDs = (p.shots || []).map(s => s.分镜ID);
      const 帧 = p.keyFrames || [];
      if (!分镜IDs.length) return blocked('前置条件未满足：shots 为空', '缺分镜；缺失分镜ID列表：无');
      if (帧.length) {
        const 悬空 = 帧.filter(k => !分镜IDs.includes(k.分镜ID));
        if (!悬空.length) return done(`keyFrames.length=${帧.length}；每条分镜ID可解析；帧ID：${ids(帧.map(k => k.帧ID))}`);
        return doing(`已产出部分关键帧，悬空分镜ID：${ids(悬空.map(k => k.分镜ID))}`);
      }
      if (运行中) return doing('存在关键帧生成进行中 GenTask');
      return none('无关键帧条目');
    }
    case 'F-008': {
      const ps = p.promptSet || {};
      if (ps.负面词锁定状态 === '已锁定' && (ps.锁定词快照 || []).length) {
        return done(`负面词锁定状态=已锁定；锁定词快照 ${ps.锁定词快照.length} 条：${ids(ps.锁定词快照)}`);
      }
      if ((ps.全局负面词 || []).length) return doing('已录入负面词但未锁定');
      return none('PromptSet 为空且未锁定（该模块无前置，可跳过）');
    }
    case 'F-009': {
      const 三类空 = !(p.scenes || []).length && !(p.shots || []).length && !(p.assets || []).length;
      if (三类空) return blocked('前置条件未满足：场次/分镜/资产三者皆空（CNV-05）', '缺场次、分镜、资产三类数据源；缺失对象类型：场次/分镜/资产');
      const 节点 = p.canvasNodes || [];
      if (节点.length) {
        const 可解析 = new Set([
          ...(p.scenes || []).map(s => s.场次ID), ...(p.shots || []).map(s => s.分镜ID),
          ...(p.assets || []).map(a => a.资产ID)
        ]);
        if (节点.every(n => 可解析.has(n.关联数据ID))) return done(`canvasNodes.length=${节点.length}；每条关联数据ID可解析；节点ID：${ids(节点.map(n => n.节点ID))}`);
        return doing('已产出部分节点，存在悬空关联数据ID');
      }
      return none('无画布节点');
    }
    case 'F-010': {
      const 分镜IDs = (p.shots || []).map(s => s.分镜ID);
      const 成品 = p.storyboardItems || [];
      if (!分镜IDs.length) return blocked('前置条件未满足：shots 为空', '缺分镜；缺失分镜ID列表：无');
      if (成品.length && 成品.length === 分镜IDs.length) return done(`storyboardItems.length=${成品.length} === shots.length=${分镜IDs.length}；成品ID：${ids(成品.map(s => s.成品ID))}`);
      if (成品.length) return doing(`已产出部分成品 ${成品.length}/${分镜IDs.length}`);
      return none('无分镜成品');
    }
    case 'F-011': {
      const 成品IDs = (p.storyboardItems || []).map(s => s.成品ID);
      const 片段 = p.videoAssembly?.片段清单 || [];
      if (!成品IDs.length) return blocked('前置条件未满足：storyboardItems 为空', '缺分镜成品；缺失成品ID列表：无');
      if (p.videoAssembly && 片段.length === 成品IDs.length) return done(`videoAssembly 非空；片段清单.length=${片段.length} === storyboardItems.length=${成品IDs.length}`);
      if (片段.length) return doing(`已有片段 ${片段.length}/${成品IDs.length}，片段数不足`);
      return none('无片段清单');
    }
    default:
      return none('未识别的目标模块ID');
  }
}

// 恒 11 条唯一映射 F-001~F-011；全量重建由页面一次显式确认，不静默覆盖
export function splitTasks(project, plan) {
  const p = project || {};
  const t = now();
  p.directorTasks = 任务定义(p, plan).map(d => ({
    任务ID: uid('dt'), 规划书ID: plan?.规划书ID || '',
    目标模块ID: d.id, 建议参数: d.参数, 前置条件: d.前置,
    状态: S.未开始, 状态判定依据: '', 受阻原因: '',
    跳转入口标识: `page:${d.id}`, 更新时间: t
  }));
  return refreshTaskStatus(p);
}

// 每次按真实工程数据重算：对象被删除即回落「未开始/受阻」并列出缺失 ID（E-26）
export function refreshTaskStatus(project) {
  const p = project || {};
  for (const t of (p.directorTasks || [])) {
    const r = 判定(p, t.目标模块ID);
    t.状态 = r.状态;
    t.状态判定依据 = r.依据;
    t.受阻原因 = r.受阻;
    t.更新时间 = now();
  }
  return p.directorTasks || [];
}

// R-01~R-08 追加检查项（#8~#15）：数据缺失一律判「无对象」并列出缺失对象类型，不产出「全通过」（E-32）
function 追加规则复核项(p, scope, 场次IDs, 行R, find) {
  const 范围文本 = (Array.isArray(scope) ? scope.join('、') : String(scope || '')) || '全片';
  const shots = p.shots || [];
  const 帧 = p.keyFrames || [];
  const 剧本 = String(p.剧本原文 || '');
  const 剧本ID = p.项目ID || '无剧本ID';
  const 无对象 = (编号, 检查项, 缺对象类型, 建议动作, 目标模块ID) => {
    行R(编号, 检查项, `无对象：缺 ${缺对象类型}`, '需存在可复核对象', false);
    find(检查项, '工程', p.项目ID || '', `无对象：缺 ${缺对象类型}`, `需存在 ${缺对象类型}`,
      `工程内无可复核对象（缺 ${缺对象类型}），本项判为无对象，不判通过`, 建议动作, 目标模块ID, FINDING_SEVERITY.阻塞);
  };

  // #8 R-01 故事逻辑关
  const 逻辑文本 = 剧本.trim() || (p.scenes || []).map(s => String(s.正文 || '')).join('\n');
  if (!逻辑文本.trim()) {
    无对象('#8', 'R-01 故事逻辑关', '剧本原文与场次正文', '在 F-001 导入或生成剧本，或在 F-002 完成场次拆分', 'F-001');
  } else {
    const 缺要素 = 逻辑四要素.filter(e => !e.词.some(w => 逻辑文本.includes(w))).map(e => e.名称);
    const 转折可追溯 = !缺要素.includes('转折') && 转折归因词.some(w => 逻辑文本.includes(w));
    const 齐全 = 4 - 缺要素.length;
    const 补充说明 = [缺要素.length ? `缺 ${缺要素.join('、')}` : '', !转折可追溯 && !缺要素.includes('转折') ? '转折原因不可追溯' : ''].filter(Boolean).join('；');
    行R('#8', 'R-01 故事逻辑关', `齐全 ${齐全}/4${补充说明 ? `（${补充说明}）` : ''}`, '4/4 且转折原因可追溯', 齐全 === 4 && 转折可追溯);
    if (齐全 < 4 || !转折可追溯) {
      // 转折命中却无归因词（因为 / 由于 / 原来）：变化来由不可查，观众会看不懂，按缺项同等处理
      find('R-01 故事逻辑关', '剧本', 剧本ID, `齐全 ${齐全}/4${补充说明 ? `（${补充说明}）` : ''}`, '4/4 且转折原因可追溯',
        `因果链四要素未齐：${补充说明}；实测齐全 ${齐全}/4，期望 4/4 且转折原因可查`,
        `在 F-001 按「起因 → 转折 → 行动 → 结果」补齐：${(缺要素.length ? 缺要素 : ['转折原因']).map(n => `补写${n}（${n === '转折原因' ? '用「因为 / 由于 / 原来」交代变化来由' : `具体到可指认的句子`}）`).join('；')}`,
        'F-001', FINDING_SEVERITY.阻塞);
    }
  }

  // #9 R-02 检查前置：视频级未确认即阻塞，检查必须落在最昂贵的一步之前（8-01）
  const 前置 = p.检查前置确认 || {};
  const 三级 = [
    { 名称: '文字', 值: 前置.文字 === true, 模块: 'F-001' },
    { 名称: '图', 值: 前置.图 === true, 模块: 'F-006' },
    { 名称: '视频', 值: 前置.视频 === true, 模块: 'F-011' }
  ];
  const 已确认数 = 三级.filter(x => x.值).length;
  const 未确认 = 三级.filter(x => !x.值).map(x => x.名称);
  const 含视频 = /视频|全片|F-011/.test(范围文本);
  行R('#9', 'R-02 检查前置', `已确认 ${已确认数}/3（未确认：${未确认.join('、') || '无'}）`, '3/3（生成视频前）', 已确认数 === 3);
  if (已确认数 < 3) {
    const 严重度 = 含视频 && !前置.视频 ? FINDING_SEVERITY.阻塞 : FINDING_SEVERITY.提示;
    find('R-02 检查前置', '工程', p.项目ID || '', `三级确认 ${已确认数}/3，未确认：${未确认.join('、')}`, '3/3 已确认',
      `检查前置确认 未全通过，实测 ${已确认数}/3；复核范围「${范围文本}」${含视频 ? '含视频生成' : '不含视频生成'}，视频级前置${前置.视频 ? '已确认' : '未确认'}`,
      `依次在各模块执行「确认通过」写入 检查前置确认：${三级.filter(x => !x.值).map(x => `${x.名称}→${x.模块}`).join('；')}`,
      'F-011', 严重度);
  }

  // #10 R-03 可拍性
  if (!shots.length) {
    无对象('#10', 'R-03 可拍性', '分镜条目', '在 F-005 生成分镜后重新复核', 'F-005');
  } else {
    const 命中清单 = [];
    for (const s of shots) {
      const 文本 = `${s.画面描述 || ''} ${s.动作 || ''} ${s.单条正向词 || ''}`;
      for (const c of 高风险画面) {
        const 命中词 = c.词.filter(w => 文本.includes(w));
        if (命中词.length) 命中清单.push({ 分镜ID: s.分镜ID, 类别: c.类别, 命中词, 拆分建议: c.拆分建议, 证据: 文本.trim().slice(0, 40) });
      }
    }
    const 类别清单 = [...new Set(命中清单.map(x => x.类别))];
    行R('#10', 'R-03 可拍性', `命中 ${类别清单.length} 类共 ${命中清单.length} 处（${类别清单.join('、') || '无'}）`, '命中 0 类', 类别清单.length === 0);
    for (const h of 命中清单) {
      // 命中 ≥3 类说明多个镜头同时承担过多任务，生成稳定性显著下降，判阻塞
      const 严重度 = 类别清单.length >= 3 ? FINDING_SEVERITY.阻塞 : FINDING_SEVERITY.提示;
      find('R-03 可拍性', '分镜', h.分镜ID, `命中「${h.类别}」关键词 ${h.命中词.join('、')}`, '命中 0 类',
        `分镜 ${h.分镜ID} 画面含高风险画面「${h.类别}」，证据片段「${h.证据}」，单镜头任务过多；本次全片共命中 ${类别清单.length} 类`,
        h.拆分建议, 'F-005', 严重度);
    }
  }

  // #11 R-04 一镜写清六要素
  if (!shots.length) {
    无对象('#11', 'R-04 一镜写清', '分镜条目', '在 F-005 生成分镜后重新复核', 'F-005');
  } else {
    const 六要素 = [
      { 名称: '景别', 取: s => s.景别 },
      { 名称: '机位', 取: s => s.机位 || s.镜头角度 },
      { 名称: '运镜', 取: s => s.运镜 || s.运镜方式 },
      // 既有分镜只写画面描述时，用「左 / 右」方向词兜底判定左右方向是否写明
      { 名称: '人物左右方向', 取: s => s.人物左右方向 || (/[左右]/.test(String(s.画面描述 || '')) ? s.画面描述 : '') },
      { 名称: '表情推进', 取: s => s.表情推进 || s.表情 },
      { 名称: '转场', 取: s => s.转场 || s.转场类型 }
    ];
    const 缺项 = shots
      .map(s => ({ id: s.分镜ID, 缺: 六要素.filter(e => !String(e.取(s) ?? '').trim()).map(e => e.名称) }))
      .filter(x => x.缺.length);
    行R('#11', 'R-04 一镜写清', `${shots.length - 缺项.length}/${shots.length} 镜六要素齐全`, '每镜 6/6', 缺项.length === 0);
    for (const x of 缺项) {
      find('R-04 一镜写清', '分镜', x.id, `缺失 ${x.缺.length}/6 项：${x.缺.join('、')}`, '6/6 项非空',
        `分镜 ${x.id} 六要素缺失 ${x.缺.join('、')}，实测齐全 ${6 - x.缺.length}/6、缺失 ${x.缺.length} 项`,
        `按句式补齐：${x.缺.map(n => 六要素句式[n]).join('；')}`, 'F-005', FINDING_SEVERITY.阻塞);
    }
  }

  // #12 R-05 台词字数（提示级，不静默改写用户台词）
  if (!shots.length) {
    无对象('#12', 'R-05 台词字数', '分镜条目', '在 F-005 生成分镜后重新复核', 'F-005');
  } else {
    const 超限 = [];
    for (const s of shots) {
      const 原文 = String(s.对白 || '').trim();
      if (!原文) continue;
      const 独白 = /独白/.test(原文);
      const 正文 = 原文.replace(/^[^：:]{1,10}[：:]/, '').replace(/[「」“”"『』]/g, '').replace(/\s/g, '');
      const 上限 = 台词字数上限(s.时长, 独白);
      if (正文.length > 上限) 超限.push({ id: s.分镜ID, 字数: 正文.length, 上限, 时长: Number(s.时长) || 0, 独白 });
    }
    行R('#12', 'R-05 台词字数', 超限.length ? `${超限.length} 镜超限` : '0 镜超限', '全部 ≤ 上限（2 秒 ≤6 / 3 秒 ≤9 / 4 秒 ≤12；独白 ≤16）', 超限.length === 0);
    for (const x of 超限) {
      const 拆镜数 = Math.ceil(x.字数 / x.上限);
      find('R-05 台词字数', '分镜', x.id, `${x.字数} 字（${x.时长} 秒${x.独白 ? '内心独白' : '对话'}）`, `≤ ${x.上限} 字`,
        `分镜 ${x.id} 台词实测 ${x.字数} 字 / 上限 ${x.上限} 字，超出 ${x.字数 - x.上限} 字`,
        `拆为 ${拆镜数} 个连续镜头并切换景别，每镜 ≤${x.上限} 字：${Array.from({ length: 拆镜数 }, (_, i) => `第${i + 1}镜 ${Math.min(x.上限, x.字数 - i * x.上限)} 字`).join('、')}`,
        'F-005', FINDING_SEVERITY.提示);
    }
  }

  // #13 R-06 首尾帧连续性：缺帧判阻塞，仅一致性标注不为「一致」判提示
  if (!帧.length) {
    无对象('#13', 'R-06 首尾帧连续性', '关键帧条目', '在 F-007 生成首帧与尾帧后重新复核', 'F-007');
  } else {
    const 帧分镜IDs = [...new Set(帧.map(k => k.分镜ID))];
    const 明细 = 帧分镜IDs.map(sid => {
      const 组 = 帧.filter(k => k.分镜ID === sid);
      const 有首 = 组.some(k => k.帧类型 === '首帧' && k.图片引用);
      const 有尾 = 组.some(k => k.帧类型 === '尾帧' && k.图片引用);
      const 中间事件 = 组.find(k => String(k.中间事件 || '').trim())
        || String((shots.find(s => s.分镜ID === sid) || {}).中间事件 || '').trim();
      const 缺 = [有首 ? '' : '首帧', 有尾 ? '' : '尾帧', 中间事件 ? '' : '中间事件'].filter(Boolean);
      const 位置 = 首尾帧三态(组.map(k => k.轮廓位置一致).find(Boolean));
      const 尺度 = 首尾帧三态(组.map(k => k.尺度连续).find(Boolean));
      return { sid, 缺, 位置, 尺度 };
    });
    const 缺帧数 = 明细.filter(x => x.缺.length).length;
    const 一致性差 = 明细.filter(x => !x.缺.length && (x.位置 !== '一致' || x.尺度 !== '一致'));
    行R('#13', 'R-06 首尾帧连续性', `${帧分镜IDs.length - 缺帧数}/${帧分镜IDs.length} 镜三件齐全；一致性待处理 ${一致性差.length} 镜`,
      '首帧+尾帧+中间事件 3/3 且位置一致、尺度连续', 缺帧数 === 0 && 一致性差.length === 0);
    for (const x of 明细) {
      if (!x.缺.length && x.位置 === '一致' && x.尺度 === '一致') continue;
      find('R-06 首尾帧连续性', '分镜', x.sid,
        x.缺.length ? `缺 ${x.缺.join('、')}（齐全 ${3 - x.缺.length}/3）` : `位置 ${x.位置} / 尺度 ${x.尺度}`,
        '首帧+尾帧+中间事件 3/3 且位置一致、尺度连续',
        x.缺.length ? `分镜 ${x.sid} 首尾帧材料不齐，缺 ${x.缺.join('、')}，实测齐全 ${3 - x.缺.length}/3`
          : `分镜 ${x.sid} 一致性标注未全为一致：位置 ${x.位置}、尺度 ${x.尺度}`,
        x.缺.length ? '在 F-007 补齐首帧 / 尾帧与中间事件并标注一致性' : '叠加首尾帧轮廓复核位置与尺度，改标注或重生成该帧',
        'F-007', x.缺.length ? FINDING_SEVERITY.阻塞 : FINDING_SEVERITY.提示);
    }
  }

  // #14 R-07 审阅三方面：无勾选记录按未通过处理，不默认通过
  const 审阅 = p.审阅勾选 || p.videoAssembly?.审阅勾选 || {};
  const 三方面 = [
    { 名称: '故事理解', 值: 审阅.故事理解 === true },
    { 名称: '画面与镜头', 值: 审阅.画面镜头 === true || 审阅.画面与镜头 === true },
    { 名称: '声音效果', 值: 审阅.声音效果 === true }
  ];
  const 审阅通过数 = 三方面.filter(x => x.值).length;
  const 审阅未过 = 三方面.filter(x => !x.值).map(x => x.名称);
  行R('#14', 'R-07 审阅三方面', `${审阅通过数}/3 已勾选通过（未通过：${审阅未过.join('、') || '无'}）`, '3/3', 审阅通过数 === 3);
  if (审阅通过数 < 3) {
    const 无记录 = !Object.keys(审阅).length;
    find('R-07 审阅三方面', '分镜成品', (p.storyboardItems || []).map(s => s.成品ID).join('、') || p.项目ID || '',
      `${审阅通过数}/3`, '3/3', `${无记录 ? '工程无审阅勾选记录，' : ''}审阅三方面未全通过，实测 ${审阅通过数}/3，未通过：${审阅未过.join('、')}`,
      `按三方面逐项审阅并勾选：${审阅未过.map(n => `${n}（${n === '故事理解' ? '主线易懂、情节连贯、结局合理' : n === '画面与镜头' ? '衔接自然、角色场景一致、无变形闪烁' : '配音清晰、音乐贴合、音量平衡、无杂音'}）`).join('；')}`,
      'F-010', FINDING_SEVERITY.阻塞);
  }

  // #15 R-08 合规红线：命中 1 处即阻塞，给替换表达而非删场
  const 扫描目标 = [{ 类型: '剧本', ID: 剧本ID, 文本: 剧本 }]
    .concat(shots.map(s => ({ 类型: '分镜', ID: s.分镜ID, 文本: `${s.画面描述 || ''} ${s.对白 || ''}` })));
  const 红线命中 = [];
  for (const t of 扫描目标) {
    for (const c of 合规红线) {
      const 命中词 = c.词.filter(w => String(t.文本).includes(w));
      if (命中词.length) 红线命中.push({ ...t, 类别: c.类别, 命中词, 替换: c.替换 });
    }
  }
  行R('#15', 'R-08 合规红线', `命中 ${红线命中.length} 处`, '0 处', 红线命中.length === 0);
  for (const h of 红线命中) {
    find('R-08 合规红线', h.类型, h.ID, `命中「${h.类别}」关键词 ${h.命中词.join('、')}`, '0 处',
      `${h.类型} ${h.ID} 含${h.类别}直白描写关键词 ${h.命中词.join('、')}，命中即阻塞`,
      `改用光影、氛围与镜头语言表达；${h.替换}`, h.类型 === '剧本' ? 'F-001' : 'F-005', FINDING_SEVERITY.阻塞, h.替换);
  }
}

// 7 项一致性检查固定 7 行；不通过项列具体 ID + 实测值 vs 期望值 + 原因，禁模糊措辞
export function generateReview(project, scope = []) {
  const p = project || {};
  const 有对象 = (p.剧本原文 || '').trim() || (p.scenes || []).length || (p.shots || []).length
    || (p.storyboardItems || []).length || (p.keyFrames || []).length || !!p.检查前置确认;
  // E-22 / E-32：有前置确认记录的工程照样出报告，但缺对象一律判「无对象」，不产出「全通过」
  if (!有对象) return null;

  const cfg = DIAGNOSIS_CONFIG;
  const 演示 = isForceDemo(p) || !selectConfig(p, '文本');
  // 直接引用同一 ScriptDiagnosis，不重算、不另写口径
  let diag = (p.scriptDiagnoses || []).slice(-1)[0];
  if (!diag) {
    diag = diagnose(p, '剧本', p.项目ID || '', p.剧本原文 || '');
    (p.scriptDiagnoses ||= []).push(diag);
  }

  const 检查项结果 = [];
  const findings = [];
  const 行 = (检查项, 实测值, 阈值, ok) => 检查项结果.push({
    检查项, 实测值, 阈值, 结论: ok ? REVIEW_VERDICT.通过 : REVIEW_VERDICT.不通过
  });
  const find = (检查项, 对象类型, 对象ID, 实测值, 期望值, 原因, 建议动作, 目标模块ID, 严重度, 建议替换文本 = null) => findings.push({
    findingID: uid('find'), 报告ID: '', 检查项, 对象类型, 对象ID, 实测值, 期望值,
    原因, 建议动作, 目标模块ID, 严重度, 建议替换文本
  });
  const 诊断严重度 = diag.诊断等级 === DIAGNOSIS_LEVEL.不通过 ? FINDING_SEVERITY.阻塞 : FINDING_SEVERITY.提示;

  // 1 锚点携带完整性
  const 锁定人物 = (p.assets || []).filter(a => a.类型 === '人物' && a.锁定状态 === '已锁定' && a.锚点标识);
  const 锁定标识 = 锁定人物.map(a => a.锚点标识);
  const 锁定资产IDs = 锁定人物.map(a => a.资产ID);
  const 涉及任务 = (p.genTasks || []).filter(t => (t.输入快照?.关联资产ID列表 || []).some(id => 锁定资产IDs.includes(id)));
  const 缺锚任务 = 涉及任务.filter(t => 锁定标识.some(m => !(t.最终提示词快照?.正向?.角色锚点 || []).some(a => a.锚点标识 === m)));
  const 涉及成品 = (p.storyboardItems || []).filter(s => {
    const sh = (p.shots || []).find(x => x.分镜ID === s.分镜ID);
    return (sh?.关联资产ID列表 || []).some(id => 锁定资产IDs.includes(id));
  });
  const 缺锚成品 = 涉及成品.filter(s => 锁定标识.some(m => !(s.关联锚点标识 || []).includes(m)));
  const 总数1 = 涉及任务.length + 涉及成品.length;
  const 命中1 = 总数1 - 缺锚任务.length - 缺锚成品.length;
  const 率1 = 总数1 ? 命中1 / 总数1 * 100 : 100;
  行('锚点携带完整性', `${命中1}/${总数1}（${Number(率1.toFixed(1))}%）`, '100%', 率1 === 100);
  for (const t of 缺锚任务) find('锚点携带完整性', '生成任务', t.任务ID,
    `快照角色锚点缺失：${锁定标识.filter(m => !(t.最终提示词快照?.正向?.角色锚点 || []).some(a => a.锚点标识 === m)).join('、')}`,
    `含全部锁定锚点标识 ${锁定标识.join('、')}`,
    `任务 ${t.任务ID} 最终提示词快照未携带锁定锚点标识，实测携带 0 项 / 期望 ${锁定标识.length} 项`,
    '在 F-006 重新生成该任务并注入锁定锚点', 'F-006', FINDING_SEVERITY.阻塞);
  for (const s of 缺锚成品) find('锚点携带完整性', '分镜成品', s.成品ID,
    `关联锚点标识缺失：${锁定标识.filter(m => !(s.关联锚点标识 || []).includes(m)).join('、')}`,
    `含全部锁定锚点标识 ${锁定标识.join('、')}`,
    `成品 ${s.成品ID} 关联锚点标识未含锁定标识，实测缺失 ${锁定标识.filter(m => !(s.关联锚点标识 || []).includes(m)).length} 项 / 期望 0 项`,
    '在 F-010 重新组装该分镜成品', 'F-010', FINDING_SEVERITY.阻塞);

  // 2 全局锁定负面词出现率
  const 锁定词 = p.promptSet?.负面词锁定状态 === '已锁定' ? (p.promptSet.锁定词快照 || []) : [];
  const 涉及2 = (p.genTasks || []).filter(t => t.类型 !== '文本');
  const 缺词任务 = 涉及2.filter(t => 锁定词.some(w => !(t.最终提示词快照?.负面?.全局锁定负面词 || []).includes(w)));
  const 率2 = 涉及2.length ? (涉及2.length - 缺词任务.length) / 涉及2.length * 100 : 100;
  行('全局锁定负面词出现率', `${涉及2.length - 缺词任务.length}/${涉及2.length}（${Number(率2.toFixed(1))}%）`, '100%', 率2 === 100);
  for (const t of 缺词任务) find('全局锁定负面词出现率', '生成任务', t.任务ID,
    `缺失锁定词 ${锁定词.filter(w => !(t.最终提示词快照?.负面?.全局锁定负面词 || []).includes(w)).join('、')}`,
    `含全部锁定词 ${锁定词.join('、')}`,
    `任务 ${t.任务ID} 最终负面词缺锁定词，实测缺失 ${锁定词.filter(w => !(t.最终提示词快照?.负面?.全局锁定负面词 || []).includes(w)).length} 个 / 期望 0 个`,
    '在 F-008 确认锁定词并重新生成该任务', 'F-008', FINDING_SEVERITY.阻塞);

  // 3~5 直接引用诊断结果，不重算阈值
  const 占比ok = diag.旁白占比 <= cfg.旁白占比上限;
  行('旁白占比', `${Number(diag.旁白占比.toFixed(1))}%（旁白 ${diag.旁白句数} / 句子总数 ${diag.句子总数}）`, `≤ ${cfg.旁白占比上限}%`, 占比ok);
  if (!占比ok) find('旁白占比', '剧本', p.项目ID || '', `${Number(diag.旁白占比.toFixed(1))}%`, `≤ ${cfg.旁白占比上限}%`,
    `旁白句 ${diag.旁白句数} 句 / 句子总数 ${diag.句子总数} 句，实测占比超阈值；诊断等级 ${diag.诊断等级}`,
    '在 F-001 按改写建议逐句替换为台词或动作描述', 'F-001', 诊断严重度,
    buildRewriteAdvice(diag, p)[0] || null);

  const 覆盖ok = diag.台词覆盖率 >= cfg.台词覆盖率下限;
  行('台词覆盖率', `${Number(diag.台词覆盖率.toFixed(1))}%（有台词场次 ${diag.台词场次} / 总场次 ${diag.总场次}）`, `≥ ${cfg.台词覆盖率下限}%`, 覆盖ok);
  if (!覆盖ok) find('台词覆盖率', '场次', (p.scenes || []).map(s => s.场次ID).join('、') || '无',
    `${diag.台词场次}/${diag.总场次}`, `≥ ${cfg.台词覆盖率下限}%`,
    `有台词场次 ${diag.台词场次} 个 / 总场次 ${diag.总场次} 个，实测覆盖率低于下限`,
    '在 F-002 为无台词场次补充对白', 'F-002', 诊断严重度);

  const 密度ok = diag.密度达标场次 === diag.总场次;
  行('表演 / 动作描述密度', `${diag.密度达标场次}/${diag.总场次} 场次达标`, `每场次 ≥${cfg.每场次动作描述条数下限} 条且 ≥${cfg.每场次动作描述字数下限} 字`, 密度ok);
  if (!密度ok) {
    // 复用同一诊断器的切分与分类取场次级明细，不另写口径
    for (const sc of (p.scenes || [])) {
      const 动作 = splitSentences(sc.正文 || sc.来源文本片段 || '').filter(s => classify(s, { 对象ID: sc.场次ID }) === '动作/表演描述');
      const 条数 = 动作.length, 字数 = 动作.reduce((n, s) => n + s.length, 0);
      if (条数 < cfg.每场次动作描述条数下限 || 字数 < cfg.每场次动作描述字数下限) {
        find('表演 / 动作描述密度', '场次', sc.场次ID, `条数 ${条数} / 字数 ${字数}`,
          `条数 ≥${cfg.每场次动作描述条数下限} 且 字数 ≥${cfg.每场次动作描述字数下限}`,
          `场次 ${sc.场次ID} 实测条数 ${条数}（下限 ${cfg.每场次动作描述条数下限}）、实测字数 ${字数}（下限 ${cfg.每场次动作描述字数下限}），未达标`,
          '在 F-005 为该场次补充动作描述', 'F-005', 诊断严重度);
      }
    }
  }

  // 6 场次可执行性
  const 六项 = ['景别', '运镜', '画面描述', '对白', '时长', '镜号'];
  const 场次IDs = (p.scenes || []).map(s => s.场次ID);
  const 坏场次 = [];
  for (const sid of 场次IDs) {
    const shs = (p.shots || []).filter(s => s.场次ID === sid);
    if (!shs.length) { 坏场次.push({ id: sid, 原因: '该场次无分镜，实测 0 条 / 期望 ≥1 条' }); continue; }
    const 缺 = shs.filter(s => 六项.some(k => s[k] === '' || s[k] === undefined || s[k] === null));
    const ns = shs.map(s => s.镜号);
    if (缺.length) 坏场次.push({ id: sid, 原因: `分镜 ${缺.map(s => s.分镜ID).join('、')} 六项字段存在空值` });
    else if (new Set(ns).size !== ns.length || ns.some((v, i) => i > 0 && v <= ns[i - 1])) {
      坏场次.push({ id: sid, 原因: `镜号 ${ns.join('、')} 在场次内非唯一升序` });
    }
  }
  行('场次可执行性', `${场次IDs.length - 坏场次.length}/${场次IDs.length} 场次可执行`, '每场次 ≥1 条分镜且六项字段非空、镜号在场次内唯一升序', 坏场次.length === 0);
  for (const b of 坏场次) find('场次可执行性', '场次', b.id, b.原因, '每场次 ≥1 条分镜且六项字段非空、镜号在场次内唯一升序',
    `场次 ${b.id}：${b.原因}`, '在 F-005 补齐该场次分镜并校验镜号', 'F-005', FINDING_SEVERITY.阻塞);

  // 7 缺失帧与缺失资产
  const 缺失帧 = (p.keyFrames || []).filter(isFrameMissing).map(k => k.帧ID);
  const 被引用资产 = [...new Set((p.shots || []).flatMap(s => s.关联资产ID列表 || []))];
  const 缺锚点 = missingAnchors(p, 被引用资产);
  const 全部ID = new Set([
    ...(p.scenes || []).map(s => s.场次ID), ...(p.shots || []).map(s => s.分镜ID),
    ...(p.assets || []).map(a => a.资产ID), ...(p.keyFrames || []).map(k => k.帧ID)
  ]);
  const 悬空 = [...new Set((p.shots || []).flatMap(s => [...(s.关联资产ID列表 || []), ...(s.关联关键帧ID列表 || [])]))].filter(id => !全部ID.has(id));
  const 条数7 = 缺失帧.length + 缺锚点.length + 悬空.length;
  行('缺失帧与缺失资产', `${条数7} 条（缺失帧 ${缺失帧.length} / 无锚点资产 ${缺锚点.length} / 悬空引用 ${悬空.length}）`, '0 条', 条数7 === 0);
  for (const id of 缺失帧) find('缺失帧与缺失资产', '关键帧', id, '图片引用为空', '图片引用非空',
    `关键帧 ${id} 图片引用为空串，实测缺失帧 1 条 / 期望 0 条`, '在 F-007 重新生成该关键帧', 'F-007', FINDING_SEVERITY.阻塞);
  for (const id of 缺锚点) find('缺失帧与缺失资产', '资产', id, '无有效锚点', '已锁定且锚点标识非空',
    `资产 ${id} 被分镜引用但无有效锚点，实测 1 条 / 期望 0 条`, '在 F-004 锁定该人物资产并填写锚点标识', 'F-004', FINDING_SEVERITY.阻塞);
  for (const id of 悬空) find('缺失帧与缺失资产', '引用', id, '引用目标不存在', '引用目标ID可解析',
    `引用 ${id} 在工程中无可解析对象，实测悬空引用 1 条 / 期望 0 条`, '在 F-005 清理该悬空引用', 'F-005', FINDING_SEVERITY.阻塞);

  // ── 追加 R-01~R-08（编号 #8~#15），原 7 项输出与口径不变（CR-05-02）──
  const 行R = (编号, 检查项, 实测值, 阈值, ok) => 检查项结果.push({
    编号, 检查项, 实测值, 阈值, 结论: ok ? REVIEW_VERDICT.通过 : REVIEW_VERDICT.不通过
  });
  追加规则复核项(p, scope, 场次IDs, 行R, find);

  // 存在任一阻塞级 Finding → 不通过，无「基本通过」中间态
  const 总判定 = findings.some(f => f.严重度 === FINDING_SEVERITY.阻塞) ? REVIEW_VERDICT.不通过 : REVIEW_VERDICT.通过;
  const 范围 = Array.isArray(scope) ? scope : (scope ? [scope] : []);
  const report = {
    报告ID: uid('review'), 项目ID: p.项目ID || '',
    复核范围: [...new Set([...范围, ...场次IDs, ...(p.shots || []).map(s => s.分镜ID), ...(p.storyboardItems || []).map(s => s.成品ID)])],
    总判定, 检查项结果, 发现项ID列表: findings.map(f => f.findingID),
    数据来源标记: 演示 ? DATA_MARK.演示数据 : DATA_MARK.真实模型,
    是否过期: false, 生成时间: now()
  };
  for (const f of findings) f.报告ID = report.报告ID;
  (p.reviewFindings ||= []).push(...findings);
  (p.directorReviews ||= []).push(report);
  return report;
}

// 回写边界：只改 reviewFindings[] / directorTasks[] 既有字段；不改剧本原文、分镜正文、场次、锚点、锁定负面词，不解锁、不生成图片/关键帧、不发起模型调用
export function applyWriteBack(project, reportId, confirmed) {
  // 取消则工程数据零变更（E-25）
  if (!confirmed) return { changed: [] };
  const p = project || {};
  const report = (p.directorReviews || []).find(r => r.报告ID === reportId);
  if (!report) return { changed: [] };
  const changed = [];

  const diag = (p.scriptDiagnoses || []).slice(-1)[0];
  const advices = diag ? buildRewriteAdvice(diag, p) : [];
  for (const f of (p.reviewFindings || [])) {
    if (f.报告ID !== reportId || f.建议替换文本) continue;
    if (f.检查项 === '旁白占比' && advices.length) {
      f.建议替换文本 = advices[0];
      changed.push(f.findingID);
    }
  }

  // 待办项：缺失帧 / 缺失锚点写入对应 DirectorTask 的 受阻原因，状态回落并刷新判定依据
  const 缺失帧 = (p.keyFrames || []).filter(isFrameMissing).map(k => k.帧ID);
  const 被引用资产 = [...new Set((p.shots || []).flatMap(s => s.关联资产ID列表 || []))];
  const 缺锚点 = missingAnchors(p, 被引用资产);
  const 待办 = [
    ...缺失帧.map(id => [id, 'F-007', '关键帧图片引用为空，需补生成']),
    ...缺锚点.map(id => [id, 'F-004', '被引用人物资产无有效锚点，需锁定并填写锚点标识'])
  ];
  for (const [id, 模块ID, 原因] of 待办) {
    const t = (p.directorTasks || []).find(x => x.目标模块ID === 模块ID);
    if (!t) continue;
    t.受阻原因 = `缺失条目ID：${id}；${原因}`;
    t.状态 = S.受阻;
    t.状态判定依据 = `回写登记待办项：${id}`;
    t.更新时间 = now();
    changed.push(t.任务ID);
  }
  markExpired(p, reportId);
  return { changed };
}

export function markExpired(project, reportId) {
  const r = (project?.directorReviews || []).find(x => x.报告ID === reportId);
  if (r) r.是否过期 = true;
}

export function getProgress(project) {
  const list = project?.directorTasks || [];
  return {
    已完成数: list.filter(t => t.状态 === S.已完成).length,
    总数: list.length,
    受阻数: list.filter(t => t.状态 === S.受阻).length
  };
}

// ── 第四段：提示词架构（F-012 第四区；与既有七函数同文件、同唯一实现）──

// 脱敏：真实姓名/品牌一律转为 角色A/角色B 占位，禁止落原词（§5）
function 脱敏身份(名单) {
  if (Array.isArray(名单) && 名单.length) return 名单.map((_, i) => '角色' + String.fromCharCode(65 + i));
  return ['角色A'];
}

// 构造单条镜头拆解：含全部 23 时间轴维度 + 五段式衔接标注，主体身份脱敏占位
function buildShotEntry(p, idx, spec, 角色) {
  const 序号 = idx + 1;
  const 时间码 = `00:00:${String((序号 - 1) * 4).padStart(2, '0')}:00`;
  return {
    条目ID: uid('sd'), 项目ID: p.项目ID || '',
    来源类型: spec.来源类型,
    关联分镜ID: spec.来源类型 === '项目内分镜' ? (spec.关联分镜ID || '') : '',
    逆向工程源: spec.来源类型 === '逆向工程' ? (spec.逆向工程源 || '') : '',
    镜头序号: 序号, 时间码, 时长: 4,
    主体身份: 脱敏身份(角色),
    外观锚点: { 锚点标识: 'ANC-DEMO-01', 参考标识: 'demo-ref-01' },
    动作轨迹: '主体缓步向前，肩线稳定', 表情变化: '神情克制，目光聚焦',
    场景空间: { 前景: '主体居中', 后景: '虚化街景', 关系: '前实后虚' },
    景别: '中景', 机位: '平视', 焦段: '标准', 构图: '三分线', 景深: '浅景深',
    运镜方式: '固定', 运动速度: '静止', 光线方向: '侧面', 综合色温: '冷调', 材质: '棉质风衣',
    节奏: '舒缓', 转场: '硬切', 特效: '无', 环境声音: '环境底噪',
    衔接标注: { 起始画面: '主体入画定格', 人物动作: '抬手推门', 摄影运动: '静止', 结束画面: '主体出画', 镜头衔接: '动作顺势接下一镜' },
    一致性标记: [], 生成时间: now()
  };
}

// ①文本分析经 model-adapter 用途=文本 判定配置；未配置/强制演示 → 零请求的演示数据路径（§4.1②）
export function generateShotTimeline(project, sourceSpec = {}) {
  const p = project || {};
  const spec = { 来源类型: sourceSpec.来源类型 || '项目内分镜', 关联分镜ID: sourceSpec.关联分镜ID, 逆向工程源: sourceSpec.逆向工程源 };
  const 演示 = isForceDemo(p) || !selectConfig(p, '文本');
  // 演示数据：直接由固定模板构造时间轴条目，来源标记=演示数据，零外部请求
  const 底 = p.shots && p.shots.length
    ? p.shots.map((_, i) => buildShotEntry(p, i, spec, ['角色A']))
    : Array.from({ length: 3 }, (_, i) => buildShotEntry(p, i, spec, i % 2 ? ['角色A', '角色B'] : ['角色A']));
  底.forEach((e, i) => { e.镜头序号 = i + 1; });  // 镜头序号升序连续
  (p.shotDeconstructions ||= []).push(...底);
  return 底;
}

// 正向提示词引用 EL_FRAMEWORK 8 要素结构 + 时间轴字段文本；负面提示词复用 assembleNegativePrompt
export function buildPromptArchitect(project, shotIds = [], targetModelSpec = {}) {
  const p = project || {};
  // null 与 undefined 都按「未配置→演示」处理：默认参数仅对 undefined 生效，传 null 时需显式守卫（§4.1③ VID-03 边界）
  const 目标类型 = (targetModelSpec && targetModelSpec.类型) || '演示';
  const 演示 = isForceDemo(p) || !selectConfig(p, '视频');
  const 表 = p.shotDeconstructions || [];
  const 约束组 = (p.consistencyRules || []).filter(r => p.一致性约束锁定 || r.全局锁定状态).map(r => r.类别);
  const 结果 = shotIds.map(id => {
    const shot = 表.find(s => s.条目ID === id) || {};
    const 时间轴文本 = [shot.景别, shot.机位, shot.运镜方式, shot.光线方向, shot.综合色温].filter(Boolean).join('，');
    const 正向 = `【8 要素框架】${Object.keys(CONST.EL_FRAMEWORK).join('/')}；【时间轴】${时间轴文本}；主体：${(shot.主体身份 || []).join('、')}`;
    return {
      结果ID: uid('pa'), 项目ID: p.项目ID || '', 关联镜头拆解ID: id,
      目标模型: String(targetModelSpec.名称 || '演示模型'), 目标模型类型: 目标类型,
      正向提示词: 正向, 负面提示词: assembleNegativePrompt(p, shot).join('；'),
      八要素结构: CONST.EL_FRAMEWORK,
      来源标记: 演示 ? DATA_MARK.演示数据 : DATA_MARK.真实模型,
      一致性约束组: 约束组, 生成时间: now()
    };
  });
  (p.promptArchitectResults ||= []).push(...结果);
  return 结果;
}

// 经 model-adapter 用途=文本 分析用户粘贴文字；降级演示数据，已脱敏声明=true（§4.1②/§5）
export function reverseAnalyze(project, descriptionText = '') {
  const p = project || {};
  const 文本 = String(descriptionText || '');
  const 演示 = isForceDemo(p) || !selectConfig(p, '文本');
  const spec = { 来源类型: '逆向工程', 逆向工程源: '用户粘贴文字描述' };
  // 演示数据：构造单条脱敏镜头拆解 + 八要素占位 + 可迁移方法摘要
  const 拆解 = [buildShotEntry(p, 0, spec, ['角色A'])];
  const 八要素 = Object.keys(CONST.EL_FRAMEWORK).map(k => ({ 要素: k, 取值: '演示占位' }));
  const 摘要 = '演示数据：保持主体锚点一致、镜头衔接连续，可迁移至同类写实短剧';
  const 结果 = {
    分析ID: uid('ra'), 项目ID: p.项目ID || '', 输入描述文本: 文本,
    镜头拆解: 拆解, 八要素提取: 八要素, 可迁移方法摘要: 摘要,
    已脱敏声明: true, 数据来源标记: 演示 ? DATA_MARK.演示数据 : DATA_MARK.真实模型,
    生成时间: now()
  };
  (p.reverseAnalyses ||= []).push(结果);
  return 结果;
}

export function getConsistencyRules(project) {
  return (project || {}).consistencyRules || [];
}

// 按 类别 翻转该条一致性规则的 全局锁定状态
export function toggleConsistencyCategory(project, category) {
  const r = ((project || {}).consistencyRules || []).find(x => x.类别 === category);
  if (r) r.全局锁定状态 = !r.全局锁定状态;
  return r || null;
}

export function toggleConsistencyGlobalLock(project, value) {
  (project || {}).一致性约束锁定 = !!value;
}

// 对相邻镜头比对 主体身份 + 外观锚点 + 场景空间，命中 §7 六类者写入 一致性标记
export function markConsistencyHits(project, shotIds = []) {
  const p = project || {};
  const 表 = p.shotDeconstructions || [];
  const ids = shotIds.length ? shotIds : 表.map(s => s.条目ID);
  for (let i = 1; i < ids.length; i++) {
    const 前 = 表.find(s => s.条目ID === ids[i - 1]);
    const 后 = 表.find(s => s.条目ID === ids[i]);
    if (!前 || !后) continue;
    const 标记 = [];
    if (JSON.stringify(前.主体身份 || []) !== JSON.stringify(后.主体身份 || [])) 标记.push('人物变脸');
    if ((前.外观锚点?.锚点标识 || '') !== (后.外观锚点?.锚点标识 || '')) 标记.push('服装脱落');
    if ((前.场景空间?.后景 || '') !== (后.场景空间?.后景 || '')) 标记.push('肢体错位');
    if ((前.场景空间?.关系 || '') !== (后.场景空间?.关系 || '')) 标记.push('背景闪烁');
    if (!(后.动作轨迹 || '').trim()) 标记.push('动作断裂');
    if ((前.场景空间?.前景 || '') !== (后.场景空间?.前景 || '')) 标记.push('物理关系失真');
    后.一致性标记 = [...new Set([...(后.一致性标记 || []), ...标记])];
  }
  return ids;
}
