import { escapeHtml } from './index.js';
import { registerButton } from '../core/ui-response.js';

// 22 个简单维度：字段名逐字照抄 V3 §4；必填维度常驻为「字段名：值」胶囊，不隐藏/不折叠（V-02）
const SIMPLE_DIMS = [
  ['镜头序号', s => s.镜头序号],
  ['时间码', s => s.时间码],
  ['时长', s => s.时长],
  ['主体身份', s => Array.isArray(s.主体身份) ? s.主体身份.join('、') : (s.主体身份 || '—')],
  ['外观锚点', s => s.外观锚点 ? `锚点标识:${s.外观锚点.锚点标识 || ''} / 参考标识:${s.外观锚点.参考标识 || ''}` : ''],
  ['动作轨迹', s => s.动作轨迹],
  ['表情变化', s => s.表情变化],
  ['场景空间', s => s.场景空间 ? `前景:${s.场景空间.前景 || ''} / 后景:${s.场景空间.后景 || ''} / 关系:${s.场景空间.关系 || ''}` : ''],
  ['景别', s => s.景别],
  ['机位', s => s.机位],
  ['焦段', s => s.焦段],
  ['构图', s => s.构图],
  ['景深', s => s.景深],
  ['运镜方式', s => s.运镜方式],
  ['运动速度', s => s.运动速度],
  ['光线方向', s => s.光线方向],
  ['综合色温', s => s.综合色温],
  ['材质', s => s.材质],
  ['节奏', s => s.节奏],
  ['转场', s => s.转场],
  ['特效', s => s.特效],
  ['环境声音', s => s.环境声音]
];

// 衔接标注五段式（§5）：可折叠子区
const JIANJIE_SEGS = ['起始画面', '人物动作', '摄影运动', '结束画面', '镜头衔接'];

// C-17 镜头卡片：23 维度常驻 + 衔接标注可折叠；一致性命中加 .consistency-hit 描边高亮
export function renderShotCard(shot = {}, opts = {}) {
  const s = shot || {};
  const expanded = !!opts.expanded;
  const id = s.条目ID != null ? String(s.条目ID) : String(s.镜头序号);
  const hits = Array.isArray(opts.consistencyHits) ? opts.consistencyHits : [];

  // 契约未列 onExpand/onSelect：卡片展开/选中需回调父级（C-16）重渲染，故追加
  registerButton(`BTN-C17-P012-01-${id}`, { 类别: '①', handler: () => opts.onExpand && opts.onExpand(id), toast: '镜头卡片已展开', 关联FID: 'CR-05' });
  registerButton(`BTN-C17-P012-02-${id}`, { 类别: '①', handler: () => opts.onExpand && opts.onExpand(id), toast: '镜头卡片已收起', 关联FID: 'CR-05' });
  registerButton(`BTN-C17-P012-03-${id}`, { 类别: '①', handler: () => opts.onEdit && opts.onEdit(id), toast: '镜头卡片已保存', 关联FID: 'CR-05' });

  const dims = SIMPLE_DIMS.map(([name, get]) => {
    const v = get(s);
    const val = (v == null || v === '') ? '—' : String(v);
    return `<span class="value-pill"><span class="k">${escapeHtml(name)}</span>：<span class="v">${escapeHtml(val)}</span></span>`;
  }).join('');

  const jj = s.衔接标注 || {};
  const jianjie = JIANJIE_SEGS.map(seg => {
    const v = jj[seg] == null || jj[seg] === '' ? '—' : String(jj[seg]);
    return `<div class="shot-jianjie-seg"><span class="k">${escapeHtml(seg)}</span>：<span class="v">${escapeHtml(v)}</span></div>`;
  }).join('');

  // 主体身份已脱敏：仅显示占位（角色A/角色B），不呈现真实姓名/品牌/台词
  const hitTags = hits.length
    ? `<div class="consistency-hits">一致性命中：${hits.map(h => `<span class="consistency-tag">${escapeHtml(h)}</span>`).join(' ')}</div>` : '';

  const html = `<article class="shot-card${hits.length ? ' consistency-hit' : ''}" data-component="c17" data-shot-id="${escapeHtml(id)}">
    ${hitTags}
    <div class="shot-dim">${dims}</div>
    <div class="shot-jianjie">
      <div class="shot-jianjie-head source-line">
        <span class="k">衔接标注（五段式）</span>
        <button type="button" class="btn btn-ghost" data-btn-id="${expanded ? `BTN-C17-P012-02-${escapeHtml(id)}` : `BTN-C17-P012-01-${escapeHtml(id)}`}">${expanded ? '收起' : '展开'}</button>
      </div>
      <div class="shot-jianjie-body" ${expanded ? '' : 'hidden'}>${jianjie}</div>
    </div>
    <div class="form-actions">
      <button type="button" class="btn" data-btn-id="BTN-C17-P012-03-${escapeHtml(id)}">${opts.editable === false ? '查看' : '编辑'}</button>
    </div>
  </article>`;
  return html;
}
