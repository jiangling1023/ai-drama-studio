import { escapeHtml } from './index.js';
import { showToast } from './c05-toast.js';
import { registerButton } from '../core/ui-response.js';
import { renderStatusTag } from './c03-status-tag.js';
import * as IO from '../io.js';

function 选中提示词(container) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const box = container && container.querySelector ? container.querySelector('.prompt-view') : null;
  const sel = window.getSelection && window.getSelection();
  if (!box || !sel || typeof document.createRange !== 'function') return;
  const range = document.createRange();
  range.selectNodeContents(box);
  sel.removeAllRanges();
  sel.addRange(range);
}

// C-18 成品提示词查看器：正向/负面/八要素结构(JSON)/来源标记(StatusTag)/一致性约束组(标签)
export function renderPromptView(container, opts = {}) {
  const result = opts.result || {};
  const 正向 = String(result.正向提示词 || '');
  const 负面 = String(result.负面提示词 || '');
  const isDemo = String(result.来源标记) === '演示数据';

  // ④类不执行 handler，复制必须落①才真写剪贴板；页面传了 onCopy 就优先用页面的
  const 内置复制 = () => {
    const clip = typeof navigator !== 'undefined' ? navigator.clipboard : null;
    const 降级 = () => {
      选中提示词(container);
      showToast('剪贴板不可用，已选中提示词，请按 Ctrl/Cmd+C 复制', { level: 'warn' });
    };
    if (!clip || typeof clip.writeText !== 'function') { 降级(); return undefined; }
    return clip.writeText(`${正向}\n${负面}`).then(
      () => showToast('已复制到剪贴板', { level: 'ok' }),
      降级
    );
  };

  registerButton('BTN-C18-P012-01', {
    类别: '①', handler: opts.onCopy || 内置复制, 关联FID: 'CR-05'
  });
  registerButton('BTN-C18-P012-02', {
    类别: '①',
    handler: opts.onExport || (() => {
      // 唯一下载出口：stripSecrets→校验无密钥→Blob，零外部请求
      if (typeof IO.exportFile === 'function') IO.exportFile(result, 'json', '成品提示词.json');
    }),
    // 页面自带 onExport 时由页面给反馈，避免双 Toast
    toast: opts.onExport ? undefined : '提示词已导出（已校验：不含 API Key）', 关联FID: 'CR-05'
  });

  // 演示数据角标：沿用 §12.6 实底金黄，降级时常显（z2 不被透明化吞没）
  const demoBadge = isDemo ? `<span class="demo-badge" data-component="demo">来源：演示数据</span>` : '';
  const tags = Array.isArray(result.一致性约束组) && result.一致性约束组.length
    ? result.一致性约束组.map(t => `<span class="value-pill">${escapeHtml(t)}</span>`).join(' ')
    : '—';
  const structure = JSON.stringify(result.八要素结构 || {}, null, 2);

  const html = `<section class="glass prompt-view" data-component="c18">
    <div class="prompt-view-head source-line">
      <h3>成品提示词</h3>
      ${demoBadge}
      <div class="form-actions">
        <button type="button" class="btn" data-btn-id="BTN-C18-P012-01">复制提示词</button>
        <button type="button" class="btn btn-primary" data-btn-id="BTN-C18-P012-02">导出提示词</button>
      </div>
    </div>
    <div class="prompt-block">
      <h4>正向提示词</h4>
      <pre class="prompt-text">${escapeHtml(正向)}</pre>
    </div>
    <div class="prompt-block">
      <h4>负面提示词</h4>
      <pre class="prompt-text">${escapeHtml(负面)}</pre>
    </div>
    <div class="prompt-block">
      <h4>八要素结构</h4>
      <pre class="prompt-text">${escapeHtml(structure)}</pre>
    </div>
    <div class="prompt-block">
      <h4>来源标记</h4>
      ${renderStatusTag(result.来源标记 || '真实模型')}
    </div>
    <div class="prompt-block">
      <h4>一致性约束组</h4>
      <div class="prompt-tags">${tags}</div>
    </div>
  </section>`;
  if (container && typeof container === 'object') container.innerHTML = html;
  return html;
}
