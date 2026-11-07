import { escapeHtml } from './index.js';
import { registerButton } from '../core/ui-response.js';

let seq = 0;

// C-05 瞬时反馈：错误类常驻至手动关闭、同错误去重；同步写入 DOM 保证 1 秒内可见，不滑入遮挡点击区
export function showToast(message = '', opts = {}) {
  const text = String(message);
  const level = opts.level || 'info';
  const sticky = opts.sticky === true || level === 'error';
  const host = typeof document !== 'undefined'
    ? (document.getElementById('toast') || document.getElementById('modalRoot') || document.body) : null;

  // 同错误去重：按属性逐项比对，不把文本拼进选择器，避免特殊字符导致选择器异常
  if (level === 'error' && host && typeof host.querySelectorAll === 'function') {
    const dup = Array.from(host.querySelectorAll('.toast[data-level="error"]'))
      .some(el => el.getAttribute && el.getAttribute('data-text') === text);
    if (dup) return '';
  }

  seq++;
  const mySeq = seq; // 固定本次序号，闭包不能捕获可变的模块级计数器
  const btnId = opts.btnId || 'BTN-C05-GLB-01-' + mySeq;
  const remove = () => {
    const el = typeof document !== 'undefined' ? document.getElementById('toast-item-' + mySeq) : null;
    if (el && typeof el.remove === 'function') el.remove();
  };
  registerButton(btnId, { 类别: '①', handler: remove });

  const html = `<div class="toast toast-${escapeHtml(level)}" id="toast-item-${mySeq}" data-level="${escapeHtml(level)}" data-text="${escapeHtml(text)}" role="status" data-component="c05">
    <span class="toast-text">${escapeHtml(text)}</span>
    <button type="button" class="toast-close" data-btn-id="${escapeHtml(btnId)}" aria-label="关闭提示">×</button>
  </div>`;

  if (host) {
    host.insertAdjacentHTML('beforeend', html);
    if (!sticky && typeof setTimeout === 'function') setTimeout(remove, opts.duration || 4000);
  }
  return html;
}
