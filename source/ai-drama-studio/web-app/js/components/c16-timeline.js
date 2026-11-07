import { escapeHtml } from './index.js';
import { registerButton } from '../core/ui-response.js';
import { renderEmptyState } from './c10-empty-state.js';
import { renderShotCard } from './c17-shot-card.js';

// C-16 镜头时间轴视图容器：升序渲染镜头卡片（C-17），空态走 C-10 并给「前往 P-005/P-010」引导入口
export function renderTimeline(container, opts = {}) {
  const shots = Array.isArray(opts.shots) ? opts.shots : [];
  const ordered = [...shots].sort((a, b) => (Number(a.镜头序号) || 0) - (Number(b.镜头序号) || 0));
  const selectedShotId = opts.selectedShotId;

  // 顶部刷新：重算时间轴/状态，无变化提示「状态已最新」
  registerButton('BTN-C16-P012-01', {
    类别: '①', handler: opts.onRefresh, toast: '状态已最新', 关联FID: 'CR-05'
  });

  let body;
  if (ordered.length === 0) {
    body = renderEmptyState({
      title: '尚无分镜',
      message: '请先在项目内生成分镜脚本（F-005）或分镜成品（F-010）。',
      missing: ['分镜脚本（F-005）', '分镜成品（F-010）'],
      guideBtnId: 'BTN-C10-P005-01',
      guideLabel: '前往 P-005 / P-010',
      toast: '正在跳转：P-005 / P-010',
      onGuide: opts.onRefresh,
      关联FID: 'CR-05'
    });
  } else {
    body = ordered.map(shot => {
      const id = shot.条目ID != null ? String(shot.条目ID) : String(shot.镜头序号);
      // 卡片整体点击=选中：内层按钮各自 data-btn-id 优先，dispatch 的 closest 会命中内层
      registerButton(`BTN-C16-P012-SEL-${id}`, {
        类别: '①', handler: () => opts.onSelect && opts.onSelect(id), 关联FID: 'CR-05'
      });
      return `<div class="shot-card-wrap" data-btn-id="BTN-C16-P012-SEL-${escapeHtml(id)}" data-shot-id="${escapeHtml(id)}">${
        renderShotCard(shot, {
          expanded: selectedShotId === id,
          editable: true,
          onEdit: opts.onEdit,
          onExpand: opts.onExpand,
          onSelect: opts.onSelect,
          consistencyHits: Array.isArray(shot.一致性标记) ? shot.一致性标记 : []
        })
      }</div>`;
    }).join('');
  }

  const html = `<section class="glass timeline" data-component="c16">
    <div class="timeline-head source-line">
      <h3>镜头时间轴</h3>
      <span class="value-pill">${ordered.length} 镜</span>
      <button type="button" class="btn btn-ghost" data-btn-id="BTN-C16-P012-01">刷新</button>
    </div>
    <div class="timeline-body">${body}</div>
  </section>`;
  if (container && typeof container === 'object') container.innerHTML = html;
  return html;
}
