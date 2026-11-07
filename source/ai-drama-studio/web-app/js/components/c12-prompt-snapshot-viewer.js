import { escapeHtml } from './index.js';
import { showToast } from './c05-toast.js';
import { registerButton } from '../core/ui-response.js';

const 关窗 = () => {
  const host = typeof document !== 'undefined' ? document.getElementById('modalRoot') : null;
  if (host) host.innerHTML = '';
};

// 剪贴板不可用时退化为「选中快照文本」，把控制权交回用户，绝不静默
function 选中快照() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const host = document.getElementById('modalRoot');
  const card = host && host.querySelector('.snapshot-card');
  const sel = window.getSelection && window.getSelection();
  if (!card || !sel || typeof document.createRange !== 'function') return;
  const range = document.createRange();
  range.selectNodeContents(card);
  sel.removeAllRanges();
  sel.addRange(range);
}

// C-12 快照查看器：正向 / 负面 / 来源三区各为独立玻璃子卡，历史快照只读、不回溯不重组
export function openPromptSnapshotViewer(snapshot = {}, opts = {}) {
  const closeId = opts.closeBtnId || 'BTN-C12-GLB-01a';
  const copyId = opts.copyBtnId || 'BTN-C12-GLB-01b';
  const text = [
    '【正向词】', String(snapshot['全局正向词'] ?? snapshot['最终正向词'] ?? ''),
    '【负面词】', (snapshot['最终负面词'] ?? snapshot['全局负面词'] ?? []),
    '【锚点携带】', String(snapshot['锚点携带'] ?? ''),
    '【被锚点覆盖】', String(snapshot['被锚点覆盖'] ?? ''),
    '【来源标记】', String(snapshot['来源标记'] ?? '')
  ].join('\n');

  // ④类不执行 handler，关闭/复制必须落①才真移除 DOM、真写剪贴板
  registerButton(closeId, {
    类别: '①', 关联FID: 'NEG-06',
    handler: () => {
      关窗();
      if (typeof opts.onClose === 'function') opts.onClose();
    }
  });

  registerButton(copyId, {
    类别: '①', 关联FID: 'NEG-06',
    handler: () => {
      const clip = typeof navigator !== 'undefined' ? navigator.clipboard : null;
      const 降级 = () => {
        选中快照();
        showToast('剪贴板不可用，已选中快照文本，请按 Ctrl/Cmd+C 复制', { level: 'warn' });
      };
      if (!clip || typeof clip.writeText !== 'function') { 降级(); return undefined; }
      return clip.writeText(text).then(
        () => showToast('已复制到剪贴板', { level: 'ok' }),
        降级
      );
    }
  });

  const asList = v => Array.isArray(v) ? v.map(x => `<span class="value-pill">${escapeHtml(x)}</span>`).join(' ')
    : `<span class="value-pill">${escapeHtml(v || '—')}</span>`;
  const html = `<div class="modal-mask" data-component="c12"><div class="glass modal-card snapshot-card" role="dialog" aria-modal="true">
    <h2 class="modal-title">最终提示词快照（只读）</h2>
    <div class="snapshot-zones">
      <section class="glass snapshot-zone"><h3>正向词</h3><div>${escapeHtml(snapshot['全局正向词'] ?? snapshot['最终正向词'] ?? '')}</div></section>
      <section class="glass snapshot-zone"><h3>负面词</h3><div>${asList(snapshot['最终负面词'] ?? snapshot['全局负面词'] ?? [])}</div></section>
      <section class="glass snapshot-zone"><h3>来源</h3><div>${asList(snapshot['来源标记'] ?? '—')}
        <p>锚点携带：${escapeHtml(snapshot['锚点携带'] ?? '—')}</p>
        <p>被锚点覆盖：${escapeHtml(snapshot['被锚点覆盖'] ?? '—')}</p></div></section>
    </div>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" data-btn-id="${escapeHtml(copyId)}">复制快照</button>
      <button type="button" class="btn btn-ghost" data-btn-id="${escapeHtml(closeId)}" data-snapshot-close="1">关闭</button>
    </div>
  </div></div>`;
  const host = typeof document !== 'undefined'
    ? (document.getElementById('modalRoot') || document.getElementById('toast') || document.body) : null;
  if (host) {
    host.innerHTML = html;
    const close = host.querySelector('[data-snapshot-close="1"]');
    if (close && typeof close.focus === 'function') close.focus();
  }
  return html;
}
