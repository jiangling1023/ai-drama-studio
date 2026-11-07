import { escapeHtml } from './index.js';
import { registerButton } from '../core/ui-response.js';

// C-02 可编辑行：输入控件只输出标记，失焦写回由 workspace 根容器统一 commit（不在此重复实现）
export function renderEditableRow(fields = [], values = {}, opts = {}) {
  const list = (Array.isArray(fields) && fields.length ? fields : [{ key: '字段', label: '字段' }])
    .map(f => (typeof f === 'string' ? { key: f, label: f } : f));
  const cells = list.map(f => {
    const v = values && values[f.key] != null ? values[f.key] : '';
    if (f.readonly) return `<td><span class="value-pill">${escapeHtml(v)}</span></td>`;
    const common = `data-editable="1" data-field="${escapeHtml(f.key)}" data-object-id="${escapeHtml(opts.objectId || '')}"`;
    const ctrl = f.multiline
      ? `<textarea class="field-input" ${common} rows="2">${escapeHtml(v)}</textarea>`
      : `<input class="field-input" type="${f.type || 'text'}" ${common} value="${escapeHtml(v)}">`;
    return `<td class="editable-cell">${ctrl}</td>`;
  }).join('');

  let action = '';
  if (opts.deleteBtnId) {
    registerButton(opts.deleteBtnId, {
      类别: '①', handler: opts.onDelete, 禁用原因: opts.禁用原因, toast: opts.toast, 关联FID: opts.关联FID
    });
    action = `<td><button type="button" class="btn btn-ghost" data-btn-id="${escapeHtml(opts.deleteBtnId)}">删除</button></td>`;
  }
  const html = `<tr class="editable-row" data-component="c02">${cells}${action}</tr>`;
  if (opts.container && typeof opts.container === 'object') opts.container.innerHTML = html;
  return html;
}
