import { escapeHtml } from './index.js';

// C-03 状态标签：全部状态/来源/锁定/保存/演示数据唯一呈现，语义色 1px 描边 + 12% 实底
const TONE = {
  通过: 'ok', 成功: 'ok', 已完成: 'ok', 已保存: 'ok', 真实模型: 'ok',
  不通过: 'fail', 失败: 'fail', '不通过线': 'fail',
  需改写: 'degrade', 已降级: 'degrade', 已过期: 'degrade', 受阻: 'degrade', 进行中: 'degrade',
  已锁定: 'lock', 锁定: 'lock',
  演示数据: 'demo', '来源：演示数据': 'demo',
  未开始: 'muted', 未锁定: 'muted', 新建: 'muted'
};

export function renderStatusTag(status = '', opts = {}) {
  const text = String(status == null || status === '' ? '未开始' : status);
  const tone = opts.tone || TONE[text] || 'accent';
  const html = `<span class="status-tag tone-${escapeHtml(tone)}" data-component="c03" role="status">${escapeHtml(text)}</span>`;
  if (opts.container && typeof opts.container === 'object') opts.container.innerHTML = html;
  return html;
}
