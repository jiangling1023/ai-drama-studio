import { CANVAS_CMD, NODE_TYPE, V1_TEXT, W_R07 } from '../constants.js';
import { uid } from './uid.js';

export const CANVAS_COMMANDS = [
  CANVAS_CMD.按场次生成, CANVAS_CMD.按分镜生成, CANVAS_CMD.按资产生成
];

export function matchCommand(input) {
  // CNV-01：精确匹配三种指令，其余一律不触发
  const s = String(input ?? '').trim();
  return CANVAS_COMMANDS.includes(s) ? s : null;
}

function 数据源(project, cmd, scope) {
  const p = project || {};
  const episodes = Array.isArray(p.episodes) ? p.episodes : [];
  const 当前集ID = p.当前集ID || episodes[0]?.集ID || '';
  // 无集时退化为全部场次：只做「按场次拆分」的工程没有 episodes，按当前集筛会被筛成 0 节点且无提示
  const 退化为全集 = String(scope) === '当前集' && (!episodes.length || !当前集ID);
  const 全集 = String(scope) !== '当前集' || 退化为全集;
  const 当前场次IDs = (p.scenes || []).filter(s => s.集ID === 当前集ID).map(s => s.场次ID);
  if (cmd === CANVAS_CMD.按场次生成) {
    const list = (p.scenes || []).filter(s => 全集 || s.集ID === 当前集ID);
    return { 类型: NODE_TYPE.场次, 条目: list.slice().sort((a, b) => (a.场次序号 || 0) - (b.场次序号 || 0)), 退化: 退化为全集 };
  }
  if (cmd === CANVAS_CMD.按分镜生成) {
    const list = (p.shots || []).filter(s => 全集 || !当前场次IDs.length || 当前场次IDs.includes(s.场次ID));
    return { 类型: NODE_TYPE.分镜, 条目: list.slice().sort((a, b) => (a.镜号 || 0) - (b.镜号 || 0)), 退化: 退化为全集 };
  }
  const 类别序 = { 人物: 0, 场景: 1, 道具: 2 };
  const list = (p.assets || []).slice()
    .sort((a, b) => (类别序[a.类型] ?? 9) - (类别序[b.类型] ?? 9) || (a.创建序 || 0) - (b.创建序 || 0));
  return { 类型: NODE_TYPE.资产, 条目: list, 退化: 退化为全集 };
}

// 按指令类型取对应主键：分镜节点只认「分镜ID」，避免回落到「场次ID」导致节点显示 demo-sc-01
function 取主键(r, 类型) {
  if (!r) return undefined;
  if (类型 === NODE_TYPE.场次) return r.场次ID;
  if (类型 === NODE_TYPE.分镜) return r.分镜ID;
  if (类型 === NODE_TYPE.资产) return r.资产ID;
  return r.场次ID || r.分镜ID || r.资产ID;
}

function 取标题(r, 类型) {
  if (类型 === NODE_TYPE.场次) return `${r.场次序号} · ${r.地点 || r.场次ID}`;
  if (类型 === NODE_TYPE.分镜) return `镜号 ${r.镜号} · ${r.景别 || r.分镜ID}`;
  return `${r.名称 || r.资产ID}（${r.类型}）`;
}

const 每行节点数 = 4;
const 列宽 = 220;
const 行高 = 150;
const 组间空隙 = 20;

// CNV-02/03：节点数 == 选中数据源条目数、一一绑定、网格布局（每行 4 个，同批不同类型组间留空隙）
export function buildCanvasNodes(project, cmd, scope = '当前集') {
  const c = matchCommand(cmd);
  if (!c) return { nodes: [], reason: W_R07 };
  const { 类型, 条目, 退化 } = 数据源(project, c, scope);
  const 提示 = 退化 ? '未找到当前集，已按全部场次生成' : '';
  if (!条目.length) return { nodes: [], reason: V1_TEXT.DATA_SOURCE_EMPTY, 提示 };
  let 组偏移 = 0;
  let 上一组 = null;
  const nodes = 条目.map((r, i) => {
    const 组 = 类型 === NODE_TYPE.资产 ? String(r.类型 || '') : 类型;
    // 按资产分组时段间留 20px，避免人物/场景/道具三类视觉上黏成一片
    if (上一组 !== null && 组 !== 上一组) 组偏移 += 组间空隙;
    上一组 = 组;
    return {
      节点ID: uid('cvn'), 类型,
      标题: 取标题(r, 类型),
      关联数据ID: 取主键(r, 类型),
      布局坐标: {
        x: 40 + (i % 每行节点数) * 列宽,
        y: 40 + Math.floor(i / 每行节点数) * 行高 + 组偏移
      },
      摘要: String(r.正文 || r.画面描述 || r.备注 || '').slice(0, 40),
      来源指令: c
    };
  });
  return { nodes, 提示 };
}

export function applyCanvasCommand(project, cmd, scope = '当前集', confirmed = false) {
  const p = project || {};
  const c = matchCommand(cmd);
  // CNV-06：非法指令节点数不变
  if (!c) return { changed: false, needConfirm: false, reason: W_R07 };
  const { nodes, reason, 提示 } = buildCanvasNodes(p, c, scope);
  // CNV-05：空数据源节点数 0，不生成占位空节点
  if (!nodes.length) {
    p.canvasNodes = [];
    return { changed: true, needConfirm: false, reason: reason || V1_TEXT.DATA_SOURCE_EMPTY, 提示 };
  }
  // CNV-04：画布非空时重复提交须一次显式确认，确认后全量重建不叠加
  if ((p.canvasNodes || []).length && !confirmed) {
    return { changed: false, needConfirm: true, reason: '画布已有节点，全量重建将覆盖现有节点，请确认', 提示 };
  }
  p.canvasNodes = nodes;
  return { changed: true, needConfirm: false, 提示 };
}

export function checkCanvasIntegrity(project) {
  const p = project || {};
  const nodes = p.canvasNodes || [];
  const nodeCount = nodes.length;
  const c = matchCommand(nodes[0]?.来源指令);
  if (!c) return { equal: nodeCount === 0, nodeCount, sourceCount: 0 };
  const 源全 = 数据源(p, c, '全集');
  const 源当 = 数据源(p, c, '当前集');
  const 全 = 源全.条目;
  const 当 = 源当.条目;
  const sourceCount = 当.length === nodeCount ? 当.length : 全.length;
  // CNV-07：编辑/拖动不得改「关联数据ID」，逐条可解析且不重复才判定一一对应仍成立
  const 可解析 = new Set(全.map(r => 取主键(r, 源全.类型)));
  const 关联IDs = nodes.map(n => n.关联数据ID);
  const 一一对应 = 关联IDs.every(id => 可解析.has(id)) && new Set(关联IDs).size === 关联IDs.length;
  return { equal: nodeCount === sourceCount && 一一对应, nodeCount, sourceCount };
}
