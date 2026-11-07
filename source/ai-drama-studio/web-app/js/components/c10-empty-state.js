import { escapeHtml } from './index.js';
import { registerButton } from '../core/ui-response.js';

// C-10 空状态：列出缺什么 + 可点引导入口，引导入口本身落①且可达，不用循环动画占位
export function renderEmptyState(opts = {}) {
  const list = Array.isArray(opts.missing) ? opts.missing : [];
  const guideId = opts.guideBtnId || 'BTN-C10-GUIDE-01';
  registerButton(guideId, {
    类别: '①', handler: opts.onGuide, toast: opts.toast, 关联FID: opts.关联FID
  });
  const missing = list.length
    ? `<ul class="empty-missing">${list.map(m => `<li>${escapeHtml(m)}</li>`).join('')}</ul>` : '';
  const html = `<div class="glass empty-state" data-component="c10">
    <div class="empty-title">${escapeHtml(opts.title || '当前无内容')}</div>
    <div class="empty-desc">${escapeHtml(opts.message || '请先完成前置步骤')}</div>
    ${missing}
    <button type="button" class="btn btn-primary" data-btn-id="${escapeHtml(guideId)}">${escapeHtml(opts.guideLabel || '前往创建')}</button>
  </div>`;
  if (opts.container && typeof opts.container === 'object') opts.container.innerHTML = html;
  return html;
}
