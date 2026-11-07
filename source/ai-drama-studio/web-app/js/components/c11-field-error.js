import { escapeHtml } from './index.js';

// C-11 字段校验提示：--fail 1px 描边 + 12% 实底行内提示，不使用闪烁
export function renderFieldError(message = '', opts = {}) {
  const html = `<div class="field-error" data-component="c11" role="alert">${escapeHtml(message || opts.message || '字段校验未通过')}</div>`;
  if (opts.container && typeof opts.container === 'object') opts.container.innerHTML = html;
  return html;
}
