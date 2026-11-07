import { escapeHtml, renderEmptyState } from '../components/index.js';
import {
  RULES_SOURCE, countByStage, getCompositions, getRules, getTemplates,
  queryRules, recommendCompositions, toggleFix, unfixRule
} from '../core/rules-library.js';

const 五阶段 = ['剧本', '分镜', '画面资产', '视频', '审阅'];
const 适用模块页 = {
  'F-001': 'p001', 'F-002': 'p002', 'F-003': 'p003', 'F-004': 'p004',
  'F-005': 'p005', 'F-006': 'p006', 'F-007': 'p007', 'F-008': 'p008',
  'F-009': 'p009', 'F-010': 'p010', 'F-011': 'p011', 'F-012': 'p012'
};

// 筛选项 / 展开项 / 右侧页签均为纯 UI 态，工程数据只写 rulesLibrary.固定引用
let 阶段 = '全部';
let 类型 = '全部';
let 关键词 = '';
let 右侧 = '模板库';
let 构图组 = '基础通用①';
let 推荐命中 = null;
const 展开集 = new Set();

export function render(container, ctx, extra = {}) {
  const p = ctx.getProject() || {};
  const btn = (id, spec) => ctx.registerButton(id, spec);
  const re = () => ctx.setView('p013');

  const 全量 = getRules(p);
  const 阶段计数 = countByStage(p);
  const 类型们 = [...new Set(全量.map(r => r.类型))];
  const 规则 = queryRules(p, { 阶段: 阶段 === '全部' ? '' : 阶段, 类型: 类型 === '全部' ? '' : 类型, 关键词 });
  const 模板 = getTemplates(p);
  const 构图 = getCompositions(p);
  const 场景文本 = (p.scenes || []).map(s => s.正文 || '').join(' ') || String(p.剧本原文 || '');
  const 推荐列表 = recommendCompositions(p, 场景文本, '', 3);

  const 规则卡 = 规则.map(r => {
    const i = 全量.findIndex(x => x.规则ID === r.规则ID);
    const 已固定 = r.是否固定到项目;
    const 展开 = 展开集.has(r.规则ID);
    const 检索文本 = `${r.标题} ${r.摘要 || ''} ${r.正文 || ''} ${(r.标签 || []).join(' ')}`;
    return `<article class="glass list-item" data-rule="${escapeHtml(r.规则ID)}" data-search="${escapeHtml(检索文本)}">
      <div class="list-item__main">
        <div class="toolbar">
          <span class="chip chip--accent status-tag">${escapeHtml(r.阶段)}</span>
          <span class="chip chip--demo status-tag tone-demo">${escapeHtml(r.类型)}</span>
          <strong class="ellipsis">${escapeHtml(r.标题)}</strong>
          ${已固定 ? '<span class="chip chip--lock status-tag tone-lock">已固定</span>' : ''}
        </div>
        <div class="list-item__meta muted">${escapeHtml(r.摘要 || '')}</div>
        <div class="toolbar">${(r.标签 || []).map(t => `<span class="chip status-tag">${escapeHtml(t)}</span>`).join('')}</div>
        ${展开 ? `<pre class="mono">${escapeHtml(r.正文 || '')}</pre>` : ''}
        <div class="section-actions">
          <button type="button" class="btn ${已固定 ? 'btn-ghost' : 'btn-primary'}" data-btn-id="BTN-P013-${10 + i}">${已固定 ? '已固定' : '固定到项目'}</button>
          <button type="button" class="btn btn-ghost" data-btn-id="BTN-P013-${40 + i}">${展开 ? '收起正文' : '展开正文'}</button>
        </div>
      </div>
    </article>`;
  });

  const 规则空态 = renderEmptyState({
    title: 关键词 ? '没有匹配的规则' : '当前筛选下没有规则',
    message: `当前筛选：阶段 ${阶段} · 类型 ${类型}${关键词 ? ` · 关键词「${关键词}」` : ''}`,
    missing: ['关键词同时匹配标题 / 摘要 / 正文 / 标签'],
    guideBtnId: 'BTN-P013-07',
    guideLabel: '清除筛选',
    onGuide: () => { 阶段 = '全部'; 类型 = '全部'; 关键词 = ''; re(); },
    关联FID: 'F-013'
  });

  const 规则区 = 规则卡.length
    ? `<div class="list">${规则卡.join('')}</div><div id="p013-empty" hidden>${规则空态}</div>`
    : 规则空态;

  const 模板卡 = 模板.map((t, i) => `<article class="glass list-item">
    <div class="list-item__main">
      <div class="toolbar">
        <strong class="ellipsis">${escapeHtml(t.名称)}</strong>
        <span class="chip chip--accent status-tag">适用 ${escapeHtml(t.适用模块)}</span>
      </div>
      <div class="list-item__meta muted ellipsis">占位符：${escapeHtml((t.占位符 || []).join(' '))}</div>
      <div class="section-actions">
        <button type="button" class="btn btn-primary" data-btn-id="BTN-P013-${60 + i}">套用</button>
      </div>
    </div>
  </article>`).join('');

  const 构图卡 = 构图.filter(c => c.组别 === 构图组).map(c => {
    const i = 构图.findIndex(x => x.预设ID === c.预设ID);
    const 命中 = 推荐命中 && 推荐命中.预设ID === c.预设ID;
    return `<article class="glass list-item">
      <div class="list-item__main">
        <div class="toolbar">
          <strong class="ellipsis">${escapeHtml(c.名称)}</strong>
          ${命中 ? `<span class="chip chip--ok status-tag tone-ok">命中 ${推荐命中.命中数}</span>` : ''}
        </div>
        <div class="list-item__meta muted">${escapeHtml(c.画面作用)}</div>
        <div class="list-item__meta muted">适用场景：${escapeHtml(c.适用场景)}</div>
        <div class="section-actions">
          <button type="button" class="btn btn-ghost" data-btn-id="BTN-P013-${80 + i}">推荐</button>
        </div>
      </div>
    </article>`;
  }).join('');

  const 右侧内容 = 右侧 === '模板库'
    ? `<div class="list">${模板卡 || '<p class="muted">暂无模板</p>'}</div>`
    : `<div class="toolbar">
        ${['基础通用①', '基础通用②', '电影氛围'].map((g, i) => `<button type="button" class="tab${构图组 === g ? ' is-active active' : ''}" data-btn-id="BTN-P013-0${4 + i}">${escapeHtml(g)}</button>`).join('')}
      </div>
      <p class="muted">本工程推荐：${推荐列表.map(c => `${escapeHtml(c.名称)}（${escapeHtml(c.推荐理由)}）`).join(' / ') || '暂无场次文本，按默认顺序给出'}</p>
      <div class="list">${构图卡 || '<p class="muted">暂无构图预设</p>'}</div>`;

  container.innerHTML = `<div class="page" data-page="p013">
    <header class="page-head">
      <div class="page-head__main">
        <h1 class="page-title">短剧规则库</h1>
        <p class="page-desc">18 条内置规则 + 5 个模板 + 24 个构图预设，边做边查</p>
      </div>
      <div class="page-head__actions">
        <span class="chip chip--demo status-tag tone-demo">来源 ${escapeHtml(RULES_SOURCE)}</span>
      </div>
    </header>

    <div class="alert-bar">规则来源为「内置知识库」，只读不可修改，仅可固定引用；固定后随工程一起导出，不改变规则原文。</div>

    <div class="grid-3">
      <section class="section glass">
        <div class="section-head">
          <h2 class="section-title">阶段筛选</h2>
          <p class="section-sub">计数为工程内规则实际条数</p>
        </div>
        <div class="section-body">
          <div class="list">
            ${['全部'].concat(五阶段).map((s, i) => `<div class="glass list-item${阶段 === s ? ' is-active' : ''}" role="button" tabindex="0" data-btn-id="BTN-P013-${28 + i}">
              <div class="list-item__main">
                <div class="ellipsis">${escapeHtml(s)}</div>
                <div class="list-item__meta muted">${s === '全部' ? 全量.length : (阶段计数[s] || 0)} 条</div>
              </div>
            </div>`).join('')}
          </div>
          <div class="toolbar">
            ${['全部'].concat(类型们).map((t, i) => `<button type="button" class="tab${类型 === t ? ' is-active active' : ''}" data-btn-id="BTN-P013-${34 + i}">${escapeHtml(t)}</button>`).join('')}
          </div>
        </div>
      </section>

      <section class="section glass">
        <div class="section-head">
          <h2 class="section-title">规则列表</h2>
          <p class="section-sub">共 ${规则.length} 条匹配</p>
        </div>
        <div class="section-body">
          <div class="toolbar">
            <input id="p013-q" class="field-input" data-role="q" placeholder="搜索标题 / 摘要 / 正文 / 标签" value="${escapeHtml(关键词)}">
            <button type="button" class="btn btn-ghost" data-btn-id="BTN-P013-01">搜索</button>
          </div>
          ${规则区}
        </div>
      </section>

      <section class="section glass">
        <div class="section-head">
          <h2 class="section-title">模板库 + 构图库</h2>
          <p class="section-sub">模板可直接套用到对应模块</p>
        </div>
        <div class="section-body">
          <div class="toolbar">
            <button type="button" class="tab${右侧 === '模板库' ? ' is-active active' : ''}" data-btn-id="BTN-P013-02">模板库</button>
            <button type="button" class="tab${右侧 === '构图库' ? ' is-active active' : ''}" data-btn-id="BTN-P013-03">构图库</button>
          </div>
          ${右侧内容}
        </div>
      </section>
    </div>
  </div>`;

  ['全部'].concat(五阶段).forEach((s, i) => {
    btn(`BTN-P013-${28 + i}`, { 类别: '①', handler: () => { 阶段 = s; re(); }, 关联FID: 'F-013' });
  });
  ['全部'].concat(类型们).forEach((t, i) => {
    btn(`BTN-P013-${34 + i}`, { 类别: '①', handler: () => { 类型 = t; re(); }, 关联FID: 'F-013' });
  });
  btn('BTN-P013-01', {
    类别: '①',
    handler: () => {
      const el = container.querySelector('[data-role="q"]');
      关键词 = el ? el.value.trim() : '';
      re();
      ctx.showToast(关键词 ? `已按「${关键词}」筛选规则` : '已清空关键词', { level: 'info' });
    },
    关联FID: 'F-013'
  });
  btn('BTN-P013-02', { 类别: '①', handler: () => { 右侧 = '模板库'; re(); }, 关联FID: 'F-013' });
  btn('BTN-P013-03', { 类别: '①', handler: () => { 右侧 = '构图库'; re(); }, 关联FID: 'F-013' });
  ['基础通用①', '基础通用②', '电影氛围'].forEach((g, i) => {
    btn(`BTN-P013-0${4 + i}`, { 类别: '①', handler: () => { 构图组 = g; 推荐命中 = null; re(); }, 关联FID: 'F-013' });
  });

  规则.forEach(r => {
    const i = 全量.findIndex(x => x.规则ID === r.规则ID);
    btn(`BTN-P013-${10 + i}`, {
      类别: '①',
      handler: () => {
        const 结果 = r.是否固定到项目 ? unfixRule(p, r.规则ID) : toggleFix(p, r.规则ID);
        ctx.commit(() => {});
        re();
        ctx.showToast(结果.ok
          ? (r.是否固定到项目 ? `已取消固定：${r.标题}` : `已固定到项目：${r.标题}`)
          : `操作未生效：${结果.reason}`, { level: 结果.ok ? 'ok' : 'warn' });
      },
      关联FID: 'F-013'
    });
    btn(`BTN-P013-${40 + i}`, {
      类别: '①',
      handler: () => {
        if (展开集.has(r.规则ID)) 展开集.delete(r.规则ID); else 展开集.add(r.规则ID);
        re();
      },
      关联FID: 'F-013'
    });
  });

  模板.forEach((t, i) => {
    btn(`BTN-P013-${60 + i}`, {
      类别: '①',
      handler: () => {
        const 页 = 适用模块页[t.适用模块];
        ctx.showToast(`模板已套用：${t.名称}`, { level: 'ok' });
        if (页) ctx.setView(页);
      },
      关联FID: 'F-013'
    });
  });

  构图.forEach((c, i) => {
    btn(`BTN-P013-${80 + i}`, {
      类别: '①',
      handler: () => {
        const 命中 = recommendCompositions(p, 场景文本, '', 构图.length).find(x => x.预设ID === c.预设ID);
        推荐命中 = { 预设ID: c.预设ID, 命中数: 命中 ? 命中.命中数 : 0 };
        re();
        ctx.showToast(`${c.名称}：${命中 ? 命中.推荐理由 : '暂无匹配场景'}`, { level: 'info' });
      },
      关联FID: 'F-013'
    });
  });

  // 输入即筛：只切卡片可见性，不重渲染，避免每敲一个字就丢焦点
  const 搜索域 = container.querySelector('[data-role="q"]');
  const 空块 = container.querySelector('#p013-empty');
  if (搜索域 && 空块) {
    搜索域.addEventListener('input', () => {
      const q = 搜索域.value.trim();
      let 可见 = 0;
      container.querySelectorAll('[data-rule]').forEach(el => {
        const 命中 = !q || String(el.getAttribute('data-search') || '').includes(q);
        el.hidden = !命中;
        if (命中) 可见 += 1;
      });
      空块.hidden = 可见 > 0;
    });
  }
}
