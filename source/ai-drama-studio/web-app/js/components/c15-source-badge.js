import { escapeHtml } from './index.js';
import * as CONST from '../constants.js';
import { registerButton } from '../core/ui-response.js';

// 永不呈现密钥 / 掩码值 / Base URL 鉴权串：命中即整体隐藏，另对超长串截断（K-01/K-03、W-S01）
function safe(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '—';
  if (/(https?:\/\/|bearer|authorization|api[_-]?key|token=|sk-|:[^/\s]*@)/i.test(s)) return '（已隐藏）';
  return s.length > 64 ? s.slice(0, 24) + '…' : s;
}

const NINE_LINKS = [
  '① 选配置：来源类型 + 用途 + 模型名称/ID（无密钥）',
  '② 校验可用性：启用状态 / 强制演示数据开关',
  '③ 组装提示词：正向 / 负面 / 锚点携带 / 被锚点覆盖 / 来源标记',
  '④ 创建 GenTask：任务ID / 输入快照 / 最终提示词快照',
  '⑤ 发起请求：进行中状态 + 耗时计时',
  '⑥ 结果或错误：成功 / 失败 + 错误类型 + 耗时 + 可重试',
  '⑦ 降级演示数据：降级原因（九类之一）+ 实底「演示数据」角标',
  '⑧ 写回 GenTask：状态 / 耗时 / 错误信息 / 重试次数',
  '⑨ 界面可见：顶部浮层 + 底部状态区 + 任务卡片三处同源'
];

function degradeText(reason) {
  if (!reason) return '未降级';
  const r = String(reason);
  const raw = CONST && CONST.DEGRADE_REASON;
  const allowed = Array.isArray(raw) ? raw.map(String)
    : (raw && typeof raw === 'object' ? Object.values(raw).map(String) : []);
  // 只显示九类之一，非九类原始串不落界面，避免把鉴权串/堆栈带出来
  return (!allowed.length || allowed.some(a => a === r || a.includes(r) || r.includes(a))) ? safe(r) : '已降级';
}

let 样式已注入 = false;
// 组件根与链面板都是 display:grid，会盖掉浏览器默认 [hidden]{display:none}，收起后仍占位
function 确保隐藏样式() {
  if (样式已注入 || typeof document === 'undefined' || !document.head) return;
  样式已注入 = true;
  const style = document.createElement('style');
  style.setAttribute('data-component', 'c15');
  // 用类+属性选择器提权压过 .chain-panel{display:grid}；不加 !important，否则会盖掉页面自身用内联 display 展开的写法
  style.textContent = '.source-badge[hidden],.source-badge .chain-panel[hidden]{display:none}';
  document.head.appendChild(style);
}

// C-15 来源/调用链标识条：来源类型 + 用途 + 模型名称/ID + 降级原因 + 数据来源标记，一次点击展开九环节
export function renderSourceBadge(props = {}, opts = {}) {
  确保隐藏样式();
  const btnId = opts.btnId || (opts.btnPrefix ? opts.btnPrefix + '-chain' : 'BTN-C15-GLB-01');
  const panelId = 'c15-chain-' + btnId.replace(/[^A-Za-z0-9_-]/g, '');
  const demo = String(props.dataMark || '') === '演示数据' || !!props.degradeReason;

  registerButton(btnId, {
    类别: '①', handler: () => {
      const el = typeof document !== 'undefined' ? document.getElementById(panelId) : null;
      if (el) el.hidden = !el.hidden;
      if (typeof props.onOpenChain === 'function') props.onOpenChain();
    },
    toast: opts.toast, 关联FID: 'CR-06'
  });

  const mark = props.dataMark === '真实模型' || props.dataMark === '演示数据' ? props.dataMark : '真实模型';
  const demoBadge = demo ? `<span class="demo-badge" data-component="demo">来源：演示数据</span>` : '';
  const html = `<div class="glass source-badge${props.compact ? ' compact' : ''}" data-component="c15">
    <div class="source-line">
      <span class="value-pill">${escapeHtml(safe(props.sourceType))}</span>
      <span class="source-sep">·</span>
      <span class="value-pill">${escapeHtml(safe(props.purpose))}</span>
      <span class="source-sep">·</span>
      <span class="value-pill">${escapeHtml(safe(props.modelId))}</span>
      <button type="button" class="btn btn-ghost" data-btn-id="${escapeHtml(btnId)}">查看调用链</button>
    </div>
    <div class="source-meta">
      <span>降级原因：<strong>${escapeHtml(degradeText(props.degradeReason))}</strong></span>
      <span>数据来源标记：<strong>${escapeHtml(mark)}</strong></span>
      ${demoBadge}
    </div>
    <div class="chain-panel" id="${escapeHtml(panelId)}" hidden>
      <ol class="chain-list">${NINE_LINKS.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ol>
    </div>
  </div>`;
  if (opts.container && typeof opts.container === 'object') opts.container.innerHTML = html;
  return html;
}
