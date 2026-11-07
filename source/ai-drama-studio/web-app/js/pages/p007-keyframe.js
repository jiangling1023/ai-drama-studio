import { escapeHtml, openPromptSnapshotViewer, renderEmptyState, renderStatusTag } from '../components/index.js';
import { createTask, isRunning, runTask } from '../core/gen-task.js';
import { isFrameMissing } from '../core/derive.js';
import { demoKeyFrame } from '../demo/demo-image.js';
import { now } from '../core/uid.js';

const 帧类型们 = ['首帧', '尾帧'];
// 仅看缺失是纯 UI 态；进行中按帧ID 记在本地，跨重渲染保留卡片进度态
let 仅看缺失 = false;
let 检查结果 = '';
const 进行中 = new Set();

const 色调 = { 'chip--ok': 'tone-ok', 'chip--warn': 'tone-degrade', 'chip--fail': 'tone-fail', 'chip--lock': 'tone-lock', 'chip--demo': 'tone-demo', 'chip--accent': '' };
const 标 = (kind, text) => `<span class="chip ${kind} status-tag ${色调[kind] || ''}">${escapeHtml(text)}</span>`;
const 关弹层 = () => {
  const el = typeof document !== 'undefined' ? document.getElementById('modalRoot') : null;
  if (el) el.innerHTML = '';
};

// 帧ID 由「分镜ID + 帧类型」派生：重复补齐不会产生第二条同类型帧
const 帧ID = (分镜ID, 帧类型) => `${分镜ID}-kf-${帧类型 === '首帧' ? 'a' : 'b'}`;

export function render(container, ctx, extra = {}) {
  const p = ctx.getProject() || {};
  const btn = (id, spec) => ctx.registerButton(id, spec);
  const re = () => ctx.setView('p007');

  const 全部分镜 = p.shots || [];
  const 找帧 = (分镜ID, 帧类型) => (p.keyFrames || []).find(k => k.分镜ID === 分镜ID && k.帧类型 === 帧类型) || null;
  const 忙 = id => 进行中.has(id) || isRunning(p, id);
  const 帧任务 = id => (p.genTasks || []).filter(t => t.类型 === '关键帧' && t.输入快照?.对象ID === id).slice(-1)[0] || null;
  const 场次标签 = s => {
    const sc = (p.scenes || []).find(x => x.场次ID === s.场次ID);
    return sc ? `第 ${sc.场次序号} 场 · ${sc.地点 || '未标注'}` : '场次未标注';
  };
  const 缺帧数 = 全部分镜.reduce((n, s) => n + 帧类型们.filter(t => isFrameMissing(找帧(s.分镜ID, t))).length, 0);
  const 齐全镜数 = 全部分镜.filter(s => 帧类型们.every(t => !isFrameMissing(找帧(s.分镜ID, t)))).length;

  function 写帧(分镜ID, 帧类型, 图片引用, task) {
    const list = (p.keyFrames ||= []);
    let kf = list.find(k => k.分镜ID === 分镜ID && k.帧类型 === 帧类型);
    if (!kf) {
      kf = { 帧ID: 帧ID(分镜ID, 帧类型), 分镜ID, 帧类型, 图片引用: '', 生成状态: '待处理', 来源标记: '', 数据来源标记: '', 创建时间: now() };
      list.push(kf);
    }
    kf.图片引用 = 图片引用;
    kf.生成状态 = task.状态;
    kf.来源标记 = task.来源模型标识;
    kf.数据来源标记 = task.来源模型标识;
  }

  async function 跑帧(分镜, 帧类型) {
    const id = 帧ID(分镜.分镜ID, 帧类型);
    if (忙(id)) return;
    进行中.add(id);
    re(); // 先置进度态，再进入模型调用
    const task = createTask(p, { 类型: '关键帧', 用途: '媒体', 对象ID: id, 帧类型, 关联资产ID列表: 分镜.关联资产ID列表 || [] });
    await runTask(p, task.任务ID);
    // 演示降级统一用「分镜ID|帧类型」派生的固定帧，保证首尾帧几何可复现；真实产物才写任务输出
    const 产物 = String(task.输出引用 || '');
    const 图 = task.来源模型标识 === '演示数据'
      ? demoKeyFrame(分镜.分镜ID, 帧类型)
      : (/^data:image/.test(产物) ? 产物 : demoKeyFrame(分镜.分镜ID, 帧类型));
    写帧(分镜.分镜ID, 帧类型, 图, task);
    进行中.delete(id);
    ctx.commit(() => {});
    re();
  }

  async function 补齐缺失() {
    if (!缺帧数) {
      ctx.showToast('首尾帧已齐全，无需补齐', { level: 'info' });
      return;
    }
    let 补 = 0;
    for (const s of 全部分镜) {
      for (const t of 帧类型们) {
        if (isFrameMissing(找帧(s.分镜ID, t)) && !忙(帧ID(s.分镜ID, t))) {
          await 跑帧(s, t);
          补 += 1;
        }
      }
    }
    ctx.showToast(`已补齐 ${补} 条关键帧`, { level: 'ok' });
  }

  function 看快照(分镜, 帧类型) {
    const task = 帧任务(帧ID(分镜.分镜ID, 帧类型));
    if (!task) return;
    const 快 = task.最终提示词快照 || {};
    const 正 = 快.正向 || {};
    const 负 = 快.负面 || {};
    // C-12 只认扁平五键：把任务三区快照摊平后传入，不另存第二份
    openPromptSnapshotViewer({
      全局正向词: [正.全局正向词, 正.单条正向词].filter(Boolean).join(' '),
      最终负面词: [...(负.全局锁定负面词 || []), ...(负.单条负面词 || [])],
      锚点携带: (正.角色锚点 || []).map(x => x.锚点标识).join('、') || '无',
      被锚点覆盖: (正.被锚点覆盖 || []).join('、') || '无',
      来源标记: `${task.来源模型标识 || ''} · ${帧类型}`
    }, { closeBtnId: 'BTN-P007-90', copyBtnId: 'BTN-P007-91' });
    // C-12 关闭按钮默认落④不会执行 handler，改登记为①才能真关掉浮层
    btn('BTN-P007-90', { 类别: '①', handler: 关弹层, 关联FID: 'F-007' });
  }

  const 帧卡 = (s, 帧类型) => {
    const 序 = 全部分镜.findIndex(x => x.分镜ID === s.分镜ID) * 2 + (帧类型 === '尾帧' ? 1 : 0);
    const id = 帧ID(s.分镜ID, 帧类型);
    const kf = 找帧(s.分镜ID, 帧类型);
    const 缺 = isFrameMissing(kf);
    const 图 = 缺 ? '' : String(kf.图片引用 || '');
    return `<article class="glass shot-card" style="position:relative;${缺 ? 'border:1px dashed var(--fail);' : ''}">
      <div class="toolbar">
        ${标(帧类型 === '首帧' ? 'chip--accent' : 'chip--lock', 帧类型)}
        ${缺 ? 标('chip--fail', '缺失帧') : renderStatusTag(kf.生成状态 || '成功')}
        ${!缺 && kf.来源标记 === '演示数据' ? '<span class="demo-badge">演示数据</span>' : ''}
      </div>
      <div style="position:relative;aspect-ratio:16/9;border-radius:10px;overflow:hidden;border:1px solid var(--hairline-soft);background:rgba(10,12,18,.55)">
        ${图
    ? `<img src="${escapeHtml(图)}" alt="${escapeHtml(`${s.分镜ID} ${帧类型}`)}" style="display:block;width:100%;height:100%;object-fit:cover">`
    : '<div class="muted" style="display:grid;place-items:center;height:100%;border:1px dashed var(--fail);border-radius:10px;font-size:12px">缺失帧</div>'}
        ${忙(id) ? '<div class="progress" style="position:absolute;left:8px;right:8px;bottom:8px"><span class="progress__bar" style="width:45%;animation:sa-move 1.2s var(--ease-inout) infinite"></span></div>' : ''}
      </div>
      ${忙(id) ? '<p class="muted">生成中…</p>' : ''}
      <div class="section-actions toolbar">
        <button type="button" class="btn ${缺 ? 'btn-primary' : 'btn-ghost'}" data-btn-id="BTN-P007-${10 + 序}">${缺 ? '补齐' : '重新生成'}</button>
        <button type="button" class="btn btn-ghost" data-btn-id="BTN-P007-${30 + 序}">查看快照</button>
      </div>
    </article>`;
  };

  const 展示 = 仅看缺失
    ? 全部分镜.filter(s => 帧类型们.some(t => isFrameMissing(找帧(s.分镜ID, t))))
    : 全部分镜;

  const 分组区 = !全部分镜.length
    ? renderEmptyState({
      title: '还没有分镜',
      message: '关键帧按分镜逐条生成，请先到「分镜脚本」完成分镜',
      missing: ['shots 为空：F-005 未执行'],
      guideBtnId: 'BTN-P007-06',
      guideLabel: '去分镜脚本',
      onGuide: () => ctx.setView('p005'),
      关联FID: 'F-007'
    })
    : (展示.length
      ? 展示.map(s => `<section class="section glass">
          <div class="section-head">
            <h2 class="section-title">镜号 ${s.镜号} · ${escapeHtml(场次标签(s))} · ${escapeHtml(s.景别 || '景别未标注')}</h2>
            <p class="section-sub">${escapeHtml(String(s.画面描述 || '').slice(0, 46))}</p>
          </div>
          <div class="section-body"><div class="grid-2">${帧类型们.map(t => 帧卡(s, t)).join('')}</div></div>
        </section>`).join('')
      : '<p class="muted">所有分镜的首尾帧均已齐全，点击「查看全部关键帧」可回到完整清单。</p>');

  container.innerHTML = `<div class="page" data-page="p007">
    <header class="page-head">
      <div class="page-head__main">
        <h1 class="page-title">关键帧生成</h1>
        <p class="page-desc">为每条分镜补齐首帧与尾帧，帧位齐全后才可进入分镜成品生成</p>
      </div>
      <div class="page-head__actions">
        ${进行中.size ? '<span class="chip chip--accent status-tag">生成中…</span>' : ''}
        ${标('chip--accent', `齐全 ${齐全镜数}/${全部分镜.length} 条分镜`)}
      </div>
    </header>

    <section class="section glass">
      <div class="section-head">
        <h2 class="section-title">生成与检查</h2>
        <p class="section-sub">批量补齐只处理缺失帧，已有帧不覆盖；单帧可逐条重新生成</p>
      </div>
      <div class="section-body">
        <div class="toolbar">
          <button type="button" class="btn btn-primary" data-btn-id="BTN-P007-01">批量生成关键帧</button>
          <button type="button" class="btn btn-ghost" data-btn-id="BTN-P007-02">${仅看缺失 ? '查看全部关键帧' : '仅看缺失'}</button>
          <button type="button" class="btn btn-ghost" data-btn-id="BTN-P007-03">连续性检查</button>
          ${检查结果 ? 标(缺帧数 ? 'chip--fail' : 'chip--ok', 检查结果) : ''}
        </div>
        <p class="muted">首尾帧需与上一镜的尾帧在轮廓位置与尺度上连续，避免跳切</p>
      </div>
    </section>

    ${缺帧数 ? `<div class="alert-bar tone-fail" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span>共 ${缺帧数} 条关键帧缺失，F-010 分镜成品将不完整</span>
      <button type="button" class="btn btn-primary" data-btn-id="BTN-P007-04">一键补齐</button>
    </div>` : ''}

    ${分组区}
  </div>`;

  btn('BTN-P007-01', {
    类别: 全部分镜.length ? '①' : '②',
    禁用原因: '还没有分镜，请先到「分镜脚本」完成分镜',
    handler: 补齐缺失,
    关联FID: 'F-007'
  });
  btn('BTN-P007-02', {
    类别: '①',
    handler: () => {
      仅看缺失 = !仅看缺失;
      re();
      ctx.showToast(仅看缺失 ? '仅显示存在缺失帧的分镜' : '已显示全部分镜关键帧', { level: 'info' });
    },
    关联FID: 'F-007'
  });
  btn('BTN-P007-03', {
    类别: '①',
    handler: () => {
      检查结果 = `首尾帧齐全 ${齐全镜数}/${全部分镜.length} 条分镜`;
      re();
      ctx.showToast(缺帧数 ? `连续性检查：${缺帧数} 条关键帧缺失，首尾帧不连续会跳切` : '连续性检查通过：首尾帧齐全', { level: 缺帧数 ? 'warn' : 'ok' });
    },
    关联FID: 'F-007'
  });
  btn('BTN-P007-04', { 类别: '③', handler: 补齐缺失, 空状态: '当前没有缺失帧', 关联FID: 'F-007' });

  展示.forEach(s => {
    帧类型们.forEach(t => {
      const 序 = 全部分镜.findIndex(x => x.分镜ID === s.分镜ID) * 2 + (t === '尾帧' ? 1 : 0);
      const id = 帧ID(s.分镜ID, t);
      btn(`BTN-P007-${10 + 序}`, {
        类别: 忙(id) ? '②' : '①',
        禁用原因: '该对象已有进行中的生成任务',
        handler: () => 跑帧(s, t),
        关联FID: 'F-007'
      });
      btn(`BTN-P007-${30 + 序}`, {
        类别: 帧任务(id) ? '①' : '②',
        禁用原因: '该帧还没有生成任务，暂无提示词快照',
        handler: () => 看快照(s, t),
        关联FID: 'F-007'
      });
    });
  });
}
