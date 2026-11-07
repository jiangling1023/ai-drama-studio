import { escapeHtml } from './index.js';

// C-13 常驻提示条：dismissible=false 常驻不可关闭（VID-03 边界条），不随玻璃透明度弱化、无关闭按钮
export function renderAlertBar(message = '', opts = {}) {
  const tone = opts.tone || 'accent';
  const html = `<div class="alert-bar tone-${escapeHtml(tone)}" data-component="c13" role="note" data-dismissible="false">
    <span class="alert-text">${escapeHtml(message || opts.text || '')}</span>
  </div>`;
  if (opts.container && typeof opts.container === 'object') opts.container.innerHTML = html;
  return html;
}
