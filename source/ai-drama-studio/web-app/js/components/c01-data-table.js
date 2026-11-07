import { escapeHtml } from './index.js';
import { registerButton } from '../core/ui-response.js';

// C-01 表格容器：只读/可编辑/矩阵/可展开行 + 计数 + 表头吸顶。V-02 不隐藏任何列，超宽用横向滚动承载
export function renderDataTable(columns = [], rows = [], opts = {}) {
  const cols = (Array.isArray(columns) && columns.length ? columns : [{ key: '字段', label: '字段' }])
    .map(c => (typeof c === 'string' ? { key: c, label: c } : c));
  const data = Array.isArray(rows) ? rows : [];
  const actions = Array.isArray(opts.rowActions) ? opts.rowActions : [];
  const countId = opts.countBtnId || 'BTN-C01-COUNT';
  registerButton(countId, { 类别: '④', toast: '条目数已统计' });

  const head = cols.map(c => `<th scope="col">${escapeHtml(c.label)}</th>`).join('');
  const body = data.map((r, i) => {
    const cells = cols.map(c => {
      const v = r && r[c.key] != null ? r[c.key] : '';
      return `<td>${opts.raw ? escapeHtml(v).replace(/\n/g, '<br>') : `<span class="value-pill">${escapeHtml(v)}</span>`}</td>`;
    }).join('');
    const btns = actions.map(a => {
      const id = a.id || `${opts.btnPrefix || 'BTN-C01-ROW'}-${i + 1}`;
      registerButton(id, { 类别: a.类别 || '①', handler: a.handler, 禁用原因: a.禁用原因, toast: a.toast, 关联FID: a.关联FID });
      return `<button type="button" class="btn btn-ghost" data-btn-id="${escapeHtml(id)}">${escapeHtml(a.label || '操作')}</button>`;
    }).join('');
    const extra = opts.expandable
      ? `<tr class="data-table-expand"><td colspan="${cols.length + (btns ? 1 : 0)}">${escapeHtml(r && r.展开内容 != null ? r.展开内容 : '')}</td></tr>` : '';
    return `<tr>${cells}${btns ? `<td class="row-actions">${btns}</td>` : ''}</tr>${extra}`;
  }).join('');

  const html = `<div class="glass data-table" data-component="c01">
    <div class="data-table-scroll"><table>
      <thead><tr>${head}${actions.length ? '<th scope="col">操作</th>' : ''}</tr></thead>
      <tbody>${body || `<tr><td colspan="${cols.length}" class="data-table-empty">暂无数据</td></tr>`}</tbody>
    </table></div>
    <div class="data-table-foot"><button type="button" class="count-pill" data-btn-id="${escapeHtml(countId)}">条目数：<strong>${data.length}</strong></button></div>
  </div>`;
  if (opts.container && typeof opts.container === 'object') opts.container.innerHTML = html;
  return html;
}
