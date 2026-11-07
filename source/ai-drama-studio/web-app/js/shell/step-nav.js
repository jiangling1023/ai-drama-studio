import { escapeHtml } from '../components/index.js';
import { stepStatus } from '../core/derive.js';
import { STEP_DOT } from '../constants.js';

// 12 步主链路顺序冻结：编号 1→12 不可改序，跨切入口不占新步骤号
const STEPS = [
  { step: 1, pageId: 'p001', funcId: 'F-001', name: '一句话生成剧本/导入剧本' },
  { step: 2, pageId: 'p002', funcId: 'F-002', name: '拆分剧本' },
  { step: 3, pageId: 'p003', funcId: 'F-003', name: '分解提取资产' },
  { step: 4, pageId: 'p004', funcId: 'F-004', name: '人物锚点锁定' },
  { step: 5, pageId: 'p005', funcId: 'F-005', name: '分镜脚本' },
  { step: 6, pageId: 'p006', funcId: 'F-006', name: '图片生成' },
  { step: 7, pageId: 'p007', funcId: 'F-007', name: '关键帧生成' },
  { step: 8, pageId: 'p008', funcId: 'F-008', name: '提示词' },
  { step: 9, pageId: 'p009', funcId: 'F-009', name: '画布生成' },
  { step: 10, pageId: 'p010', funcId: 'F-010', name: '分镜生成' },
  { step: 11, pageId: 'p011', funcId: 'F-011', name: '视频整合' },
  { step: 12, pageId: 'p012', funcId: 'F-012', name: '导演复核' },
];

const CROSS = [
  { pageId: 'p012', btnId: 'BTN-NAV-CROSS-01', name: 'AI 短剧导演（规划/执行/复核/提示词架构）' },
  { pageId: 'p013', btnId: 'BTN-NAV-CROSS-02', name: '短剧规则库' },
];

const DOT = {
  [STEP_DOT.已完成]: 'ok',
  [STEP_DOT.进行中]: 'doing',
  [STEP_DOT.可跳过]: 'skip',
  [STEP_DOT.未开始]: '',
};

export function renderStepNav(container, ctx) {
  const slot = container || (typeof document !== 'undefined' ? document.getElementById('ws-stepnav') : null);
  if (!slot || !ctx) return;

  const project = (typeof ctx.getProject === 'function' && ctx.getProject()) || {};
  const active = (typeof ctx.parseHash === 'function' ? ctx.parseHash() : { view: 'p001' }).view;

  // hash 是视图唯一真源：先改 hash 由 hashchange 统一 setView，再重渲染导航更新当前步高亮
  const go = (pageId) => {
    if (typeof location !== 'undefined' && location.hash !== '#/' + pageId) location.hash = '#/' + pageId;
    else if (typeof ctx.setView === 'function') ctx.setView(pageId);
    renderStepNav(slot, ctx);
  };

  const items = STEPS.map(s => {
    const id = 'BTN-NAV-' + String(s.step).padStart(2, '0');
    const status = stepStatus(project, s.step);
    ctx.registerButton(id, { 类别: '①', 关联FID: s.funcId, handler: () => go(s.pageId) });
    return `<button class="sn-item${active === s.pageId ? ' is-active' : ''}" type="button" data-btn-id="${id}" title="${escapeHtml(s.name)}（${s.funcId}）">
      <span class="sn-num">${s.step}</span><span class="sn-name">${escapeHtml(s.name)}</span>
      <span class="sn-dot ${DOT[status] || ''}" role="img" aria-label="${escapeHtml(status)}"></span>
    </button>`;
  }).join('');

  const crosses = CROSS.map(c => {
    ctx.registerButton(c.btnId, { 类别: '①', handler: () => go(c.pageId) });
    return `<button class="sn-item${active === c.pageId ? ' is-active' : ''}" type="button" data-btn-id="${c.btnId}">${escapeHtml(c.name)}</button>`;
  }).join('');

  slot.innerHTML = `<nav class="glass sn" data-component="step-nav" aria-label="主链路步骤">
    ${items}
    <div class="sn-cross" aria-label="横切入口">${crosses}</div>
  </nav>`;
}
