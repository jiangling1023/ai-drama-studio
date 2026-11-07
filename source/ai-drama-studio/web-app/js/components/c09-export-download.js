import { escapeHtml } from './index.js';
import { registerButton } from '../core/ui-response.js';
import * as IO from '../io.js';

// C-09 导出下载：全站导出唯一走 io.exportFile()（stripSecrets→validateNoKey→Blob），不另写序列化
export function exportDownload(payload, format = 'json', filename = '工程包.json', opts = {}) {
  const btnId = opts.btnId || 'BTN-C09-GLB-01';
  registerButton(btnId, {
    类别: '①', handler: opts.onExport || (() => {
      if (typeof IO.exportFile === 'function') IO.exportFile(payload, format, filename);
    }),
    禁用原因: opts.禁用原因 || '工程无可导出内容，请先生成剧本',
    toast: opts.toast || '工程已导出（已校验：不含 API Key）',
    关联FID: opts.关联FID || 'K-02'
  });

  const html = `<div class="export-block" data-component="c09">
    <button type="button" class="btn btn-primary" data-btn-id="${escapeHtml(btnId)}">${escapeHtml(opts.label || '导出下载')}</button>
    <span class="value-pill export-check">已校验：不含 API Key</span>
  </div>`;
  if (opts.container && typeof opts.container === 'object') opts.container.innerHTML = html;
  return html;
}
