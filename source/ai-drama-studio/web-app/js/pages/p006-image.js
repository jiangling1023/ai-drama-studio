import { escapeHtml, openPromptSnapshotViewer, renderEmptyState, renderSourceBadge, renderStatusTag } from '../components/index.js';
import { createTask, isRunning, retryTask, runTask } from '../core/gen-task.js';
import { demoImage } from '../demo/demo-image.js';
import { V1_TEXT } from '../constants.js';

// 仅看未生成是纯 UI 态；进行中按资产ID 记在本地，跨重渲染保留卡片进度态（任务状态仍只落 genTasks 一处）
let 仅看未生成 = false;
const 进行中 = new Set();

const 色调 = { 'chip--ok': 'tone-ok', 'chip--warn': 'tone-degrade', 'chip--fail': 'tone-fail', 'chip--lock': 'tone-lock', 'chip--demo': 'tone-demo', 'chip--accent': '' };
const 标 = (kind, text) => `<span class="chip ${kind} status-tag ${色调[kind] || ''}">${escapeHtml(text)}</span>`;
const 关弹层 = () => {
  const el = typeof document !== 'undefined' ? document.getElementById('modalRoot') : null;
  if (el) el.innerHTML = '';
};

export function render(container, ctx, extra = {}) {
  const p = ctx.getProject() || {};
  const btn = (id, spec) => ctx.registerButton(id, spec);
  const re = () => ctx.setView('p006');

  const 全部资产 = p.assets || [];
  const 图片任务 = id => (p.genTasks || []).filter(t => t.类型 === '图片' && t.输入快照?.对象ID === id).slice(-1)[0] || null;
  const 忙 = id => 进行中.has(id) || isRunning(p, id);
  const 资产名 = id => (全部资产.find(a => a.资产ID === id) || {}).名称 || id;
  const 有图 = a => /^data:/.test(String(a.参考图引用 || ''));
  // 人物资产没有锁定锚点时一致性无法保证：按钮转②并复述具体原因，但仍允许用户自行决定
  const 缺锚 = a => a.类型 === '人物' && !(a.锁定状态 === '已锁定' && a.锚点标识);
  const 状态文本 = a => {
    if (忙(a.资产ID)) return '进行中';
    if (!有图(a)) return '未开始';
    const t = 图片任务(a.资产ID);
    return t ? t.状态 : '成功';
  };
  const 状态标签 = 状态 => renderStatusTag(状态, /降级/.test(状态) ? { tone: 'degrade' } : {});

  // C-12 只认扁平五键：把 GenTask 的三区快照摊平后传入，不另存第二份快照
  const 摊平快照 = task => {
    const 快 = task.最终提示词快照 || {};
    const 正 = 快.正向 || {};
    const 负 = 快.负面 || {};
    return {
      全局正向词: [正.全局正向词, 正.单条正向词].filter(Boolean).join(' '),
      最终负面词: [...(负.全局锁定负面词 || []), ...(负.单条负面词 || [])],
      锚点携带: (正.角色锚点 || []).map(x => `${x.锚点标识}（${资产名(x.资产ID)}）`).join('、') || '无',
      被锚点覆盖: (正.被锚点覆盖 || []).join('、') || '无',
      来源标记: task.来源模型标识 || ''
    };
  };

  async function 跑图(a, 重试 = false, 静默 = false) {
    if (忙(a.资产ID)) return;
    const 旧任务 = 图片任务(a.资产ID);
    if (重试 && !旧任务) return;
    进行中.add(a.资产ID);
    re(); // 先置进度态，再进入模型调用
    const task = 重试 ? 旧任务 : createTask(p, { 类型: '图片', 用途: '媒体', 对象ID: a.资产ID, 关联资产ID列表: [a.资产ID] });
    await (重试 ? retryTask(p, task.任务ID) : runTask(p, task.任务ID));
    // 演示降级统一用固定演示图（同资产永远同图）；真实模型产物才写任务输出，非图片产物回落到演示图
    const 产物 = String(task.输出引用 || '');
    a.参考图引用 = task.来源模型标识 === '演示数据'
      ? demoImage(a.资产ID, a.名称)
      : (/^data:image/.test(产物) ? 产物 : demoImage(a.资产ID, a.名称));
    进行中.delete(a.资产ID);
    ctx.commit(() => {});
    re();
    if (!静默) ctx.showToast(重试 ? `已重试「${a.名称}」` : `已生成「${a.名称}」的形象图`, { level: 'ok' });
  }

  async function 批量生成() {
    const 目标 = 全部资产.filter(a => !忙(a.资产ID));
    for (const a of 目标) await 跑图(a, false, true);
    ctx.showToast(目标.length ? `已生成 ${目标.length} 个资产形象图` : '全部资产都在生成中，请稍候', { level: 目标.length ? 'ok' : 'info' });
  }

  function 看快照(a) {
    const task = 图片任务(a.资产ID) || (p.genTasks || []).filter(t => t.类型 === '图片').slice(-1)[0];
    if (!task) return;
    openPromptSnapshotViewer(摊平快照(task), { closeBtnId: 'BTN-P006-92', copyBtnId: 'BTN-P006-93' });
    // C-12 关闭按钮默认落④不会执行 handler，改登记为①才能真关掉浮层
    btn('BTN-P006-92', { 类别: '①', handler: 关弹层, 关联FID: 'F-006' });
  }

  const 展示 = 仅看未生成 ? 全部资产.map((a, i) => ({ a, i })).filter(({ a }) => !有图(a)) : 全部资产.map((a, i) => ({ a, i }));
  const 已生成数 = 全部资产.filter(有图).length;

  const 图区 = a => (有图(a)
    ? `<img src="${escapeHtml(a.参考图引用)}" alt="${escapeHtml(a.名称)} 形象图" style="display:block;width:100%;height:100%;object-fit:cover">`
    : '<div class="muted" style="display:grid;place-items:center;height:100%;border:1px dashed var(--hairline);border-radius:10px;font-size:12px">尚未生成</div>');

  const 卡片 = ({ a, i }) => {
    const task = 图片任务(a.资产ID);
    const 演示 = task ? task.来源模型标识 === '演示数据' : a.数据来源标记 === '演示数据';
    const 锚标 = a.类型 === '人物'
      ? (缺锚(a) ? 标('chip--warn', '锚点未锁定') : 标('chip--lock', '锚点已锁定'))
      : 标('chip--accent', '无需锚点');
    return `<article class="glass shot-card" style="position:relative">
      ${演示 ? '<span class="demo-badge" style="position:absolute;top:8px;right:8px">演示数据</span>' : ''}
      <div style="position:relative;aspect-ratio:16/9;border-radius:10px;overflow:hidden;border:1px solid var(--hairline-soft);background:rgba(10,12,18,.55)">${图区(a)}</div>
      <div class="toolbar">
        <strong class="ellipsis">${escapeHtml(a.名称)}</strong>
        ${标('chip--accent', a.类型)}
        ${锚标}
        ${状态标签(状态文本(a))}
      </div>
      ${忙(a.资产ID) ? `<div class="progress"><span class="progress__bar" style="width:45%;animation:sa-move 1.2s var(--ease-inout) infinite"></span></div><p class="muted">生成中…</p>` : ''}
      ${a.锚点标识 && !缺锚(a) ? `<p class="list-item__meta mono muted ellipsis">${escapeHtml(a.锚点标识)}</p>` : ''}
      ${task && task.错误信息 ? `<p class="list-item__meta muted ellipsis">${escapeHtml(task.错误信息)}</p>` : ''}
      <div class="section-actions toolbar">
        <button type="button" class="btn btn-primary" data-btn-id="BTN-P006-${10 + i}">生成</button>
        ${task && /失败|已降级/.test(task.状态) ? `<button type="button" class="btn btn-ghost" data-btn-id="BTN-P006-${40 + i}">重试</button>` : ''}
        <button type="button" class="btn btn-ghost" data-btn-id="BTN-P006-${70 + i}">查看快照</button>
      </div>
    </article>`;
  };

  const 列表区 = !全部资产.length
    ? renderEmptyState({
      title: '还没有资产',
      message: '先到「分解提取资产」提取人物 / 场景 / 道具，再逐条生成统一风格的形象图',
      missing: ['assets 为空：F-003 未执行'],
      guideBtnId: 'BTN-P006-06',
      guideLabel: '去提取资产',
      onGuide: () => ctx.setView('p003'),
      关联FID: 'F-006'
    })
    : (展示.length
      ? `<div class="grid-3">${展示.map(卡片).join('')}</div>`
      : '<p class="muted">全部资产均已生成形象图，点击「查看全部资产」可回到完整清单。</p>');

  const 末任务 = (p.genTasks || []).filter(t => t.类型 === '图片').slice(-1)[0];
  const 降级原因 = String(末任务?.错误信息 || '').match(/降级原因：(\S+)/);
  const 来源条 = renderSourceBadge({
    sourceType: 末任务?.来源模型标识 || (p.是否强制演示数据 ? '演示数据' : '未配置'),
    purpose: '媒体 · 图片生成',
    modelId: ((p.modelConfigs || []).find(c => c.用途 === '媒体') || {})['模型名称/ID'] || '未配置',
    degradeReason: 降级原因 ? 降级原因[1] : '',
    dataMark: 末任务 ? 末任务.来源模型标识 : '演示数据',
    compact: true
  }, { btnId: 'BTN-P006-03' });

  container.innerHTML = `<div class="page" data-page="p006">
    <header class="page-head">
      <div class="page-head__main">
        <h1 class="page-title">图片生成</h1>
        <p class="page-desc">为资产生成统一风格的形象图，锚点锁定后自动携带角色描述</p>
      </div>
      <div class="page-head__actions">
        ${进行中.size ? '<span class="chip chip--accent status-tag">生成中…</span>' : ''}
        <button type="button" class="btn btn-ghost" data-btn-id="BTN-P006-90">跳转导演</button>
      </div>
    </header>

    <section class="section glass">
      <div class="section-head">
        <h2 class="section-title">生成与筛选</h2>
        <p class="section-sub">批量生成逐条创建任务并写回参考图引用；同一对象进行中不重复建任务</p>
      </div>
      <div class="section-body">
        <div class="toolbar">
          <button type="button" class="btn btn-primary" data-btn-id="BTN-P006-01">批量生成全部资产</button>
          <button type="button" class="btn btn-ghost" data-btn-id="BTN-P006-02">${仅看未生成 ? '查看全部资产' : '仅看未生成'}</button>
          ${标('chip--accent', `已生成 ${已生成数}/${全部资产.length}`)}
        </div>
        ${来源条}
      </div>
    </section>

    <section class="section glass">
      <div class="section-head">
        <h2 class="section-title">资产形象图</h2>
        <p class="section-sub">16:9 画布预览，锚点未锁定的人物不保证跨镜一致性</p>
      </div>
      <div class="section-body">${列表区}</div>
    </section>
  </div>`;

  btn('BTN-P006-90', { 类别: '①', handler: () => ctx.setView('p012'), 关联FID: 'F-012' });
  btn('BTN-P006-01', {
    类别: 全部资产.length ? '①' : '②',
    禁用原因: '还没有资产，请先到「分解提取资产」完成提取',
    handler: 批量生成,
    关联FID: 'F-006'
  });
  btn('BTN-P006-02', {
    类别: '①',
    handler: () => {
      仅看未生成 = !仅看未生成;
      re();
      ctx.showToast(仅看未生成 ? '仅显示尚未生成形象图的资产' : '已显示全部资产', { level: 'info' });
    },
    关联FID: 'F-006'
  });

  // 卡片操作按资产在 assets 中的真实下标编号，筛选切换不会串号
  展示.forEach(({ a, i }) => {
    const task = 图片任务(a.资产ID);
    btn(`BTN-P006-${10 + i}`, {
      类别: 忙(a.资产ID) || 缺锚(a) ? '②' : '①',
      禁用原因: 忙(a.资产ID) ? '该对象已有进行中的生成任务' : V1_TEXT.ANCHOR_MISSING,
      handler: () => 跑图(a),
      关联FID: 'F-006'
    });
    if (task && /失败|已降级/.test(task.状态)) {
      btn(`BTN-P006-${40 + i}`, {
        类别: 忙(a.资产ID) ? '②' : '①',
        禁用原因: '该对象已有进行中的生成任务',
        handler: () => 跑图(a, true),
        关联FID: 'F-006'
      });
    }
    btn(`BTN-P006-${70 + i}`, {
      类别: task ? '①' : '②',
      禁用原因: '该资产还没有生成任务，暂无提示词快照',
      handler: () => 看快照(a),
      关联FID: 'F-006'
    });
  });
}
