// 全应用唯一组件 import 来源：C-01~C-15 各一套实现，页面只从这里导入，不按页重写第二份
export function escapeHtml(v) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => map[c]);
}

export { renderStatusTag } from './c03-status-tag.js';
export { renderDataTable } from './c01-data-table.js';
export { renderEditableRow } from './c02-editable-row.js';
export { openConfirmModal } from './c04-confirm-modal.js';
export { showToast } from './c05-toast.js';
export { renderModelConfigForm } from './c06-model-config-form.js';
export { renderGenTaskCard } from './c07-gen-task-card.js';
export { renderFileImport } from './c08-file-import.js';
export { exportDownload } from './c09-export-download.js';
export { renderEmptyState } from './c10-empty-state.js';
export { renderFieldError } from './c11-field-error.js';
export { openPromptSnapshotViewer } from './c12-prompt-snapshot-viewer.js';
export { renderAlertBar } from './c13-alert-bar.js';
export { renderDirectorPanel } from './c14-director-panel.js';
export { renderSourceBadge } from './c15-source-badge.js';
export { renderTimeline } from './c16-timeline.js';
export { renderShotCard } from './c17-shot-card.js';
export { renderPromptView } from './c18-prompt-view.js';
export { renderConsistencyEditor } from './c19-consistency-editor.js';
