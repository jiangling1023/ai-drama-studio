import { escapeHtml, renderEmptyState, renderFileImport } from '../components/index.js';
import { createTask, runTask } from '../core/gen-task.js';
import { demoFor, DEMO_MARK } from '../demo/demo-data.js';
import { DIAGNOSIS_CONFIG, buildRewriteAdvice, diagnose } from '../core/diagnosis.js';

const 示例创意 = [
  '雨夜里，一封不该出现的信把两个人重新拽回旧公寓。',
  '外卖员深夜送单，发现收件人是三年前失踪的姐姐。',
  '婚礼前夜，新娘收到一封落款是自己名字的讣告。'
];

// 生成中只做 UI 态：任务状态本身由 GenTask 落库，页面不另存一份状态
let 生成中 = false;

// 色板复用既有 status-tag tone-*，chip 只作语义标记，不新增第二套配色
const 色调 = { 'chip--ok': 'tone-ok', 'chip--warn': 'tone-degrade', 'chip--fail': 'tone-fail', 'chip--lock': 'tone-lock', 'chip--demo': 'tone-demo', 'chip--accent': '' };
const chip = (kind, text) => `<span class="chip ${kind} status-tag ${色调[kind] || ''}">${escapeHtml(text)}</span>`;

export function render(container, ctx, extra = {}) {
  const p = ctx.getProject() || {};
  const btn = (id, spec) => ctx.registerButton(id, spec);
  const re = () => ctx.setView('p001');

  const 剧本 = String(p.剧本原文 || '');
  const 有剧本 = !!剧本.trim();
  const 诊断 = 有剧本 ? diagnose(p, '剧本', 'script', 剧本) : null;
  const 建议 = 诊断 ? buildRewriteAdvice(诊断, p) : [];
  const cfg = DIAGNOSIS_CONFIG;
  // 未拆分场次时诊断器按 0 场次直接判不通过，此处单独标「待拆分」避免误读成指标达标
  const 可诊断 = !!诊断 && 诊断.总场次 > 0;
  const 场次总数 = 诊断 ? 诊断.总场次 : 0;

  const 取创意 = () => {
    const el = container.querySelector('[data-role="idea"]');
    return String(el ? el.value : (p.一句话创意 || '')).trim();
  };
  const 取粘贴 = () => {
    const el = container.querySelector('[data-role="paste"]');
    return String(el ? el.value : '');
  };

  function 写入剧本(text, 来源) {
    p.剧本原文 = String(text || '');
    p.剧本来源 = 来源;
    ctx.commit(() => {});
    re();
    ctx.showToast(来源 === '导入' ? '剧本已导入，可继续诊断与拆分' : '剧本已写入', { level: 'ok' });
  }

  async function 生成剧本() {
    const 创意 = 取创意();
    if (!创意) {
      ctx.showToast('请先输入一句话创意或导入剧本', { level: 'warn' });
      return;
    }
    if (生成中) return;
    p.一句话创意 = 创意;
    生成中 = true;
    re(); // 先渲染进行中态，再进入模型调用
    const task = createTask(p, { 任务类型: '剧本', 用途: '文本', 对象ID: 'script' });
    await runTask(p, task.任务ID);
    // 文本任务降级时产物即演示剧本：统一从任务产物取值，页面不自己编造内容
    const 产物 = String(task.输出引用 || '');
    p.剧本原文 = 产物 && 产物 !== DEMO_MARK ? 产物 : String(demoFor('剧本'));
    p.剧本来源 = '生成';
    ctx.commit(() => {});
    生成中 = false;
    re();
    ctx.showToast('剧本已生成，可继续诊断与拆分', { level: 'ok' });
  }

  function 清空创意() {
    const el = container.querySelector('[data-role="idea"]');
    if (el) el.value = '';
    p.一句话创意 = '';
    ctx.commit(() => {});
    re();
    ctx.showToast('已清空创意输入', { level: 'info' });
  }

  function 读文件(file) {
    if (!file) return;
    if (!/\.(txt|md)$/i.test(file.name || '')) {
      // 格式校验在读取前拦截，避免把二进制内容写进剧本原文
      ctx.showToast('仅支持 .txt / .md 纯文本文件，当前文件未导入，工程内容未改变', { level: 'warn' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => 写入剧本(String(reader.result || ''), '导入');
    reader.onerror = () => ctx.showToast('文件读取失败，工程内容未改变', { level: 'error' });
    reader.readAsText(file, 'utf-8');
  }

  const 旁白占比 = 诊断 ? 诊断.旁白占比 : 0;
  const 台词覆盖率 = 诊断 ? 诊断.台词覆盖率 : 0;
  const 平均条数 = 场次总数 ? 诊断.动作描述条数 / 场次总数 : 0;
  const 平均字数 = 场次总数 ? 诊断.动作描述字数 / 场次总数 : 0;
  const 密度达标 = !!诊断 && 场次总数 > 0 && 诊断.密度达标场次 === 场次总数;

  const 旁白chip = 可诊断
    ? chip(旁白占比 <= cfg.旁白占比上限 ? 'chip--ok' : 'chip--warn', 旁白占比 <= cfg.旁白占比上限 ? '达标' : '超标')
    : chip('chip--warn', '待拆分');
  const 覆盖chip = 可诊断
    ? chip(台词覆盖率 >= cfg.台词覆盖率下限 ? 'chip--ok' : 'chip--warn', 台词覆盖率 >= cfg.台词覆盖率下限 ? '达标' : '偏低')
    : chip('chip--warn', '待拆分');
  const 密度chip = 可诊断 ? chip(密度达标 ? 'chip--ok' : 'chip--warn', 密度达标 ? '达标' : '待补动作') : chip('chip--warn', '待拆分');
  const 等级chip = 诊断 ? chip(诊断.诊断等级 === '通过' ? 'chip--ok' : (诊断.诊断等级 === '不通过' ? 'chip--fail' : 'chip--warn'), 诊断.诊断等级) : '';

  const 空态 = renderEmptyState({
    title: '暂无剧本',
    message: '先用一句话创意生成，或导入已有剧本，才能进入诊断与拆分',
    missing: ['剧本原文为空：生成或导入任选其一', '剧本为空时诊断指标不参与计算'],
    guideBtnId: 'BTN-P001-07',
    guideLabel: '去输入创意',
    onGuide: () => {
      const el = container.querySelector('[data-role="idea"]');
      if (el && typeof el.focus === 'function') el.focus();
      ctx.showToast('输入一句话创意后点「生成剧本」', { level: 'info' });
    },
    关联FID: 'F-001'
  });

  const 导入区 = renderFileImport({
    btnId: 'BTN-P001-06',
    label: '拖放 .txt / .md 剧本到此处，或点击选择文件',
    buttonLabel: '选择文件',
    errorToast: '请选择 .txt / .md 纯文本文件',
    onPick: () => {
      const picker = container.querySelector('.import-drop [data-file-import]');
      if (picker && typeof picker.click === 'function') picker.click();
    },
    关联FID: 'F-001'
  });

  const 建议列表 = 建议.length
    ? `<ul class="list">${建议.map(a => `<li class="list-item">
        <div class="list-item__main">
          <div class="mono ellipsis">原句：${escapeHtml(a.原句)}</div>
          <div>建议：${escapeHtml(a.建议替换.文本)}</div>
          <div class="list-item__meta muted">理由：${escapeHtml(a.理由)}</div>
        </div>
      </li>`).join('')}</ul>`
    : '<p class="muted">当前没有命中旁白句，未产生改写建议</p>';

  container.innerHTML = `<div class="page" data-page="p001">
    <header class="page-head">
      <div class="page-head__main">
        <h1 class="page-title">一句话生成剧本</h1>
        <p class="page-desc">用一句话起意，或导入已有剧本，进入创作</p>
      </div>
      <div class="page-head__actions">
        <button type="button" class="btn btn-ghost" data-btn-id="BTN-P001-90">跳转导演</button>
      </div>
    </header>

    <section class="section glass glow-g1">
      <div class="section-head">
        <h2 class="section-title">创意输入</h2>
        <p class="section-sub">写清主角、冲突与钩子，模型按六项大纲扩写成可拍剧本</p>
      </div>
      <div class="section-body">
        <div class="field">
          <label class="field-label" for="p001-idea">一句话创意</label>
          <div class="field-control">
            <textarea id="p001-idea" class="field-input" rows="3" data-role="idea" data-commit="p001-idea"
              placeholder="${escapeHtml(示例创意[0])}">${escapeHtml(p.一句话创意 || '')}</textarea>
          </div>
          <p class="field-hint">示例创意（点击填入）：</p>
          <div class="toolbar">
            ${示例创意.map((idea, i) => `<button type="button" class="chip chip--accent" data-btn-id="BTN-P001-03${i ? 'abc'[i] : ''}">${escapeHtml(idea.slice(0, 14))}…</button>`).join('')}
          </div>
        </div>
        <div class="toolbar">
          <button type="button" class="btn btn-primary" data-btn-id="BTN-P001-01">生成剧本</button>
          <button type="button" class="btn btn-ghost" data-btn-id="BTN-P001-02">清空</button>
          ${生成中 ? chip('chip--accent', '生成中…') : ''}
          ${p.剧本来源 ? chip('chip--demo', '来源：' + p.剧本来源) : ''}
        </div>
      </div>
    </section>

    <section class="section glass">
      <div class="section-head">
        <h2 class="section-title">导入剧本</h2>
        <p class="section-sub">支持 .txt / .md 纯文本，导入后与原生成剧本同等参与诊断</p>
      </div>
      <div class="section-body">
        ${导入区}
        <div class="field">
          <label class="field-label" for="p001-paste">或直接粘贴剧本正文</label>
          <div class="field-control">
            <textarea id="p001-paste" class="field-input" rows="4" data-role="paste"
              placeholder="第 1 集&#10;第1场 旧公寓 · 雨夜&#10;林夏：门没锁，你直接进来吧。"></textarea>
          </div>
        </div>
        <div class="toolbar">
          <button type="button" class="btn btn-primary" data-btn-id="BTN-P001-04">导入</button>
          <span class="muted">当前剧本来源：${escapeHtml(p.剧本来源 || '未设置')}</span>
        </div>
      </div>
    </section>

    <section class="section glass">
      <div class="section-head">
        <h2 class="section-title">剧本预览与编辑</h2>
        <p class="section-sub">左侧可编辑原文，右侧按 diag-a15-v1 口径实时诊断</p>
      </div>
      <div class="section-body">
        ${有剧本 ? `<div class="grid-2">
          <div class="field">
            <label class="field-label" for="p001-script">剧本原文</label>
            <div class="field-control">
              <textarea id="p001-script" class="field-input" rows="16" data-role="script" data-commit="p001-script">${escapeHtml(剧本)}</textarea>
            </div>
            <p class="field-hint">失焦即写回工程；改动后诊断按最新原文重算</p>
          </div>
          <div class="glass">
            <div class="toolbar">
              <h3 class="section-title">诊断摘要</h3>
              ${等级chip}
              ${chip('chip--demo', '口径 ' + 诊断.诊断口径版本)}
            </div>
            <div class="stat-row">
              <div class="stat">
                <div class="stat-num">${旁白占比.toFixed(1)}%</div>
                <div class="stat-label">旁白占比 · 阈值 ≤ ${cfg.旁白占比上限}%</div>
                ${旁白chip}
              </div>
              <div class="stat">
                <div class="stat-num">${台词覆盖率.toFixed(0)}%</div>
                <div class="stat-label">台词覆盖率 · 阈值 ≥ ${cfg.台词覆盖率下限}%</div>
                ${覆盖chip}
              </div>
              <div class="stat">
                <div class="stat-num">${平均条数.toFixed(1)} 条 / ${平均字数.toFixed(0)} 字</div>
                <div class="stat-label">每场次动作描述 · 阈值 ≥ ${cfg.每场次动作描述条数下限} 条且 ≥ ${cfg.每场次动作描述字数下限} 字</div>
                ${密度chip}
              </div>
            </div>
            ${可诊断 ? '' : '<p class="muted">当前还未拆分场次（F-002），诊断按 0 场次判不通过；拆分后指标才可判定。</p>'}
            <div class="divider"></div>
            <h4 class="section-title">改写建议</h4>
            ${建议列表}
          </div>
        </div>` : 空态}
      </div>
      <div class="section-actions">
        <button type="button" class="btn btn-primary" data-btn-id="BTN-P001-05">下一步：拆分剧本 →</button>
      </div>
    </section>
  </div>`;

  // 点击事件统一走 data-btn-id 委托，此处只登记行为与禁用原因
  btn('BTN-P001-90', { 类别: '①', handler: () => ctx.setView('p012'), 关联FID: 'F-012' });
  btn('BTN-P001-01', {
    类别: 取创意() ? '①' : '②',
    禁用原因: '请先输入一句话创意或导入剧本',
    handler: 生成剧本,
    关联FID: 'F-001'
  });
  btn('BTN-P001-02', { 类别: '①', handler: 清空创意, 关联FID: 'F-001' });
  示例创意.forEach((idea, i) => {
    btn(`BTN-P001-03${i ? 'abc'[i] : ''}`, {
      类别: '①',
      handler: () => {
        p.一句话创意 = idea;
        ctx.commit(() => {});
        re();
        ctx.showToast('已填入示例创意', { level: 'info' });
      },
      关联FID: 'F-001'
    });
  });
  btn('BTN-P001-04', {
    类别: 取粘贴().trim() ? '①' : '②',
    禁用原因: '请先粘贴剧本内容或选择文件',
    handler: () => {
      const text = 取粘贴();
      if (!text.trim()) {
        ctx.showToast('请先粘贴剧本内容或选择文件', { level: 'warn' });
        return;
      }
      写入剧本(text, '导入');
    },
    关联FID: 'F-001'
  });
  btn('BTN-P001-05', { 类别: '①', handler: () => ctx.setView('p002'), 关联FID: 'F-002' });

  // 输入不重渲染，只重登记按钮类别，保证空输入时点下去复述的是禁用原因
  const 同步生成按钮 = () => {
    btn('BTN-P001-01', {
      类别: 取创意() ? '①' : '②',
      禁用原因: '请先输入一句话创意或导入剧本',
      handler: 生成剧本,
      关联FID: 'F-001'
    });
  };
  const 同步导入按钮 = () => {
    btn('BTN-P001-04', {
      类别: 取粘贴().trim() ? '①' : '②',
      禁用原因: '请先粘贴剧本内容或选择文件',
      handler: () => {
        const text = 取粘贴();
        if (!text.trim()) {
          ctx.showToast('请先粘贴剧本内容或选择文件', { level: 'warn' });
          return;
        }
        写入剧本(text, '导入');
      },
      关联FID: 'F-001'
    });
  };

  ctx.registerAction('commit:p001-idea', el => { p.一句话创意 = el.value; });
  ctx.registerAction('commit:p001-script', el => { p.剧本原文 = el.value; });

  const 创意域 = container.querySelector('[data-role="idea"]');
  if (创意域) 创意域.addEventListener('input', () => { p.一句话创意 = 创意域.value; 同步生成按钮(); });
  const 粘贴域 = container.querySelector('[data-role="paste"]');
  if (粘贴域) 粘贴域.addEventListener('input', 同步导入按钮);
  const 剧本域 = container.querySelector('[data-role="script"]');
  if (剧本域) {
    剧本域.addEventListener('change', () => {
      p.剧本原文 = 剧本域.value;
      ctx.commit(() => {});
      re();
    });
  }

  const 文件域 = container.querySelector('[data-file-import]');
  if (文件域) 文件域.addEventListener('change', () => 读文件(文件域.files && 文件域.files[0]));
  const 拖放区 = container.querySelector('.import-drop');
  if (拖放区) {
    拖放区.addEventListener('dragover', e => e.preventDefault());
    拖放区.addEventListener('drop', e => {
      e.preventDefault();
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) 读文件(f);
    });
  }
}
