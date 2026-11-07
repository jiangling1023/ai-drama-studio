import { escapeHtml } from './index.js';
import { registerButton } from '../core/ui-response.js';
import { renderStatusTag } from './c03-status-tag.js';
import { renderSourceBadge } from './c15-source-badge.js';

// C-07 任务卡片：状态/耗时/错误/重试/快照/演示数据角标全保留，内嵌 C-15 标识条（九环节可见位同源）
export function renderGenTaskCard(task = {}, opts = {}) {
  const prefix = opts.btnPrefix || 'BTN-C07-GLB-01';
  const retryId = prefix + '-retry', snapId = prefix + '-snapshot', inputId = prefix + '-input';
  registerButton(retryId, { 类别: '①', handler: opts.onRetry, 禁用原因: '该任务状态为进行中，请等待完成后重试', toast: '可继续使用演示数据结果', 关联FID: opts.关联FID });
  registerButton(snapId, { 类别: '①', handler: opts.onSnapshot, 空状态: '暂无生成任务', 关联FID: opts.关联FID });
  registerButton(inputId, { 类别: '①', handler: opts.onInput, 关联FID: opts.关联FID });

  const isDemo = String(task['来源模型标识'] || '').includes('演示') || String(task['状态'] || '').includes('已降级');
  const badge = isDemo ? `<span class="demo-badge" data-component="demo">演示数据</span>` : '';
  const status = renderStatusTag(task['状态'] || '待处理');
  const chain = renderSourceBadge({
    sourceType: opts.sourceType || task['来源模型标识'] || '未配置',
    purpose: opts.purpose || task['类型'] || '文本',
    modelId: opts.modelId || '',
    degradeReason: opts.degradeReason || '',
    dataMark: isDemo ? '演示数据' : '真实模型',
    onOpenChain: opts.onOpenChain,
    compact: true
  }, { btnPrefix: prefix + '-c15' });

  const html = `<div class="glass task-card glow-g2" data-component="c07" data-task-id="${escapeHtml(task['任务ID'] || '')}">
    <div class="task-card-head">${status}<span class="task-id">${escapeHtml(task['任务ID'] || '—')}</span>${badge}</div>
    <div class="task-card-metrics">
      <span class="metric">耗时：<strong>${escapeHtml(task['耗时'] ?? '—')}</strong></span>
      <span class="metric">重试次数：<strong>${escapeHtml(task['重试次数'] ?? 0)}</strong></span>
      <span class="metric">错误信息：<strong>${escapeHtml(task['错误信息'] || '无')}</strong></span>
      <span class="metric">错误类型：<strong>${escapeHtml(task['错误类型'] || '无')}</strong></span>
    </div>
    <div class="task-card-chain">${chain}</div>
    <div class="task-card-actions">
      <button type="button" class="btn btn-ghost" data-btn-id="${escapeHtml(retryId)}">重试</button>
      <button type="button" class="btn btn-ghost" data-btn-id="${escapeHtml(snapId)}">查看最终提示词快照</button>
      <button type="button" class="btn btn-ghost" data-btn-id="${escapeHtml(inputId)}">展开输入快照</button>
    </div>
    <div class="task-card-input" hidden>${escapeHtml(typeof task['输入快照'] === 'string' ? task['输入快照'] : JSON.stringify(task['输入快照'] || {}))}</div>
  </div>`;
  if (opts.container && typeof opts.container === 'object') opts.container.innerHTML = html;
  return html;
}
