import { escapeHtml, openConfirmModal, renderDataTable, renderEditableRow, renderEmptyState } from '../components/index.js';
import { createTask, runTask } from '../core/gen-task.js';
import { demoFor } from '../demo/demo-data.js';
import { classify, splitSentences } from '../core/diagnosis.js';

// 选中集 / 编辑行 / 拆分中均为纯 UI 态，工程数据只落在 episodes、scenes
let 选中集ID = '';
let 编辑场次ID = '';
let 拆分中 = false;

// 组件对单元格统一转义，状态标记先用占位符过一遍，插入 DOM 前再替换成 chip
const 注入标记 = html => String(html)
  .replace(/__OK_([^_]+)__/g, (_, t) => `<span class="chip chip--ok status-tag tone-ok">${t}</span>`)
  .replace(/__WARN_([^_]+)__/g, (_, t) => `<span class="chip chip--warn status-tag tone-degrade">${t}</span>`)
  .replace(/__FAIL_([^_]+)__/g, (_, t) => `<span class="chip chip--fail status-tag tone-fail">${t}</span>`);

// 正文按 4 字/秒折算时长，仅用于排期粗估，不作为剪辑时长真值
const 估算秒 = 场次列表 => 场次列表.reduce(
  (n, s) => n + Math.max(1, Math.round(String(s.正文 || '').length / 4)), 0
);

export function render(container, ctx, extra = {}) {
  const p = ctx.getProject() || {};
  const btn = (id, spec) => ctx.registerButton(id, spec);
  const re = () => ctx.setView('p002');

  const 集列表 = p.episodes || [];
  const 全部场次 = p.scenes || [];
  if (!选中集ID || !集列表.some(e => e.集ID === 选中集ID)) 选中集ID = 集列表[0] ? 集列表[0].集ID : '';

  const 当前集 = 集列表.find(e => e.集ID === 选中集ID) || null;
  const 当前场次 = 选中集ID ? 全部场次.filter(s => s.集ID === 选中集ID) : 全部场次;

  const 关弹层 = () => {
    const el = typeof document !== 'undefined' ? document.getElementById('modalRoot') : null;
    if (el) el.innerHTML = '';
  };

  async function 执行拆分(kinds) {
    if (拆分中) return;
    拆分中 = true;
    re(); // 先置进行中，避免长调用期间页面无反馈
    for (const kind of kinds) {
      const task = createTask(p, {
        任务类型: kind, 用途: '文本', 对象ID: kind === '按集拆分' ? 'episodes' : 'scenes'
      });
      await runTask(p, task.任务ID);
      // 任务产物槽只存字符串，结构化拆分结果按任务类型取对应产物后落库
      if (kind === '按集拆分') p.episodes = demoFor('按集拆分');
      else p.scenes = demoFor('按场次拆分');
    }
    ctx.commit(() => {});
    拆分中 = false;
    re();
    ctx.showToast('拆分完成，可逐场次校对台词覆盖率', { level: 'ok' });
  }

  function 重新拆分() {
    openConfirmModal({
      title: '重新拆分剧本',
      message: '将清空现有集与场次并按当前剧本原文全量重建，已生成的分镜不随本次动，需另行重生成。',
      变更条目ID: 集列表.map(e => e.集ID).concat(全部场次.map(s => s.场次ID)).slice(0, 8),
      confirmLabel: '全量重建',
      confirmBtnId: 'BTN-P002-70',
      cancelBtnId: 'BTN-P002-71',
      confirmToast: '已开始全量重建',
      onConfirm: async () => {
        p.episodes = [];
        p.scenes = [];
        编辑场次ID = '';
        ctx.commit(() => {});
        关弹层();
        await 执行拆分(['按集拆分', '按场次拆分']);
      }
    });
  }

  function 删除场次(场次) {
    openConfirmModal({
      title: '删除场次',
      message: `将删除「第 ${场次.场次序号} 场 · ${场次.地点}」，其正文与出场人物一并移除，工程内其余数据不变。`,
      变更条目ID: [场次.场次ID],
      confirmLabel: '确认删除',
      confirmBtnId: 'BTN-P002-60',
      cancelBtnId: 'BTN-P002-61',
      confirmToast: '场次已删除',
      onConfirm: () => {
        p.scenes = (p.scenes || []).filter(x => x.场次ID !== 场次.场次ID);
        ctx.commit(() => {});
        关弹层();
        re();
      }
    });
  }

  function 保存编辑() {
    const box = container.querySelector('#p002-edit');
    const sc = (p.scenes || []).find(s => s.场次ID === 编辑场次ID);
    if (!box || !sc) return;
    box.querySelectorAll('[data-editable]').forEach(el => {
      const 字段 = el.getAttribute('data-field');
      sc[字段] = 字段 === '场次序号' ? (Number(el.value) || sc.场次序号) : el.value;
    });
    ctx.commit(() => {});
    编辑场次ID = '';
    re();
    ctx.showToast('场次已保存', { level: 'ok' });
  }

  const 行 = 当前场次.map((sc, i) => {
    const 正文 = String(sc.正文 || '').replace(/\s+/g, ' ');
    // 台词覆盖率是项目级指标（有台词场次/总场次），逐场展示必然失真，单场只报本场台词句数
    const 台词句数 = splitSentences(sc.正文 || '').filter(s => classify(s, '') === '台词').length;
    return {
      场次序号: String(sc.场次序号),
      地点: sc.地点 || '',
      时间: sc.时间 || '',
      出场人物: String(sc.出场人物 || '').replace(/\n/g, ' / '),
      正文摘要: 正文.length > 60 ? `${正文.slice(0, 60)}…` : 正文,
      本场台词: 台词句数 > 0 ? `__OK_台词${台词句数}句__` : '__FAIL_无台词（建议补表演/对白）__',
      // 行内操作不走 rowActions：组件会把同一组按钮铺到每一行，改为按行号占位后替换
      操作: `__ACT_${i}__`
    };
  });

  const 表格 = 注入标记(renderDataTable(
    [
      { key: '场次序号', label: '场次序号' },
      { key: '地点', label: '地点' },
      { key: '时间', label: '时间' },
      { key: '出场人物', label: '出场人物' },
      { key: '正文摘要', label: '正文摘要' },
      { key: '本场台词', label: '本场台词' },
      { key: '操作', label: '操作' }
    ],
    行,
    { countBtnId: 'BTN-P002-91' }
  )).replace(/__ACT_(\d+)__/g, (_, n) => {
    const i = Number(n);
    return `<button type="button" class="btn btn-ghost" data-btn-id="BTN-P002-${20 + i}">编辑</button>`
      + `<button type="button" class="btn btn-ghost" data-btn-id="BTN-P002-${40 + i}">删除</button>`;
  });

  const 编辑中 = 全部场次.find(s => s.场次ID === 编辑场次ID);
  const 编辑区 = 编辑中 ? `<div class="section glass" id="p002-edit">
    <div class="section-head">
      <h3 class="section-title">编辑场次 · 第 ${escapeHtml(编辑中.场次序号)} 场</h3>
      <p class="section-sub">改完点保存，失焦不自动写回，避免误改已通过校验的场次</p>
    </div>
    <div class="section-body">
      <div class="data-table"><div class="data-table-scroll"><table><tbody>
        ${renderEditableRow(
          [
            { key: '场次序号', label: '场次序号', type: 'number' },
            { key: '地点', label: '地点' },
            { key: '时间', label: '时间' },
            { key: '出场人物', label: '出场人物', multiline: true },
            { key: '正文', label: '正文', multiline: true }
          ],
          编辑中,
          { objectId: 编辑中.场次ID }
        )}
      </tbody></table></div></div>
      <div class="section-actions">
        <button type="button" class="btn btn-primary" data-btn-id="BTN-P002-50">保存</button>
        <button type="button" class="btn btn-ghost" data-btn-id="BTN-P002-51">取消</button>
      </div>
    </div>
  </div>` : '';

  const 空态 = renderEmptyState({
    title: '还没有集与场次',
    message: '先按集、按场次拆分，才能逐场校对台词覆盖率与出场人物',
    missing: ['episodes 为空：按集拆分未执行', 'scenes 为空：按场次拆分未执行'],
    guideBtnId: 'BTN-P002-92',
    guideLabel: '按集拆分',
    onGuide: () => 执行拆分(['按集拆分', '按场次拆分']),
    关联FID: 'F-002'
  });

  container.innerHTML = `<div class="page" data-page="p002">
    <header class="page-head">
      <div class="page-head__main">
        <h1 class="page-title">拆分剧本</h1>
        <p class="page-desc">把剧本原文拆成「集 → 场次」，逐场校对台词覆盖率与出场人物</p>
      </div>
      <div class="page-head__actions">
        ${拆分中 ? '<span class="chip chip--accent">拆分中…</span>' : ''}
        <span class="chip chip--demo">集 ${集列表.length} · 场次 ${全部场次.length}</span>
      </div>
    </header>

    <section class="section glass">
      <div class="section-head">
        <h2 class="section-title">拆分操作</h2>
        <p class="section-sub">按集拆分写 episodes，按场次拆分写 scenes；重新拆分会全量重建两者</p>
      </div>
      <div class="section-body">
        <div class="toolbar">
          <button type="button" class="btn btn-primary" data-btn-id="BTN-P002-01">按集拆分</button>
          <button type="button" class="btn btn-primary" data-btn-id="BTN-P002-02">按场次拆分</button>
          <button type="button" class="btn btn-ghost" data-btn-id="BTN-P002-03">重新拆分</button>
        </div>
      </div>
    </section>

    ${全部场次.length ? `<div class="grid-2">
      <section class="section glass">
        <div class="section-head">
          <h2 class="section-title">集列表</h2>
          <p class="section-sub">点击切换右侧场次</p>
        </div>
        <div class="section-body">
          <div class="list">
            ${集列表.map((e, i) => {
              const 集场次 = 全部场次.filter(s => s.集ID === e.集ID);
              return `<div class="glass list-item${e.集ID === 选中集ID ? ' is-active' : ''}" role="button" tabindex="0" data-btn-id="BTN-P002-${10 + i}">
                <div class="list-item__main">
                  <div class="ellipsis">${escapeHtml(e.标题 || `第 ${e.集号} 集`)}</div>
                  <div class="list-item__meta muted">场次 ${集场次.length} · 约 ${估算秒(集场次)} 秒</div>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>
      </section>

      <section class="section glass">
        <div class="section-head">
          <h2 class="section-title">${escapeHtml(当前集 ? (当前集.标题 || `第 ${当前集.集号} 集`) : '全部场次')}</h2>
          <p class="section-sub">逐场看本场是否含台词；项目级台词覆盖率（有台词场次 / 总场次）见剧本页诊断卡</p>
        </div>
        <div class="section-body">${表格}</div>
      </section>
    </div>` : 空态}

    ${编辑区}
  </div>`;

  btn('BTN-P002-01', { 类别: '①', handler: () => 执行拆分(['按集拆分']), 关联FID: 'F-002' });
  btn('BTN-P002-02', { 类别: '①', handler: () => 执行拆分(['按场次拆分']), 关联FID: 'F-002' });
  btn('BTN-P002-03', {
    类别: 全部场次.length ? '①' : '②',
    禁用原因: '还没有可重建的场次，请先拆分剧本',
    handler: 重新拆分,
    关联FID: 'F-002'
  });
  集列表.forEach((e, i) => {
    btn(`BTN-P002-${10 + i}`, {
      类别: '①',
      handler: () => { 选中集ID = e.集ID; 编辑场次ID = ''; re(); },
      关联FID: 'F-002'
    });
  });
  当前场次.forEach((sc, i) => {
    btn(`BTN-P002-${20 + i}`, {
      类别: '①',
      handler: () => { 编辑场次ID = sc.场次ID; re(); },
      关联FID: 'F-002'
    });
    btn(`BTN-P002-${40 + i}`, { 类别: '①', handler: () => 删除场次(sc), 关联FID: 'F-002' });
  });
  btn('BTN-P002-50', { 类别: '①', handler: 保存编辑, 关联FID: 'F-002' });
  btn('BTN-P002-51', { 类别: '①', handler: () => { 编辑场次ID = ''; re(); }, toast: '已取消编辑，工程数据未改变', 关联FID: 'F-002' });
}
