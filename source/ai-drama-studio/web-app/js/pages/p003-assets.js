import { escapeHtml, renderEmptyState } from '../components/index.js';
import { createTask, runTask } from '../core/gen-task.js';
import { demoFor } from '../demo/demo-data.js';

const 类型顺序 = ['人物', '场景', '道具'];
// 类型筛选 / 关键词 / 编辑目标都是纯 UI 态，工程数据只写 assets
let 类型筛选 = '全部';
let 关键词 = '';
let 编辑资产ID = '';
let 提取中 = false;

export function render(container, ctx, extra = {}) {
  const p = ctx.getProject() || {};
  const btn = (id, spec) => ctx.registerButton(id, spec);
  const re = () => ctx.setView('p003');

  const 全部资产 = p.assets || [];
  const 命中 = 全部资产
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => 类型筛选 === '全部' || a.类型 === 类型筛选)
    .filter(({ a }) => !关键词 || `${a.名称}${a.来源文本片段 || ''}`.includes(关键词));

  const 关弹层 = () => {
    const el = typeof document !== 'undefined' ? document.getElementById('modalRoot') : null;
    if (el) el.innerHTML = '';
  };

  async function 提取资产() {
    if (提取中) return;
    提取中 = true;
    re(); // 先置进行中态，再进入模型调用
    const task = createTask(p, { 任务类型: '资产', 用途: '文本', 对象ID: 'assets' });
    await runTask(p, task.任务ID);
    // 结构化资产清单无法落入任务产物槽，按任务类型取对应产物后落库
    p.assets = demoFor('资产');
    ctx.commit(() => {});
    提取中 = false;
    re();
    ctx.showToast(`已提取 ${p.assets.length} 个资产，请逐个人物补锚点`, { level: 'ok' });
  }

  function 打开编辑(资产) {
    const host = typeof document !== 'undefined' ? document.getElementById('modalRoot') : null;
    if (!host) return;
    编辑资产ID = 资产.资产ID;
    host.innerHTML = `<div class="modal-mask"><div class="glass modal-card" role="dialog" aria-modal="true">
      <h2 class="modal-title">编辑资产 · ${escapeHtml(资产.名称)}</h2>
      <div class="form-grid">
        <div class="field"><label class="field-label" for="p003-name">名称</label>
          <div class="field-control"><input id="p003-name" class="field-input" data-asset-field="名称" value="${escapeHtml(资产.名称)}"></div></div>
        <div class="field"><label class="field-label" for="p003-look">外貌描述</label>
          <div class="field-control"><textarea id="p003-look" class="field-input" rows="2" data-asset-field="外貌描述">${escapeHtml(资产.外貌描述 || '')}</textarea></div></div>
        <div class="field"><label class="field-label" for="p003-cloth">服装描述</label>
          <div class="field-control"><textarea id="p003-cloth" class="field-input" rows="2" data-asset-field="服装描述">${escapeHtml(资产.服装描述 || '')}</textarea></div></div>
        <div class="field"><label class="field-label" for="p003-trait">特征描述</label>
          <div class="field-control"><textarea id="p003-trait" class="field-input" rows="2" data-asset-field="特征描述">${escapeHtml(资产.特征描述 || '')}</textarea></div></div>
        <div class="field"><label class="field-label" for="p003-note">备注</label>
          <div class="field-control"><textarea id="p003-note" class="field-input" rows="2" data-asset-field="备注">${escapeHtml(资产.备注 || '')}</textarea></div></div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-primary" data-btn-id="BTN-P003-60">保存</button>
        <button type="button" class="btn btn-ghost" data-btn-id="BTN-P003-61">取消</button>
      </div>
    </div></div>`;

    btn('BTN-P003-60', {
      类别: '①',
      handler: () => {
        const a = (p.assets || []).find(x => x.资产ID === 编辑资产ID);
        const card = host.querySelector('.modal-card');
        if (!a || !card) return;
        card.querySelectorAll('[data-asset-field]').forEach(el => {
          a[el.getAttribute('data-asset-field')] = el.value;
        });
        ctx.commit(() => {});
        关弹层();
        re();
        ctx.showToast('资产已保存', { level: 'ok' });
      },
      关联FID: 'F-003'
    });
    btn('BTN-P003-61', {
      类别: '①',
      handler: () => { 关弹层(); ctx.showToast('已取消，工程数据未改变', { level: 'info' }); },
      关联FID: 'F-003'
    });
  }

  const 卡片 = ({ a, i }) => {
    const 已锚定 = a.锁定状态 === '已锁定' && !!a.锚点标识;
    const 锚点chip = 已锚定
      ? `<span class="chip chip--lock status-tag tone-lock">已锚定${a.锚点标识 ? ' · ' + escapeHtml(a.锚点标识) : ''}</span>`
      : '<span class="chip chip--warn status-tag tone-degrade">未锚定</span>';
    const 图 = /^data:/.test(String(a.参考图引用 || ''))
      ? `<img class="asset-thumb" src="${escapeHtml(a.参考图引用)}" alt="${escapeHtml(a.名称)} 参考图" width="180" height="100">`
      : '<div class="muted">无参考图（占位）</div>';
    return `<article class="glass list-item">
      <div class="list-item__main">
        <div class="toolbar">
          <span class="chip chip--accent status-tag">${escapeHtml(a.类型)}</span>
          <strong class="ellipsis">${escapeHtml(a.名称)}</strong>
          ${锚点chip}
        </div>
        <div class="list-item__meta muted ellipsis">来源片段：${escapeHtml(a.来源文本片段 || '未标注')}</div>
        <div>${图}</div>
        <div class="section-actions">
          <button type="button" class="btn btn-ghost" data-btn-id="BTN-P003-${20 + i}">编辑</button>
          <button type="button" class="btn btn-ghost" data-btn-id="BTN-P003-${40 + i}">${a.锁定状态 === '已锁定' ? '解锁' : '锁定锚点'}</button>
        </div>
      </div>
    </article>`;
  };

  const 分组 = 类型顺序
    .map(类型 => ({ 类型, 项: 命中.filter(x => x.a.类型 === 类型) }))
    .filter(g => g.项.length);

  const 列表区 = 命中.length
    ? 分组.map(g => `<div class="section-head"><h3 class="section-title">${escapeHtml(g.类型)}（${g.项.length}）</h3></div>
        <div class="grid-3">${g.项.map(卡片).join('')}</div>`).join('')
    : (全部资产.length
      ? renderEmptyState({
        title: '没有匹配的资产',
        message: `当前筛选：类型 ${类型筛选}${关键词 ? ` · 关键词「${关键词}」` : ''}`,
        guideBtnId: 'BTN-P003-71',
        guideLabel: '清除筛选',
        onGuide: () => { 类型筛选 = '全部'; 关键词 = ''; re(); },
        关联FID: 'F-003'
      })
      : renderEmptyState({
        title: '还没有资产',
        message: '从场次正文里提取人物、场景、道具，人物资产随后可锁定锚点',
        missing: ['assets 为空：尚未执行提取'],
        guideBtnId: 'BTN-P003-70',
        guideLabel: '提取资产',
        onGuide: 提取资产,
        关联FID: 'F-003'
      }));

  container.innerHTML = `<div class="page" data-page="p003">
    <header class="page-head">
      <div class="page-head__main">
        <h1 class="page-title">分解提取资产</h1>
        <p class="page-desc">从场次正文提取人物 / 场景 / 道具，人物资产可锁定锚点保证跨镜一致</p>
      </div>
      <div class="page-head__actions">
        ${提取中 ? '<span class="chip chip--accent status-tag">提取中…</span>' : ''}
        <span class="chip chip--demo status-tag tone-demo">资产 ${全部资产.length}</span>
      </div>
    </header>

    <section class="section glass">
      <div class="section-head">
        <h2 class="section-title">提取与筛选</h2>
        <p class="section-sub">提取结果写入 assets；锚点状态由 p004 锁定后回写</p>
      </div>
      <div class="section-body">
        <div class="toolbar">
          <button type="button" class="btn btn-primary" data-btn-id="BTN-P003-01">提取资产</button>
          <div class="toolbar-group">
            ${['全部'].concat(类型顺序).map((t, i) => {
              const id = `BTN-P003-${10 + i}`;
              return `<button type="button" class="tab${类型筛选 === t ? ' is-active active' : ''}" data-btn-id="${id}">${escapeHtml(t)}</button>`;
            }).join('')}
          </div>
          <div class="toolbar-group">
            <input id="p003-search" class="field-input" data-role="search" placeholder="按名称 / 来源片段搜索" value="${escapeHtml(关键词)}">
            <button type="button" class="btn btn-ghost" data-btn-id="BTN-P003-02">搜索</button>
          </div>
        </div>
      </div>
    </section>

    <section class="section glass">
      <div class="section-head">
        <h2 class="section-title">资产清单</h2>
        <p class="section-sub">按类型分组，三列栅格展示</p>
      </div>
      <div class="section-body">${列表区}</div>
    </section>
  </div>`;

  btn('BTN-P003-01', { 类别: '①', handler: 提取资产, 关联FID: 'F-003' });
  ['全部'].concat(类型顺序).forEach((t, i) => {
    btn(`BTN-P003-${10 + i}`, {
      类别: '①',
      handler: () => { 类型筛选 = t; re(); },
      关联FID: 'F-003'
    });
  });
  btn('BTN-P003-02', {
    类别: '①',
    handler: () => {
      const el = container.querySelector('[data-role="search"]');
      关键词 = el ? el.value.trim() : '';
      re();
      ctx.showToast(关键词 ? `已按「${关键词}」筛选` : '已清空关键词', { level: 'info' });
    },
    关联FID: 'F-003'
  });

  // 资产卡的操作按资产在 assets 中的真实下标编号，筛选变化不会串号
  命中.forEach(({ a, i }) => {
    btn(`BTN-P003-${20 + i}`, { 类别: '①', handler: () => 打开编辑(a), 关联FID: 'F-003' });
    btn(`BTN-P003-${40 + i}`, {
      类别: '①',
      handler: () => {
        const 目标 = (p.assets || []).find(x => x.资产ID === a.资产ID);
        if (!目标) return;
        目标.锁定状态 = 目标.锁定状态 === '已锁定' ? '未锁定' : '已锁定';
        ctx.commit(() => {});
        re();
        ctx.showToast(目标.锁定状态 === '已锁定' ? `已锁定「${目标.名称}」锚点` : `已解锁「${目标.名称}」`, { level: 'ok' });
      },
      关联FID: 'F-004'
    });
  });
}
