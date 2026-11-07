import { escapeHtml } from './index.js';
import { showToast } from './c05-toast.js';
import { registerButton } from '../core/ui-response.js';
import { renderStatusTag } from './c03-status-tag.js';
import { openConfirmModal } from './c04-confirm-modal.js';

// 六类禁止项（与 §2.2 种子类别一致），顺序即 BTN-C19-P012-01~06
const CATEGORIES = ['人物变脸', '服装脱落', '肢体错位', '背景闪烁', '动作断裂', '物理关系失真'];

// C-19 一致性约束组编辑器：6 类开关 + 全局锁定；解锁走 C-04 确认（取消零变更），复用 NEG 锁定交互（C-03 StatusTag / C-04 confirm）
export function renderConsistencyEditor(container, opts = {}) {
  const rules = Array.isArray(opts.rules) ? opts.rules : [];
  const globalLock = !!opts.globalLock;
  const byCat = {};
  for (const r of rules) if (r && r.类别) byCat[r.类别] = r;

  const rows = CATEGORIES.map((cat, i) => {
    const n = i + 1;
    const rule = byCat[cat];
    const enabled = !!rule;
    const locked = rule ? !!rule.全局锁定状态 : false;

    // 六类开关：单类启用/停用
    registerButton(`BTN-C19-P012-0${n}`, {
      类别: '①', handler: () => opts.onToggleCategory && opts.onToggleCategory(cat),
      toast: `一致性约束「${cat}」已${enabled ? '停用' : '启用'}`, 关联FID: 'CR-05'
    });
    // 单类锁定/解锁：解锁走 C-04（确认/取消 data-btn-id=BTN-C19-P012-C04），词文本保留
    const lockId = `BTN-C19-P012-LK-0${n}`;
    registerButton(lockId, {
      类别: '①', handler: () => {
        if (locked) {
          openConfirmModal({
            title: '解锁一致性约束',
            message: `解锁「${cat}」后，此后新提示词不再强制附加该类（词文本保留）。`,
            confirmBtnId: 'BTN-C19-P012-C04', cancelBtnId: 'BTN-C19-P012-C04X',
            confirmLabel: '确认解锁', cancelToast: '已取消，锁定状态未改变',
            confirmToast: `一致性约束「${cat}」已解锁`,
            onConfirm: () => opts.onUnlockCategory && opts.onUnlockCategory(cat)
          });
        } else {
          opts.onLockCategory && opts.onLockCategory(cat);
          showToast(`一致性约束「${cat}」已锁定`, { level: 'ok' });
        }
      }, 关联FID: 'CR-05'
    });

    const lockTag = renderStatusTag(locked ? '已锁定' : '未锁定', { tone: locked ? 'lock' : 'muted' });
    return `<div class="consistency-row source-line">
      <span class="value-pill">${escapeHtml(cat)}</span>
      <span class="consistency-口径">${escapeHtml(rule ? rule.判定口径 : '（未启用）')}</span>
      ${lockTag}
      <div class="form-actions">
        <button type="button" class="btn" data-btn-id="BTN-C19-P012-0${n}">${enabled ? '停用' : '启用'}</button>
        <button type="button" class="btn ${locked ? 'btn-ghost' : 'btn-primary'}" data-btn-id="${lockId}">${locked ? '解锁' : '锁定'}</button>
      </div>
    </div>`;
  }).join('');

  // 全局锁定开关（Project 根「一致性约束锁定」默认 true）；解锁走 C-04
  // 不在注册项上挂静态 toast：那会在确认前就宣称已解锁，取消时与「零变更」矛盾
  registerButton('BTN-C19-P012-07', {
    类别: '①', handler: () => {
      if (globalLock) {
        openConfirmModal({
          title: '解除一致性约束全局锁定',
          message: '解除全局锁定后，此后新提示词不再强制附加 6 类禁止项（默认开启，与 NEG 同源）。',
          confirmBtnId: 'BTN-C19-P012-C04', cancelBtnId: 'BTN-C19-P012-C04X',
          confirmLabel: '确认解锁', cancelToast: '已取消，锁定状态未改变',
          confirmToast: '一致性约束已全局解锁',
          onConfirm: () => opts.onUnlockCategory && opts.onUnlockCategory('__global__')
        });
      } else {
        opts.onLockCategory && opts.onLockCategory('__global__');
        showToast('一致性约束已全局锁定', { level: 'ok' });
      }
    }, 关联FID: 'CR-05'
  });

  const html = `<section class="glass consistency-editor" data-component="c19">
    <div class="consistency-editor-head source-line">
      <h3>一致性约束组</h3>
      ${renderStatusTag(globalLock ? '已锁定' : '未锁定', { tone: globalLock ? 'lock' : 'muted' })}
      <button type="button" class="btn ${globalLock ? 'btn-ghost' : 'btn-primary'}" data-btn-id="BTN-C19-P012-07">${globalLock ? '解除全局锁定' : '全局锁定'}</button>
    </div>
    ${rows}
  </section>`;
  if (container && typeof container === 'object') container.innerHTML = html;
  return html;
}
