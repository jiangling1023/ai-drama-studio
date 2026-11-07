import { escapeHtml } from './index.js';
import { registerButton } from '../core/ui-response.js';
import { renderDataTable } from './c01-data-table.js';
import { renderStatusTag } from './c03-status-tag.js';
import { renderEmptyState } from './c10-empty-state.js';
import { renderSourceBadge } from './c15-source-badge.js';
import { renderAlertBar } from './c13-alert-bar.js';

const STAGES = ['plan', 'execute', 'review'];

// C-14 导演三区容器：三段都在 DOM 内、只切 hidden，可重复进入互不清空；复用 C-01/C-03/C-10/C-13/C-15 不重造 UI
export function renderDirectorPanel(props = {}, opts = {}) {
  const active = STAGES.includes(props.activeStage) ? props.activeStage : 'plan';
  const tabs = STAGES.map((s, i) => {
    const id = (opts.tabPrefix || 'BTN-C14-P012') + '-0' + (i + 1);
    registerButton(id, { 类别: '①', handler: () => {
      STAGES.forEach(x => {
        const el = typeof document !== 'undefined' ? document.getElementById('c14-zone-' + x) : null;
        if (el) el.hidden = x !== s;
      });
      if (typeof props.onSwitch === 'function') props.onSwitch(s);
    }, 关联FID: 'F-012' });
    return `<button type="button" class="tab${active === s ? ' active' : ''}" data-btn-id="${escapeHtml(id)}">${escapeHtml({ plan: 'Plan', execute: 'Execute', review: 'Review' }[s])}</button>`;
  }).join('');

  const plan = props.plan || {};
  const planRows = ['建议集数', '每集场次数', '角色表', '视觉基调', '表演密度目标', '旁白占比上限', '台词覆盖率下限']
    .map(k => ({ 字段: k, 值: Array.isArray(plan[k]) ? plan[k].join(' / ') : (plan[k] ?? '—') }));
  const planZone = planRows.length && plan['规划书ID']
    ? renderDataTable([{ key: '字段', label: '规划书 7 字段' }, { key: '值', label: '值' }], planRows,
        { countBtnId: 'BTN-C14-PLAN-COUNT', raw: true })
    : renderEmptyState({ title: '尚无导演规划书', message: '请先在「规划 Plan」区输入一句话创意与集数/时长目标',
        guideBtnId: 'BTN-C14-PLAN-GUIDE', guideLabel: '生成规划书', onGuide: props.onSwitch && (() => props.onSwitch('plan')),
        missing: ['规划书'], 关联FID: 'F-012' });

  const tasks = Array.isArray(props.tasks) ? props.tasks : [];
  const jumpActions = tasks.map((t, i) => ({
    id: (opts.jumpPrefix || 'BTN-P012-16') + '-' + (i + 1), label: '一键跳转',
    handler: () => props.onJump && props.onJump(t),
    toast: '无法跳转：目标模块不可达 / 建议参数为空（列出具体原因）', 关联FID: 'F-012'
  }));
  const taskRows = tasks.map(t => ({
    目标模块ID: t['目标模块ID'] || '—', 建议参数: typeof t['建议参数'] === 'object' ? JSON.stringify(t['建议参数'] || {}) : (t['建议参数'] ?? '—'),
    前置条件: Array.isArray(t['前置条件']) ? t['前置条件'].join('、') || '—' : (t['前置条件'] || '—'),
    状态: t['状态'] || '未开始', 状态判定依据: t['状态判定依据'] || '—', 受阻原因: t['受阻原因'] || '—'
  }));
  const taskZone = tasks.length
    ? renderDataTable(['目标模块ID', '建议参数', '前置条件', '状态', '状态判定依据', '受阻原因'], taskRows,
        { countBtnId: 'BTN-C14-TASK-COUNT', rowActions: jumpActions, raw: true })
    : renderEmptyState({ title: '尚无执行清单', message: '尚无导演规划书，请先点击「生成规划书」',
        guideBtnId: 'BTN-C14-TASK-GUIDE', guideLabel: '生成规划书', missing: ['DirectorTask'], 关联FID: 'F-012' });

  const review = props.review || {};
  const checks = Array.isArray(review['检查项结果']) ? review['检查项结果'] : [];
  const writeBackId = opts.writeBackBtnId || 'BTN-C04-P012-05a';
  registerButton(writeBackId, { 类别: '①', handler: () => props.onWriteBack && props.onWriteBack(review),
    禁用原因: '无可回写的建议字段与待办项', toast: '已取消回写，工程数据零变更', 关联FID: 'F-012' });
  const reviewZone = checks.length
    ? renderDataTable(['检查项', '实测值', '阈值', '结论'], checks, { countBtnId: 'BTN-C14-REVIEW-COUNT', raw: true })
      + `<div class="review-head">总判定：${renderStatusTag(review['总判定'] || '—')}　是否过期：${renderStatusTag(review['是否过期'] ? '已过期' : '否')}</div>
         <button type="button" class="btn btn-danger" data-btn-id="${escapeHtml(writeBackId)}">一键回写修正</button>`
    : renderEmptyState({ title: '无可复核对象', message: '无可复核对象：缺少剧本 / 场次 / 分镜脚本 / 分镜成品',
        guideBtnId: 'BTN-C14-REVIEW-GUIDE', guideLabel: '生成复核报告',
        missing: ['剧本', '场次', '分镜脚本', '分镜成品'], 关联FID: 'F-012' });

  const mark = props.sourceMark === '演示数据' ? '演示数据' : '真实模型';
  const html = `<div class="glass director-panel glow-g1" data-component="c14">
    <div class="director-tabs" role="tablist">${tabs}</div>
    <div class="director-mark">数据来源标记：${renderStatusTag(mark)}${mark === '演示数据' ? '<span class="demo-badge" data-component="demo">来源：演示数据</span>' : ''}</div>
    <div id="c14-zone-plan" ${active === 'plan' ? '' : 'hidden'}>${planZone}</div>
    <div id="c14-zone-execute" ${active === 'execute' ? '' : 'hidden'}>${taskZone}</div>
    <div id="c14-zone-review" ${active === 'review' ? '' : 'hidden'}>${reviewZone}</div>
    ${renderSourceBadge({ sourceType: '统一适配层', purpose: '文本', modelId: '', degradeReason: mark === '演示数据' ? '强制演示数据' : '', dataMark: mark, onOpenChain: opts.onOpenChain, compact: true }, { btnId: 'BTN-C15-P012-CHAIN' })}
    ${renderAlertBar('复核不通过仅提供结论与建议，不阻断 F-001~F-011 任何操作与导出', { tone: 'degrade' })}
  </div>`;
  if (opts.container && typeof opts.container === 'object') opts.container.innerHTML = html;
  return html;
}
