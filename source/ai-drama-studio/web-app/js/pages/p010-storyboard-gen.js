import { escapeHtml, openPromptSnapshotViewer, renderDataTable, renderEmptyState } from '../components/index.js';
import { assembleNegativePrompt, buildPromptSnapshot } from '../core/prompt-builder.js';
import { effectiveConstraints, missingAnchors } from '../core/derive.js';
import { uid, now } from '../core/uid.js';
import * as IO from '../io.js';

// 展开哪条最终正向词是纯 UI 态；成品数据一律落 storyboardItems
const 展开集 = new Set();

// 色板复用既有 status-tag tone-*，不新增第二套配色
const 色调 = {
  'chip--ok': 'tone-ok', 'chip--warn': 'tone-degrade', 'chip--fail': 'tone-fail',
  'chip--lock': 'tone-lock', 'chip--demo': 'tone-demo', 'chip--accent': '', 'chip--muted': 'tone-muted'
};
const 标 = (kind, text) => `<span class="chip ${kind} status-tag ${色调[kind] ?? ''}">${escapeHtml(text)}</span>`;
const 关弹层 = () => {
  const el = typeof document !== 'undefined' ? document.getElementById('modalRoot') : null;
  if (el) el.innerHTML = '';
};
const 截断 = (v, n) => {
  const s = String(v || '');
  return s.length > n ? `${s.slice(0, n)}…` : s;
};

// 单条成品：正向 / 负面词一律经唯一组装点（锚点注入 + 负面词并集），页面不自拼第二份
function 造成品(p, shot, 帧表, 成品ID) {
  const 首帧 = 帧表.find(k => k.分镜ID === shot.分镜ID && k.帧类型 === '首帧' && k.图片引用);
  const 快照 = buildPromptSnapshot({
    project: p, taskType: '图片', 对象ID: shot.分镜ID,
    关联资产ID列表: shot.关联资产ID列表 || [],
    单条正向词: shot.单条正向词, 单条负面词: shot.单条负面词
  });
  const 锚点标识 = (快照.正向.角色锚点 || []).map(a => a.锚点标识);
  const 正向词 = [
    快照.正向.全局正向词, 快照.正向.单条正向词,
    锚点标识.length ? `锚点 ${锚点标识.join(' / ')}` : ''
  ].filter(Boolean).join(' ');
  const 负面词 = assembleNegativePrompt(p, shot);
  return {
    成品ID: 成品ID || uid('sb'), 分镜ID: shot.分镜ID, 镜号: shot.镜号,
    画面描述: shot.画面描述 || '', 对白: shot.对白 || '', 时长: Number(shot.时长) || 0,
    关键帧图引用: 首帧 ? String(首帧.图片引用) : '',
    最终正向词: 正向词, 最终负面词: 负面词, 关联锚点标识: 锚点标识,
    提示词快照: {
      全局正向词: 正向词, 最终负面词: 负面词,
      锚点携带: 锚点标识.length ? 锚点标识.join('、') : '无（未引用已锁定人物锚点）',
      被锚点覆盖: (快照.正向.被锚点覆盖 || []).length ? (快照.正向.被锚点覆盖 || []).join('、') : '0 条',
      来源标记: 快照.来源标记.来源模型标识
    },
    数据来源标记: 快照.来源标记.来源模型标识, 生成时间: now()
  };
}

export function render(container, ctx, extra = {}) {
  const p = ctx.getProject() || {};
  const btn = (id, spec) => ctx.registerButton(id, spec);
  const re = () => ctx.setView('p010');

  // 镜号在场次内唯一、跨场次会重号，故先按场次序号再按镜号排序，避免不同场次的镜头交错
  const 场次序 = new Map((p.scenes || []).map((s, i) => [s.场次ID, Number(s.场次序号) || i + 1]));
  const 分镜 = (p.shots || []).slice().sort((a, b) => (场次序.get(a.场次ID) ?? 99) - (场次序.get(b.场次ID) ?? 99)
    || (Number(a.镜号) || 0) - (Number(b.镜号) || 0));
  const 成品 = p.storyboardItems || [];
  const 帧表 = p.keyFrames || [];
  const 约束 = effectiveConstraints(p);

  const 帧齐备 = 成品.filter(s => /^data:/.test(String(s.关键帧图引用 || ''))).length;
  const 齐备率 = 成品.length ? 帧齐备 / 成品.length * 100 : 0;
  // 锚点覆盖率按分镜实际引用的资产口径算：被引用资产里已锁定且有锚点标识的占比
  const 被引用资产 = [...new Set(分镜.flatMap(s => s.关联资产ID列表 || []))];
  const 缺锚 = missingAnchors(p, 被引用资产);
  const 锚点率 = 被引用资产.length ? (被引用资产.length - 缺锚.length) / 被引用资产.length * 100 : 0;

  function 生成全部() {
    if (!分镜.length) return;
    // 同一分镜重生成沿用原成品ID，避免下游片段清单引用断链
    const 旧号 = new Map((p.storyboardItems || []).map(s => [s.分镜ID, s.成品ID]));
    p.storyboardItems = 分镜.map(s => 造成品(p, s, 帧表, 旧号.get(s.分镜ID)));
    ctx.commit(() => {});
    re();
    ctx.showToast(`已组装 ${p.storyboardItems.length} 条分镜成品：最终正向词 / 负面词 / 关键帧引用已写入`, { level: 'ok' });
  }

  function 重新生成(目标) {
    const shot = (p.shots || []).find(s => s.分镜ID === 目标.分镜ID);
    if (!shot) {
      ctx.showToast('该成品对应的分镜已不存在，无法重新生成', { level: 'warn' });
      return;
    }
    展开集.delete(目标.成品ID);
    const 新 = 造成品(p, shot, 帧表, 目标.成品ID);
    p.storyboardItems = (p.storyboardItems || []).map(x => (x.成品ID === 目标.成品ID ? 新 : x));
    ctx.commit(() => {});
    re();
    ctx.showToast(`已按最新分镜与提示词重生成：镜 ${shot.镜号}`, { level: 'ok' });
  }

  function 导出(format) {
    try {
      IO.exportStoryboard(p, format);
      ctx.showToast(`已导出：ai-drama-storyboard.${format === 'csv' ? 'csv' : 'json'}`, { level: 'ok' });
    } catch (e) {
      ctx.showToast(String((e && e.message) || '导出中止，未生成文件'), { level: 'error' });
    }
  }

  function 看快照(目标) {
    openPromptSnapshotViewer(目标.提示词快照 || {}, { closeBtnId: 'BTN-P010-91', copyBtnId: 'BTN-P010-92' });
    关弹层_绑定复制(目标);
  }

  function 关弹层_绑定复制(目标) {
    // C-12 关闭按钮默认落④不执行 handler，改登记①才能真关掉浮层
    btn('BTN-P010-91', { 类别: '①', handler: 关弹层, 关联FID: 'F-010' });
    btn('BTN-P010-92', {
      类别: '①',
      handler: () => {
        const 文本 = [目标.最终正向词, (目标.最终负面词 || []).join('；')].join('\n');
        const c = typeof navigator !== 'undefined' && navigator.clipboard;
        if (c && c.writeText) c.writeText(文本).catch(() => {});
      },
      toast: '已复制快照',
      关联FID: 'F-010'
    });
  }

  const 表格 = 成品.length
    ? renderDataTable(
      [
        { key: '镜号', label: '镜号' },
        { key: '画面描述', label: '画面描述' },
        { key: '关键帧', label: '关键帧' },
        { key: '对白', label: '对白' },
        { key: '时长', label: '时长' },
        { key: '最终正向词', label: '最终正向词' },
        { key: '最终负面词', label: '最终负面词' },
        { key: '操作', label: '操作' }
      ],
      成品.map((s, i) => ({
        镜号: `镜 ${s.镜号}`,
        画面描述: 截断(s.画面描述, 22),
        关键帧: `__KF_${i}__`,
        对白: 截断(s.对白, 16) || '—',
        时长: `${Number(s.时长) || 0} 秒`,
        最终正向词: `__POS_${i}__`,
        最终负面词: `__NEG_${i}__`,
        操作: `__ACT_${i}__`
      })),
      { raw: true, countBtnId: 'BTN-P010-06' }
    )
      .replace(/__KF_(\d+)__/g, (_, n) => {
        const s = 成品[Number(n)];
        return /^data:/.test(String(s.关键帧图引用 || ''))
          ? `<img src="${escapeHtml(s.关键帧图引用)}" alt="${escapeHtml(`镜 ${s.镜号} 首帧`)}" width="48" height="27" style="width:48px;height:27px;object-fit:cover;border-radius:4px;border:1px solid var(--hairline)">`
          : 标('chip--warn', '缺失帧');
      })
      .replace(/__POS_(\d+)__/g, (_, n) => {
        const s = 成品[Number(n)];
        const 全文 = String(s.最终正向词 || '');
        const 展开 = 展开集.has(s.成品ID);
        return `<div class="toolbar" style="gap:6px;flex-wrap:nowrap;max-width:230px">
          <span class="ellipsis" title="${escapeHtml(全文)}" style="max-width:170px">${escapeHtml(展开 ? 全文 : 截断(全文, 26))}</span>
          <button type="button" class="btn btn-ghost" data-btn-id="BTN-P010-${10 + Number(n)}">${展开 ? '收起' : '展开'}</button>
        </div>`;
      })
      .replace(/__NEG_(\d+)__/g, (_, n) => {
        const 词 = 成品[Number(n)].最终负面词 || [];
        const 前 = 词.slice(0, 2).map(w => 标('chip--lock', 截断(w, 12))).join('');
        return `<div style="display:flex;align-items:center;gap:4px;flex-wrap:nowrap;max-width:170px;overflow:hidden">${前 || '<span class="muted">无</span>'}${词.length > 2 ? 标('chip--accent', `+${词.length - 2}`) : ''}</div>`;
      })
      .replace(/__ACT_(\d+)__/g, (_, n) => `<div class="row-actions">
        <button type="button" class="btn btn-ghost" data-btn-id="BTN-P010-${40 + Number(n)}">查看快照</button>
        <button type="button" class="btn btn-ghost" data-btn-id="BTN-P010-${70 + Number(n)}">重新生成</button>
      </div>`)
    : renderEmptyState({
      title: '还没有分镜成品',
      message: 分镜.length
        ? `分镜已就绪 ${分镜.length} 条，点「生成分镜成品」把最终正向词 / 负面词 / 关键帧引用一次写全`
        : '请先在 F-005 生成分镜脚本',
      missing: 分镜.length ? ['storyboardItems 为空：尚未组装成品'] : ['shots 为空：F-005 分镜脚本未生成'],
      guideBtnId: 'BTN-P010-90',
      guideLabel: '请先在 F-005 生成分镜脚本',
      onGuide: () => ctx.setView('p005'),
      关联FID: 'F-010'
    });

  container.innerHTML = `<div class="page" data-page="p010">
    <header class="page-head">
      <div class="page-head__main">
        <h1 class="page-title">分镜生成</h1>
        <p class="page-desc">把每条分镜组装成可交付成品：最终正向词、最终负面词与关键帧引用一次写全</p>
      </div>
      <div class="page-head__actions">
        ${标('chip--accent', `成品 ${成品.length}`)}
        ${标('chip--lock', `锁定负面词 ${约束.锁定负面词数}`)}
        ${标('chip--lock', `锁定锚点 ${约束.锁定锚点数}`)}
      </div>
    </header>

    <section class="section glass glow-g1">
      <div class="section-head">
        <h2 class="section-title">组装与导出</h2>
        <p class="section-sub">成品按镜号升序；提示词快照在组装瞬间冻结，之后改词不回溯</p>
      </div>
      <div class="section-body">
        <div class="toolbar">
          <button type="button" class="btn btn-primary" data-btn-id="BTN-P010-01">生成分镜成品</button>
          <button type="button" class="btn btn-ghost" data-btn-id="BTN-P010-02">刷新</button>
          <div class="toolbar-group">
            <span class="muted">导出</span>
            <button type="button" class="btn btn-ghost" data-btn-id="BTN-P010-03">JSON</button>
            <button type="button" class="btn btn-ghost" data-btn-id="BTN-P010-04">CSV</button>
          </div>
          <span class="muted">导出为结构化文件，不含 API Key</span>
        </div>
        <div class="stat-row">
          <div class="stat">
            <div class="stat-num">${成品.length}</div>
            <div class="stat-label">分镜成品数</div>
            ${标(成品.length === 分镜.length && 分镜.length ? 'chip--ok' : 'chip--warn', 成品.length === 分镜.length && 分镜.length ? '与分镜数一致' : `分镜 ${分镜.length} 条`)}
          </div>
          <div class="stat">
            <div class="stat-num">${齐备率.toFixed(0)}%</div>
            <div class="stat-label">关键帧齐备率（${帧齐备}/${成品.length}）</div>
            ${标(齐备率 === 100 && 成品.length ? 'chip--ok' : 'chip--warn', 齐备率 === 100 && 成品.length ? '齐备' : '有缺失帧')}
          </div>
          <div class="stat">
            <div class="stat-num">${锚点率.toFixed(0)}%</div>
            <div class="stat-label">锚点覆盖率（被引用资产 ${被引用资产.length} 个 / 缺锚 ${缺锚.length} 个）</div>
            ${标(缺锚.length ? 'chip--warn' : 'chip--ok', 缺锚.length ? '存在无锚点资产' : '锚点齐备')}
          </div>
          <div class="stat">
            <div class="stat-num">${约束.锁定负面词数}</div>
            <div class="stat-label">负面词锁定词数（强制附加到每条成品）</div>
            ${标(约束.锁定负面词数 ? 'chip--lock' : 'chip--warn', 约束.锁定负面词数 ? '已锁定' : '未锁定')}
          </div>
        </div>
      </div>
    </section>

    <section class="section glass">
      <div class="section-head">
        <h2 class="section-title">分镜成品表</h2>
        <p class="section-sub">最终正向词可展开查看全文；最终负面词列前 2 个，其余以 +n 概括</p>
      </div>
      <div class="section-body">${表格}</div>
      <div class="section-actions">
        <button type="button" class="btn btn-primary" data-btn-id="BTN-P010-05">下一步：视频整合 →</button>
      </div>
    </section>
  </div>`;

  btn('BTN-P010-01', {
    类别: 分镜.length ? '①' : '②',
    禁用原因: '请先在 F-005 生成分镜脚本，暂无分镜可组装',
    handler: 生成全部,
    关联FID: 'F-010'
  });
  btn('BTN-P010-02', {
    类别: '①',
    handler: () => { re(); ctx.showToast('已刷新：成品与最新工程数据同步', { level: 'info' }); },
    关联FID: 'F-010'
  });
  btn('BTN-P010-03', {
    类别: 成品.length ? '①' : '②',
    禁用原因: '暂无分镜成品，请先生成后再导出',
    handler: () => 导出('json'),
    关联FID: 'F-010'
  });
  btn('BTN-P010-04', {
    类别: 成品.length ? '①' : '②',
    禁用原因: '暂无分镜成品，请先生成后再导出',
    handler: () => 导出('csv'),
    关联FID: 'F-010'
  });
  btn('BTN-P010-05', { 类别: '①', handler: () => ctx.setView('p011'), 关联FID: 'F-011' });

  成品.forEach((s, i) => {
    btn(`BTN-P010-${10 + i}`, {
      类别: '①',
      handler: () => {
        if (展开集.has(s.成品ID)) 展开集.delete(s.成品ID); else 展开集.add(s.成品ID);
        re();
      },
      关联FID: 'F-010'
    });
    btn(`BTN-P010-${40 + i}`, { 类别: '①', handler: () => 看快照(s), 关联FID: 'F-010' });
    btn(`BTN-P010-${70 + i}`, { 类别: '①', handler: () => 重新生成(s), 关联FID: 'F-010' });
  });
}
