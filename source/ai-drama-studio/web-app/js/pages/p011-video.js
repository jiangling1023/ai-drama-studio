import { escapeHtml, openConfirmModal, renderDataTable, renderEmptyState } from '../components/index.js';
import { buildAssembly, defaultExportConfig, getPreviewData } from '../core/video-assembly.js';
import { SHOT_TRANSITION } from '../constants.js';
import * as IO from '../io.js';

// 预览序号是纯 UI 态；片段与导出配置一律落 videoAssembly
let 预览序 = 0;

const 帧率选项 = [24, 25, 30];
const 分辨率选项 = ['1920x1080', '1080x1920', '2560x1440'];
const 顺序选项 = ['按场次→镜号升序', '自定义'];

const 色调 = {
  'chip--ok': 'tone-ok', 'chip--warn': 'tone-degrade', 'chip--fail': 'tone-fail',
  'chip--lock': 'tone-lock', 'chip--demo': 'tone-demo', 'chip--accent': '', 'chip--muted': 'tone-muted'
};
const 标 = (kind, text) => `<span class="chip ${kind} status-tag ${色调[kind] ?? ''}">${escapeHtml(text)}</span>`;
const 关弹层 = () => {
  const el = typeof document !== 'undefined' ? document.getElementById('modalRoot') : null;
  if (el) el.innerHTML = '';
};
const 时长文本 = 秒 => {
  const s = Math.max(0, Math.round(Number(秒) || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export function render(container, ctx, extra = {}) {
  const p = ctx.getProject() || {};
  const btn = (id, spec) => ctx.registerButton(id, spec);
  const re = () => ctx.setView('p011');

  const 片段 = (p.videoAssembly && p.videoAssembly.片段清单) || [];
  const 配置 = (p.videoAssembly && p.videoAssembly.导出配置) || defaultExportConfig();
  // 旧工程里存的旧文案「按镜号升序」按同义处理，避免下拉回落到第一项而看不出原值
  const 顺序值 = 配置.片段顺序 === '按镜号升序' ? '按场次→镜号升序' : 配置.片段顺序;
  const 成品 = p.storyboardItems || [];
  const 分镜表 = new Map((p.shots || []).map(s => [s.分镜ID, s]));
  const 场次序 = new Map((p.scenes || []).map((s, i) => [s.场次ID, Number(s.场次序号) || i + 1]));
  // 跨场次镜号会重号，显示为 场次-镜 便于与成品表和分镜脚本对齐
  const 镜号文本 = (分镜ID, 自带镜号) => {
    const s = 分镜表.get(分镜ID);
    const 序号 = s ? 场次序.get(s.场次ID) : undefined;
    const 镜号 = Number(s ? s.镜号 : 自带镜号) || 0;
    return 序号 ? `${序号}-${镜号}` : (镜号 ? `镜 ${镜号}` : '—');
  };

  if (预览序 >= 片段.length) 预览序 = 0;
  const 当前段 = getPreviewData(p, 预览序);

  const 总时长 = 片段.reduce((n, c) => n + (Number(c.时长) || 0), 0);
  const 帧率 = Number(配置.帧率) || 24;
  const 帧数 = Math.round(总时长 * 帧率);

  // 片段顺序以数组下标为唯一真值，改序后统一重编号，避免出现重复顺序号
  function 重编号() {
    if (!p.videoAssembly) return;
    p.videoAssembly.片段清单.forEach((c, i) => { c.顺序号 = i + 1; });
  }

  function 生成清单() {
    const assembly = buildAssembly(p);
    // 生成即按成品表顺序写入，默认转场类型同步到配置
    ctx.commit(() => {});
    re();
    ctx.showToast(`已生成 ${assembly.片段清单.length} 个片段（结构化编排，不产出视频文件）`, { level: 'ok' });
  }

  function 按分镜顺序重排() {
    if (!p.videoAssembly) return;
    // 镜号在场次内唯一、跨场次会重号，排序键必须是 场次序号 → 镜号，与 F-010 成品表一致
    const 键 = id => {
      const s = 分镜表.get(id);
      // 反查不到分镜时两项都退化为 0，等价于保持原有相对顺序（稳定排序）
      return {
        场次: s ? (场次序.get(s.场次ID) ?? 0) : 0,
        镜号: s ? Number(s.镜号) || 0 : 0
      };
    };
    p.videoAssembly.片段清单.sort((a, b) => {
      const ka = 键(a.分镜ID), kb = 键(b.分镜ID);
      return ka.场次 - kb.场次 || ka.镜号 - kb.镜号;
    });
    重编号();
    if (p.videoAssembly.导出配置) p.videoAssembly.导出配置.片段顺序 = '按场次→镜号升序';
    预览序 = 0;
    ctx.commit(() => {});
    re();
    ctx.showToast(`已按 场次序号 → 镜号 重排 ${p.videoAssembly.片段清单.length} 个片段`, { level: 'ok' });
  }

  function 移动(i, 方向) {
    if (!p.videoAssembly) return;
    const 清单 = p.videoAssembly.片段清单;
    const j = i + 方向;
    if (j < 0 || j >= 清单.length) return;
    const 临时 = 清单[i];
    清单[i] = 清单[j];
    清单[j] = 临时;
    重编号();
    if (p.videoAssembly.导出配置) p.videoAssembly.导出配置.片段顺序 = '自定义';
    预览序 = j;
    ctx.commit(() => {});
    re();
    ctx.showToast(`片段 ${i + 1} 已${方向 < 0 ? '上移' : '下移'}到第 ${j + 1} 位`, { level: 'info' });
  }

  const 取 = sel => {
    const el = container.querySelector(sel);
    return el ? String(el.value) : '';
  };

  function 保存配置() {
    if (!p.videoAssembly) return;
    const 原名 = 取('[data-role="name-rule"]').trim() || '{顺序号}_{分镜ID}';
    p.videoAssembly.导出配置 = {
      帧率: Number(取('[data-role="fps"]')) || 24,
      分辨率: 取('[data-role="resolution"]') || '1920x1080',
      // 命名规则只校验非空，占位符由使用方替换，页面不改写用户填写的原文
      输出命名规则: 原名,
      片段顺序: 取('[data-role="order"]') || '按场次→镜号升序',
      默认转场类型: 取('[data-role="transition"]') || 配置.默认转场类型
    };
    ctx.commit(() => {});
    re();
    ctx.showToast('导出配置已保存', { level: 'ok' });
  }

  function 导出(format) {
    try {
      IO.exportAssembly(p, format);
      ctx.showToast(`已导出：ai-drama-assembly.${format === 'csv' ? 'csv' : 'json'}`, { level: 'ok' });
    } catch (e) {
      ctx.showToast(String((e && e.message) || '导出中止，未生成文件'), { level: 'error' });
    }
  }

  const 清单表 = 片段.length
    ? renderDataTable(
      [
        { key: '顺序号', label: '顺序号' },
        { key: '分镜ID', label: '分镜ID' },
        { key: '镜号', label: '镜号（场次-镜）' },
        { key: '关键帧', label: '关键帧' },
        { key: '时长', label: '时长' },
        { key: '转场', label: '转场类型' },
        { key: '画面说明', label: '画面说明' },
        { key: '操作', label: '操作' }
      ],
      片段.map((c, i) => ({
        顺序号: `#${c.顺序号}`,
        分镜ID: c.分镜ID,
        镜号: 镜号文本(c.分镜ID, c.镜号),
        关键帧: `__KF_${i}__`,
        时长: `${Number(c.时长) || 0} 秒`,
        转场: `__TR_${i}__`,
        画面说明: String(c.画面说明 || '').length > 40 ? `${String(c.画面说明).slice(0, 40)}…` : String(c.画面说明 || '—'),
        操作: `__ACT_${i}__`
      })),
      { raw: true, countBtnId: 'BTN-P011-08' }
    )
      .replace(/__KF_(\d+)__/g, (_, n) => {
        const c = 片段[Number(n)];
        return /^data:/.test(String(c.关键帧引用 || ''))
          ? `<img src="${escapeHtml(c.关键帧引用)}" alt="${escapeHtml(`片段 ${c.顺序号} 关键帧`)}" width="48" height="27" style="width:48px;height:27px;object-fit:cover;border-radius:4px;border:1px solid var(--hairline)">`
          : 标('chip--warn', '缺失帧');
      })
      .replace(/__TR_(\d+)__/g, (_, n) => {
        const i = Number(n);
        // 下拉自身承载交互（change 即写回），仍按契约登记按钮位，保证可点击元素全覆盖
        return `<select class="field-input" style="width:110px" data-role="tr-${i}" data-btn-id="BTN-P011-${10 + i}" aria-label="片段 ${i + 1} 转场类型">${
          SHOT_TRANSITION.map(t => `<option value="${escapeHtml(t)}"${片段[i].转场类型 === t ? ' selected' : ''}>${escapeHtml(t)}</option>`).join('')
        }</select>`;
      })
      .replace(/__ACT_(\d+)__/g, (_, n) => `<div class="row-actions">
        <button type="button" class="btn btn-ghost" data-btn-id="BTN-P011-${30 + Number(n)}">上移</button>
        <button type="button" class="btn btn-ghost" data-btn-id="BTN-P011-${50 + Number(n)}">下移</button>
      </div>`)
    : renderEmptyState({
      title: '还没有片段清单',
      message: 成品.length
        ? `分镜成品已有 ${成品.length} 条，点「生成片段清单」按成品表顺序编排`
        : '请先在 F-010 生成分镜成品，再回到本页编排片段',
      missing: 成品.length ? ['videoAssembly 为空：尚未生成片段清单'] : ['storyboardItems 为空：F-010 分镜成品未生成'],
      guideBtnId: 'BTN-P011-90',
      guideLabel: 成品.length ? '生成片段清单' : '前往 F-010 生成分镜成品',
      onGuide: 成品.length ? 生成清单 : () => ctx.setView('p010'),
      关联FID: 'F-011'
    });

  const 预览区 = 当前段
    ? `<div class="toolbar">
        <button type="button" class="btn btn-ghost" data-btn-id="BTN-P011-04">上一段</button>
        <span class="value-pill">${预览序 + 1} / ${片段.length}</span>
        <button type="button" class="btn btn-ghost" data-btn-id="BTN-P011-05">下一段</button>
        ${标('chip--accent', `顺序号 ${当前段.顺序号}`)}
      </div>
      <div class="glass" style="display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:16px;align-items:start">
        <div style="background:rgba(10,12,18,.5);border-radius:10px;border:1px solid var(--hairline);overflow:hidden;min-height:180px;display:grid;place-items:center">
          ${/^data:/.test(String(当前段.关键帧引用 || ''))
            ? `<img src="${escapeHtml(当前段.关键帧引用)}" alt="${escapeHtml(`片段 ${当前段.顺序号} 预览`)}" style="display:block;width:100%;height:auto">`
            : '<p class="muted">该片段无关键帧图，仅可查看结构化信息</p>'}
        </div>
        <div class="kv" style="grid-template-columns:1fr">
          <div class="kv-item"><span class="kv-key">分镜ID</span><span class="kv-val mono">${escapeHtml(当前段.分镜ID)}</span></div>
          <div class="kv-item"><span class="kv-key">时长</span><span class="kv-val">${Number(当前段.时长) || 0} 秒</span></div>
          <div class="kv-item"><span class="kv-key">转场</span><span class="kv-val">${escapeHtml(当前段.转场类型 || '—')}</span></div>
          <div class="kv-item"><span class="kv-key">画面说明</span><span class="kv-val" style="white-space:normal">${escapeHtml(当前段.画面说明 || '—')}</span></div>
        </div>
      </div>`
    : '<p class="muted">暂无可预览片段：先生成片段清单，再按顺序逐段预览关键帧与片段信息。</p>';

  const 配置区 = `<div class="grid-2">
    <div class="field">
      <label class="field-label" for="p011-fps">帧率</label>
      <div class="field-control">
        <select id="p011-fps" class="field-input" data-role="fps">${帧率选项.map(f => `<option value="${f}"${Number(配置.帧率) === f ? ' selected' : ''}>${f} fps</option>`).join('')}</select>
      </div>
      <p class="field-hint">帧数估算 = 总时长 × 帧率</p>
    </div>
    <div class="field">
      <label class="field-label" for="p011-resolution">分辨率</label>
      <div class="field-control">
        <select id="p011-resolution" class="field-input" data-role="resolution">${分辨率选项.map(r => `<option value="${escapeHtml(r)}"${配置.分辨率 === r ? ' selected' : ''}>${escapeHtml(r)}</option>`).join('')}</select>
      </div>
      <p class="field-hint">只写入导出配置，不改变已有关键帧图片尺寸</p>
    </div>
    <div class="field">
      <label class="field-label" for="p011-name">输出命名规则</label>
      <div class="field-control">
        <input id="p011-name" class="field-input" data-role="name-rule" value="${escapeHtml(配置.输出命名规则 || '{顺序号}_{分镜ID}')}">
      </div>
      <p class="field-hint">可用占位符：{顺序号} / {分镜ID} / {镜号}</p>
    </div>
    <div class="field">
      <label class="field-label" for="p011-order">片段顺序</label>
      <div class="field-control">
        <select id="p011-order" class="field-input" data-role="order">${顺序选项.map(o => `<option value="${escapeHtml(o)}"${顺序值 === o ? ' selected' : ''}>${escapeHtml(o)}</option>`).join('')}</select>
      </div>
      <p class="field-hint">自定义顺序通过清单里的「上移 / 下移」调整</p>
    </div>
    <div class="field">
      <label class="field-label" for="p011-transition">默认转场类型</label>
      <div class="field-control">
        <select id="p011-transition" class="field-input" data-role="transition">${SHOT_TRANSITION.map(t => `<option value="${escapeHtml(t)}"${配置.默认转场类型 === t ? ' selected' : ''}>${escapeHtml(t)}</option>`).join('')}</select>
      </div>
      <p class="field-hint">仅对之后新生成的片段生效，已生成片段在清单内单独修改</p>
    </div>
  </div>`;

  container.innerHTML = `<div class="page" data-page="p011">
    <header class="page-head">
      <div class="page-head__main">
        <h1 class="page-title">视频整合</h1>
        <p class="page-desc">把分镜成品编排成片段清单，配置导出参数并按顺序逐段预览</p>
      </div>
      <div class="page-head__actions">
        ${标('chip--accent', `片段 ${片段.length}`)}
        ${标('chip--demo', `时长 ${时长文本(总时长)}`)}
      </div>
    </header>

    <div class="alert-bar" data-dismissible="false">本模块只做结构化编排：产出片段清单、导出配置与顺序预览，不生成 mp4 / webm 视频文件。</div>

    <section class="section glass glow-g1">
      <div class="section-head">
        <h2 class="section-title">片段清单</h2>
        <p class="section-sub">片段顺序以清单下行为准；转场类型可逐段下拉修改</p>
      </div>
      <div class="section-body">
        <div class="toolbar">
          <button type="button" class="btn btn-primary" data-btn-id="BTN-P011-02">生成片段清单</button>
          <button type="button" class="btn btn-ghost" data-btn-id="BTN-P011-01">按分镜顺序重排</button>
          <span class="muted">生成会按成品表顺序全量重建清单，现有自定义顺序会被覆盖</span>
        </div>
        <div class="stat-row">
          <div class="stat">
            <div class="stat-num">${片段.length}</div>
            <div class="stat-label">片段数（分镜成品 ${成品.length} 条）</div>
            ${标(片段.length && 片段.length === 成品.length ? 'chip--ok' : 'chip--warn', 片段.length && 片段.length === 成品.length ? '与成品数一致' : '片段数不足')}
          </div>
          <div class="stat">
            <div class="stat-num">${时长文本(总时长)}</div>
            <div class="stat-label">总时长（${总时长} 秒）</div>
          </div>
          <div class="stat">
            <div class="stat-num">${帧数}</div>
            <div class="stat-label">帧数估算（${总时长} 秒 × ${帧率} fps）</div>
          </div>
        </div>
        ${清单表}
      </div>
    </section>

    <section class="section glass">
      <div class="section-head">
        <h2 class="section-title">导出配置</h2>
        <p class="section-sub">配置只决定导出物内容，不触达任何视频编码或音画合成</p>
      </div>
      <div class="section-body">
        ${配置区}
        <div class="toolbar">
          <button type="button" class="btn btn-primary" data-btn-id="BTN-P011-03">保存配置</button>
          <span class="muted">保存写入 videoAssembly.导出配置</span>
        </div>
      </div>
    </section>

    <section class="section glass">
      <div class="section-head">
        <h2 class="section-title">顺序预览</h2>
        <p class="section-sub">按片段清单顺序逐段查看，首尾段按钮给禁用原因</p>
      </div>
      <div class="section-body">${预览区}</div>
    </section>

    <section class="section glass">
      <div class="section-head">
        <h2 class="section-title">导出</h2>
        <p class="section-sub">导出结构化文件（JSON / CSV），可被第三方剪辑工具读取</p>
      </div>
      <div class="section-body">
        <div class="toolbar">
          <button type="button" class="btn btn-primary" data-btn-id="BTN-P011-06">导出片段清单 JSON</button>
          <button type="button" class="btn btn-ghost" data-btn-id="BTN-P011-07">导出 CSV</button>
          <span class="muted">不提供视频文件下载</span>
        </div>
      </div>
    </section>
  </div>`;

  btn('BTN-P011-02', {
    类别: 成品.length ? '①' : '②',
    禁用原因: '暂无分镜成品，请先到 F-010 生成分镜成品',
    handler: 生成清单,
    关联FID: 'F-011'
  });
  btn('BTN-P011-01', {
    类别: 片段.length ? '①' : '②',
    禁用原因: '暂无片段清单，请先生成片段清单',
    handler: () => {
      openConfirmModal({
        title: '按分镜顺序重排',
        message: `将按 场次序号 → 镜号 的顺序重排 ${片段.length} 个片段并重新编号，现有自定义顺序会丢失。`,
        变更条目ID: 片段.map(c => `#${c.顺序号} ${c.分镜ID}`),
        confirmLabel: '确认重排',
        confirmBtnId: 'BTN-P011-01a',
        cancelBtnId: 'BTN-P011-01b',
        onConfirm: () => { 关弹层(); 按分镜顺序重排(); },
        关联FID: 'F-011'
      });
      // C-04 取消默认落④不会执行 handler，改登记①才能真关掉浮层且零变更
      btn('BTN-P011-01b', { 类别: '①', handler: () => { 关弹层(); ctx.showToast('已取消重排，片段顺序未改变', { level: 'info' }); }, 关联FID: 'F-011' });
    },
    关联FID: 'F-011'
  });
  btn('BTN-P011-03', {
    类别: p.videoAssembly ? '①' : '②',
    禁用原因: '尚无片段清单，请先生成片段清单再保存配置',
    handler: 保存配置,
    关联FID: 'F-011'
  });
  btn('BTN-P011-04', {
    类别: 当前段 && 预览序 > 0 ? '①' : '②',
    禁用原因: 当前段 ? '已是第一段，无法继续上一段' : '暂无可预览片段',
    handler: () => { 预览序 = Math.max(0, 预览序 - 1); re(); },
    关联FID: 'F-011'
  });
  btn('BTN-P011-05', {
    类别: 当前段 && 预览序 < 片段.length - 1 ? '①' : '②',
    禁用原因: 当前段 ? '已是最后一段，无法继续下一段' : '暂无可预览片段',
    handler: () => { 预览序 = Math.min(片段.length - 1, 预览序 + 1); re(); },
    关联FID: 'F-011'
  });
  btn('BTN-P011-06', {
    类别: 片段.length ? '①' : '②',
    禁用原因: '暂无片段清单，请先生成后再导出',
    handler: () => 导出('json'),
    关联FID: 'F-011'
  });
  btn('BTN-P011-07', {
    类别: 片段.length ? '①' : '②',
    禁用原因: '暂无片段清单，请先生成后再导出',
    handler: () => 导出('csv'),
    关联FID: 'F-011'
  });

  片段.forEach((c, i) => {
    // 下拉的登记位：交互由 change 写回，点击本身即打开选项，不再叠加动作
    btn(`BTN-P011-${10 + i}`, { 类别: '①', handler: () => {}, 关联FID: 'F-011' });
    btn(`BTN-P011-${30 + i}`, {
      类别: i > 0 ? '①' : '②',
      禁用原因: '已是第一个片段，无法上移',
      handler: () => 移动(i, -1),
      关联FID: 'F-011'
    });
    btn(`BTN-P011-${50 + i}`, {
      类别: i < 片段.length - 1 ? '①' : '②',
      禁用原因: '已是最后一个片段，无法下移',
      handler: () => 移动(i, 1),
      关联FID: 'F-011'
    });
    const 域 = container.querySelector(`[data-role="tr-${i}"]`);
    if (域) {
      域.addEventListener('change', () => {
        const 目标 = (p.videoAssembly.片段清单 || [])[i];
        if (!目标) return;
        目标.转场类型 = 域.value;
        if (p.videoAssembly.导出配置) p.videoAssembly.导出配置.片段顺序 = '自定义';
        ctx.commit(() => {});
        re();
        ctx.showToast(`片段 ${i + 1} 转场已改为「${域.value}」`, { level: 'ok' });
      });
    }
  });
}
