import { escapeHtml } from './index.js';
import { showToast } from './c05-toast.js';
import { registerButton } from '../core/ui-response.js';

// 关闭=清空唯一宿主，任何 ① handler 都先落这一步，避免回调抛错时弹层卡死
function closeModal() {
  const host = typeof document !== 'undefined' ? document.getElementById('modalRoot') : null;
  if (host) host.innerHTML = '';
}

const 失败原因 = e => (e && (e.message || e.msg)) ? String(e.message || e.msg) : String(e == null ? '未知错误' : e);

// C-04 确认框：五类危险确认一套实现；默认焦点「取消」、确认按钮 --danger 实底
export function openConfirmModal(options = {}) {
  const confirmId = options.confirmBtnId || 'BTN-C04-GLB-01a';
  const cancelId = options.cancelBtnId || 'BTN-C04-GLB-01b';
  const cancelText = options.cancelToast || '已取消，原始数据未改变';

  // ④类不执行 handler（respond 只弹 Toast），取消/确认必须落①才真关窗、真回调
  registerButton(cancelId, {
    类别: '①', 关联FID: options.关联FID,
    handler: () => {
      closeModal();
      // 取消必须是零变更：只关窗 + 通知调用方，不触碰任何数据写入
      if (typeof options.onCancel === 'function') options.onCancel();
      showToast(cancelText, { level: 'info' });
    }
  });

  registerButton(confirmId, {
    类别: '①', toast: options.confirmToast, 关联FID: options.关联FID,
    handler: () => {
      closeModal();
      if (typeof options.onConfirm !== 'function') return undefined;
      const 报错 = e => showToast('操作失败：' + 失败原因(e), { level: 'error' });
      try {
        const r = options.onConfirm();
        // 异步回调：拒绝即报错，弹层已关闭，不再留半个确认态
        if (r && typeof r.then === 'function') return r.catch(报错);
        return r;
      } catch (e) {
        报错(e);
        return undefined;
      }
    }
  });

  const ids = Array.isArray(options.变更条目ID) ? options.变更条目ID : [];
  const idList = ids.length
    ? `<div class="modal-ids">将变更以下条目：${ids.map(i => `<span class="value-pill">${escapeHtml(i)}</span>`).join(' ')}</div>` : '';
  const html = `<div class="modal-mask" data-component="c04"><div class="glass modal-card" role="dialog" aria-modal="true">
    <h2 class="modal-title">${escapeHtml(options.title || '请确认操作')}</h2>
    <div class="modal-body">${escapeHtml(options.message || '')}${idList}</div>
    <div class="modal-actions">
      <button type="button" class="btn btn-danger" data-btn-id="${escapeHtml(confirmId)}">${escapeHtml(options.confirmLabel || '确认')}</button>
      <button type="button" class="btn btn-ghost" data-btn-id="${escapeHtml(cancelId)}" data-cancel="1">取消</button>
    </div>
  </div></div>`;

  const host = typeof document !== 'undefined'
    ? (document.getElementById('modalRoot') || document.getElementById('toast') || document.body) : null;
  if (host) {
    host.innerHTML = html;
    // 遮罩点击等同取消：仅当点在遮罩本身（不在卡片内）才关窗，避免点正文误关
    const mask = host.querySelector('.modal-mask');
    if (mask && typeof mask.addEventListener === 'function') {
      mask.addEventListener('click', e => {
        if (e.target !== mask) return;
        closeModal();
        if (typeof options.onCancel === 'function') options.onCancel();
        showToast(cancelText, { level: 'info' });
      });
    }
    const cancel = host.querySelector('[data-cancel="1"]');
    if (cancel && typeof cancel.focus === 'function') cancel.focus();
  }
  return html;
}
