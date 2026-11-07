import { escapeHtml, openConfirmModal, openPromptSnapshotViewer, renderDataTable } from '../components/index.js';
import { assembleNegativePrompt, buildPromptSnapshot, rejectLockedWordRemoval } from '../core/prompt-builder.js';
import { V1_TEXT } from '../constants.js';
import { now } from '../core/uid.js';

// 快照预览的分镜选择是纯 UI 态；提示词一律落 promptSet / shots
let 快照分镜ID = '';

// 色板复用既有 status-tag tone-*，不新增第二套配色
const 色调 = { 'chip--ok': 'tone-ok', 'chip--warn': 'tone-degrade', 'chip--fail': 'tone-fail', 'chip--lock': 'tone-lock', 'chip--accent': '' };
const 标 = (kind, text) => `<span class="chip ${kind} status-tag ${色调[kind] || ''}">${escapeHtml(text)}</span>`;
const 关弹层 = () => {
  const el = typeof document !== 'undefined' ? document.getElementById('modalRoot') : null;
  if (el) el.innerHTML = '';
};

export function render(container, ctx, extra = {}) {
  const p = ctx.getProject() || {};
  const btn = (id, spec) => ctx.registerButton(id, spec);
  const re = () => ctx.setView('p008');

  const ps = p.promptSet || (p.promptSet = {});
  const 分镜列表 = p.shots || [];
  const 已锁定 = ps.负面词锁定状态 === '已锁定';
  const 锁定词 = ps.锁定词快照 || [];
  const 全局负面 = ps.全局负面词 || [];
  const 资产名 = id => ((p.assets || []).find(a => a.资产ID === id) || {}).名称 || id;

  if (!快照分镜ID || !分镜列表.some(s => s.分镜ID === 快照分镜ID)) 快照分镜ID = 分镜列表[0] ? 分镜列表[0].分镜ID : '';

  const 取正向 = () => {
    const el = container.querySelector('[data-role="positive"]');
    return String(el ? el.value : (ps.全局正向词 || ''));
  };
  const 取词 = sel => {
    const el = container.querySelector(sel);
    return String(el ? el.value : '').trim();
  };

  function 保存正向() {
    ps.全局正向词 = 取正向().trim();
    ctx.commit(() => {});
    re();
    ctx.showToast('全局正向词已保存', { level: 'ok' });
  }

  function 追加全局负面() {
    const w = 取词('[data-role="neg-input"]');
    if (!w) return;
    ps.全局负面词 = [...new Set([...全局负面, w])];
    ctx.commit(() => {});
    re();
    ctx.showToast(`已追加负面词「${w}」`, { level: 'ok' });
  }

  function 锁定负面词() {
    const 词 = [...new Set(全局负面.map(w => String(w).trim()).filter(Boolean))];
    if (!词.length) return;
    // 锁定即冻结快照：此后单条区任何移除声明都不生效，自动附加到所有生成任务
    ps.锁定词快照 = 词;
    ps.负面词锁定状态 = '已锁定';
    ps.锁定时间 = now();
    ctx.commit(() => {});
    re();
    ctx.showToast(`已锁定 ${词.length} 个负面词，所有生成任务将自动附加`, { level: 'ok' });
  }

  function 确认解锁() {
    openConfirmModal({
      title: '解锁全局负面词',
      message: `解锁后当前 ${锁定词.length} 个锁定负面词不再自动附加到生成任务，单条区可移除。`,
      变更条目ID: 锁定词,
      confirmLabel: '确认解锁',
      confirmBtnId: 'BTN-P008-04a',
      cancelBtnId: 'BTN-P008-04b',
      confirmToast: '已解锁全局负面词',
      onConfirm: () => {
        ps.负面词锁定状态 = '未锁定';
        ps.锁定时间 = null;
        ps.解锁时间 = now();
        ctx.commit(() => {});
        关弹层();
        re();
      }
    });
    // C-04 取消默认落④不会执行 handler，改登记为①才能真关掉浮层且零变更
    btn('BTN-P008-04b', { 类别: '①', handler: () => { 关弹层(); ctx.showToast('已取消解锁，负面词仍为锁定状态', { level: 'info' }); }, 关联FID: 'F-008' });
  }

  function 删单条词(s, w) {
    s.单条负面词 = (s.单条负面词 || []).filter(x => x !== w);
    ctx.commit(() => {});
    re();
    ctx.showToast(`已移除单条负面词「${w}」`, { level: 'ok' });
  }

  function 追加单条词(s, i) {
    const w = 取词(`[data-role="neg-${i}"]`);
    if (!w) return;
    s.单条负面词 = [...new Set([...(s.单条负面词 || []), w])];
    ctx.commit(() => {});
    re();
    ctx.showToast(`已追加单条负面词「${w}」`, { level: 'ok' });
  }

  const 快照分镜 = 分镜列表.find(s => s.分镜ID === 快照分镜ID) || null;
  const 预览 = 快照分镜
    ? buildPromptSnapshot({
      project: p, taskType: '图片', 对象ID: 快照分镜.分镜ID,
      关联资产ID列表: 快照分镜.关联资产ID列表 || [],
      单条正向词: 快照分镜.单条正向词, 单条负面词: 快照分镜.单条负面词
    })
    : null;
  const 锚点文本 = 预览 ? (预览.正向.角色锚点 || []).map(a => `${a.锚点标识}（${资产名(a.资产ID)}）`).join('、') || '无' : '无';

  function 看快照() {
    if (!预览) return;
    openPromptSnapshotViewer({
      全局正向词: [预览.正向.全局正向词, 预览.正向.单条正向词].filter(Boolean).join(' '),
      最终负面词: [...预览.负面.全局锁定负面词, ...预览.负面.单条负面词],
      锚点携带: 锚点文本,
      被锚点覆盖: `${(预览.正向.被锚点覆盖 || []).length} 条`,
      来源标记: 预览.来源标记.来源模型标识
    }, { closeBtnId: 'BTN-P008-92', copyBtnId: 'BTN-P008-93' });
    // C-12 关闭按钮默认落④不会执行 handler，改登记为①才能真关掉浮层
    btn('BTN-P008-92', { 类别: '①', handler: 关弹层, 关联FID: 'F-008' });
  }

  const 负词条 = w => {
    const 锁定 = 已锁定 && 锁定词.includes(w);
    return `<span class="chip ${锁定 ? 'chip--lock' : 'chip--accent'} status-tag ${锁定 ? 'tone-lock' : ''}">${锁定 ? '🔒 ' : ''}${escapeHtml(w)}</span>`;
  };

  // 单条区三个单元格由占位符替换：C-01 只负责表格骨架，交互控件仍属本页
  const 正向单元格 = i => `<input class="field-input" style="min-width:180px" data-shot="${escapeHtml(分镜列表[i].分镜ID)}"
    data-commit="p008-shot" value="${escapeHtml(分镜列表[i].单条正向词 || '')}" placeholder="单条正向词">`;
  const 负面单元格 = i => {
    const s = 分镜列表[i];
    return `<div class="toolbar" style="gap:6px">
      <div style="display:flex;flex-wrap:wrap;gap:4px">${(s.单条负面词 || []).map((w, j) => `<span class="chip chip--accent status-tag">${escapeHtml(w)}<button type="button" class="btn btn-ghost" style="height:18px;padding:0 4px;margin-left:4px;font-size:10px;line-height:1" data-btn-id="BTN-P008-${40 + i}-${j}" aria-label="移除 ${escapeHtml(w)}">×</button></span>`).join('') || '<span class="muted">无</span>'}</div>
      <input class="field-input" style="width:110px" data-role="neg-${i}" placeholder="负面词">
      <button type="button" class="btn btn-ghost" data-btn-id="BTN-P008-${20 + i}">追加</button>
    </div>`;
  };
  const 最终单元格 = i => {
    const 词 = assembleNegativePrompt(p, 分镜列表[i]);
    // 只读展示：默认只列前 3 个，其余以 +n 概括；长一致性表达截断，避免撑破单元格
    const 前 = 词.slice(0, 3).map(w => `<span class="chip chip--lock status-tag tone-lock" style="max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(w)}</span>`).join('');
    return `<div style="display:flex;flex-wrap:wrap;gap:4px;max-width:280px">${前 || '<span class="muted">无</span>'}${词.length > 3 ? `<span class="chip chip--accent status-tag">+${词.length - 3}</span>` : ''}</div>`;
  };

  const 表格 = 分镜列表.length
    ? renderDataTable(
      [
        { key: '镜号', label: '镜号' },
        { key: '单条正向词', label: '单条正向词' },
        { key: '单条负面词', label: '单条负面词' },
        { key: '最终负面词', label: '最终负面词（只读）' }
      ],
      分镜列表.map((s, i) => ({
        镜号: `镜 ${s.镜号}${s.景别 ? ` · ${s.景别}` : ''}`,
        单条正向词: `__POS_${i}__`,
        单条负面词: `__NEG_${i}__`,
        最终负面词: `__FINAL_${i}__`
      })),
      { raw: true, countBtnId: 'BTN-P008-90' }
    )
      .replace(/__POS_(\d+)__/g, (_, i) => 正向单元格(Number(i)))
      .replace(/__NEG_(\d+)__/g, (_, i) => 负面单元格(Number(i)))
      .replace(/__FINAL_(\d+)__/g, (_, i) => 最终单元格(Number(i)))
    : '<p class="muted">还没有分镜，单条提示词随 F-005 分镜脚本产出</p>';

  const 分镜选项 = 分镜列表.map(s => `<option value="${escapeHtml(s.分镜ID)}"${s.分镜ID === 快照分镜ID ? ' selected' : ''}>镜 ${escapeHtml(s.镜号)} · ${escapeHtml(s.景别 || '')} · ${escapeHtml(s.分镜ID)}</option>`).join('');

  container.innerHTML = `<div class="page" data-page="p008">
    <header class="page-head">
      <div class="page-head__main">
        <h1 class="page-title">提示词</h1>
        <p class="page-desc">全局正向词统一风格，负面词锁定后对所有生成任务强制生效</p>
      </div>
      <div class="page-head__actions">
        ${标(已锁定 ? 'chip--lock' : 'chip--warn', 已锁定 ? '负面词已锁定' : '负面词未锁定')}
        ${标('chip--accent', `全局负面词 ${全局负面.length}`)}
      </div>
    </header>

    <section class="section glass">
      <div class="section-head">
        <h2 class="section-title">全局提示词</h2>
        <p class="section-sub">正向词统一风格基调；负面词锁定后写死快照，任何单条设置都不可覆盖</p>
      </div>
      <div class="section-body">
        <div class="grid-2">
          <div class="field">
            <label class="field-label" for="p008-positive">全局正向词</label>
            <div class="field-control">
              <textarea id="p008-positive" class="field-input" rows="5" data-role="positive" data-commit="p008-positive"
                placeholder="如：深色冷调，雨夜霓虹，电影感构图">${escapeHtml(ps.全局正向词 || '')}</textarea>
            </div>
            <p class="field-hint">失焦即写回工程；点「保存」也会写入并提示结果</p>
            <div class="toolbar">
              <button type="button" class="btn btn-primary" data-btn-id="BTN-P008-01">保存</button>
            </div>
          </div>
          <div class="field">
            <span class="field-label">全局负面词${已锁定 ? '（已锁定，只读）' : ''}</span>
            <div class="toolbar">${全局负面.length ? 全局负面.map(负词条).join('') : '<span class="muted">尚未添加负面词</span>'}</div>
            <div class="toolbar" style="margin-top:8px">
              <input id="p008-neg" class="field-input" style="flex:1 1 160px" data-role="neg-input" placeholder="输入负面词，如：多手指">
              <button type="button" class="btn btn-ghost" data-btn-id="BTN-P008-02">追加</button>
            </div>
            <div class="toolbar">
              <button type="button" class="btn btn-primary" data-btn-id="BTN-P008-03">锁定负面词</button>
              <button type="button" class="btn btn-ghost" data-btn-id="BTN-P008-04">解锁</button>
            </div>
          </div>
        </div>
        ${已锁定
    ? `<div class="alert-bar">当前 ${锁定词.length} 个负面词已全局锁定，所有生成任务将自动附加，单条不可移除</div>`
    : '<p class="muted">负面词未锁定：单条区可自由增删，锁定后统一附加到所有生成任务。</p>'}
      </div>
    </section>

    <section class="section glass">
      <div class="section-head">
        <h2 class="section-title">单条提示词</h2>
        <p class="section-sub">按分镜维护单条正 / 负面词；锁定词不可移除，最终负面词为锁定词与单条词的并集</p>
      </div>
      <div class="section-body">${表格}</div>
    </section>

    <section class="section glass">
      <div class="section-head">
        <h2 class="section-title">最终提示词快照</h2>
        <p class="section-sub">快照为组装瞬间的只读冻结值，此后锁定 / 解锁 / 编辑都不回溯</p>
      </div>
      <div class="section-body">
        <div class="toolbar">
          <label class="field-label" for="p008-shot">分镜</label>
          <select id="p008-shot" class="field-input" style="flex:1 1 240px" data-role="shot">${分镜选项 || '<option value="">暂无分镜</option>'}</select>
          <button type="button" class="btn btn-primary" data-btn-id="BTN-P008-05">查看快照</button>
        </div>
        ${预览 ? `<div class="toolbar">
          ${标('chip--accent', `锚点注入：${锚点文本}`)}
          ${标((预览.正向.被锚点覆盖 || []).length ? 'chip--warn' : 'chip--ok', `被锚点覆盖：${(预览.正向.被锚点覆盖 || []).length} 条`)}
          ${标('chip--lock', `全局锁定负面词：${预览.负面.全局锁定负面词.length} 个`)}
          ${标('chip--demo', `来源：${预览.来源标记.来源模型标识}`)}
        </div>
        <p class="mono muted ellipsis">对象 ${escapeHtml(预览.来源标记.输入快照摘要)} · 组装规则 ${escapeHtml(预览.来源标记.组装规则版本)} · 不回溯 ${预览.来源标记.不回溯 ? '是' : '否'}</p>`
    : '<p class="muted">还没有分镜，暂无可预览的单条提示词</p>'}
      </div>
    </section>
  </div>`;

  const 同步保存 = () => btn('BTN-P008-01', {
    类别: 取正向().trim() ? '①' : '②',
    禁用原因: '请先输入全局正向词',
    handler: 保存正向,
    关联FID: 'F-008'
  });
  同步保存();

  // 追加按钮按对应输入框是否为空在 ①/② 之间切换，空输入点下去复述的是具体原因
  const 同步追加 = () => btn('BTN-P008-02', {
    类别: 取词('[data-role="neg-input"]') ? '①' : '②',
    禁用原因: '请先输入负面词，再追加',
    handler: 追加全局负面,
    关联FID: 'F-008'
  });
  同步追加();

  btn('BTN-P008-03', {
    类别: 已锁定 || !全局负面.length ? '②' : '①',
    禁用原因: 已锁定 ? '全局负面词已锁定，无需重复锁定' : '请先追加负面词后再锁定',
    handler: 锁定负面词,
    关联FID: 'F-008'
  });
  btn('BTN-P008-04', {
    类别: 已锁定 ? '①' : '②',
    禁用原因: '全局负面词当前未锁定',
    handler: 确认解锁,
    关联FID: 'F-008'
  });
  btn('BTN-P008-05', {
    类别: 预览 ? '①' : '②',
    禁用原因: '还没有分镜，暂无可查看的提示词快照',
    handler: 看快照,
    关联FID: 'F-008'
  });

  分镜列表.forEach((s, i) => {
    const 登记单条追加 = () => btn(`BTN-P008-${20 + i}`, {
      类别: 取词(`[data-role="neg-${i}"]`) ? '①' : '②',
      禁用原因: '请先输入负面词，再追加',
      handler: () => 追加单条词(s, i),
      关联FID: 'F-008'
    });
    登记单条追加();
    // 锁定词保护：命中锁定快照的移除一律落④，只复述原句、绝不真删
    (s.单条负面词 || []).forEach((w, j) => {
      const 检查 = 已锁定 ? rejectLockedWordRemoval(锁定词, `移除 ${w}`) : { ok: true, message: '' };
      btn(`BTN-P008-${40 + i}-${j}`, 检查.ok
        ? { 类别: '①', handler: () => 删单条词(s, w), 关联FID: 'F-008' }
        : { 类别: '④', toast: 检查.message || V1_TEXT.LOCKED_WORD_REJECT, 关联FID: 'F-008' });
    });
    const el = container.querySelector(`[data-role="neg-${i}"]`);
    if (el) el.addEventListener('input', 登记单条追加);
  });

  ctx.registerAction('commit:p008-positive', el => { ps.全局正向词 = el.value; });
  ctx.registerAction('commit:p008-shot', el => {
    const s = 分镜列表.find(x => x.分镜ID === el.getAttribute('data-shot'));
    if (s) s.单条正向词 = el.value;
  });

  const 正向域 = container.querySelector('[data-role="positive"]');
  if (正向域) 正向域.addEventListener('input', 同步保存);
  const 负词域 = container.querySelector('[data-role="neg-input"]');
  if (负词域) 负词域.addEventListener('input', 同步追加);
  const 分镜域 = container.querySelector('[data-role="shot"]');
  if (分镜域) {
    分镜域.addEventListener('change', () => {
      快照分镜ID = 分镜域.value;
      re();
    });
  }
}
