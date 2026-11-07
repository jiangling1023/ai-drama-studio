import { escapeHtml } from './index.js';
import { registerButton } from '../core/ui-response.js';
import { renderFieldError } from './c11-field-error.js';

// C-08 文件导入：1px 实线玻璃拖放区，格式校验提示复用 C-11，不用动效
export function renderFileImport(opts = {}) {
  const btnId = opts.btnId || 'BTN-P001-07';
  registerButton(btnId, {
    类别: '①', handler: opts.onPick,
    toast: opts.errorToast || '仅支持 .txt / .md 纯文本文件，当前文件未导入，工程内容未改变',
    关联FID: opts.关联FID
  });
  const accept = opts.accept || '.txt,.md';
  const hint = opts.error ? renderFieldError(opts.error) : '';
  const html = `<div class="glass import-drop" data-component="c08">
    <div class="import-hint">${escapeHtml(opts.label || '拖放文件到此处，或点击选择文件')}</div>
    <input class="field-input" type="file" accept="${escapeHtml(accept)}" data-file-import="1" aria-label="选择文件">
    <button type="button" class="btn btn-primary" data-btn-id="${escapeHtml(btnId)}">${escapeHtml(opts.buttonLabel || '选择文件')}</button>
    ${hint}
  </div>`;
  if (opts.container && typeof opts.container === 'object') opts.container.innerHTML = html;
  return html;
}
