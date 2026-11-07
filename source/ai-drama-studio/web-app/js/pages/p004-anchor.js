import { escapeHtml } from '../components/index.js';

// 仅选中项为 UI 态；锚点字段与锁定状态一律落 assets
let 选中资产ID = '';

// 色板复用既有 status-tag tone-*，不新增第二套配色
const 色调 = { 'chip--ok': 'tone-ok', 'chip--warn': 'tone-degrade', 'chip--fail': 'tone-fail', 'chip--lock': 'tone-lock', 'chip--demo': 'tone-demo', 'chip--accent': '' };
const 标 = (kind, text) => `<span class="chip ${kind} status-tag ${色调[kind] || ''}">${escapeHtml(text)}</span>`;

export function render(container, ctx, extra = {}) {
  const p = ctx.getProject() || {};
  const btn = (id, spec) => ctx.registerButton(id, spec);
  const re = () => ctx.setView('p004');

  const 全部资产 = p.assets || [];
  // 人物优先：锚点是人物资产专用能力，把人物排在最前减少找资产成本
  const 排序后 = 全部资产.slice().sort((a, b) => {
    const 人物序 = x => (x.类型 === '人物' ? 0 : 1);
    return 人物序(a) - 人物序(b) || (a.创建序 || 0) - (b.创建序 || 0);
  });
  const 人物资产 = 排序后.filter(a => a.类型 === '人物');
  const 已锁定数 = 人物资产.filter(a => a.锁定状态 === '已锁定' && a.锚点标识).length;

  if (!选中资产ID || !全部资产.some(a => a.资产ID === 选中资产ID)) {
    选中资产ID = (排序后[0] && 排序后[0].资产ID) || '';
  }
  const 当前 = 全部资产.find(a => a.资产ID === 选中资产ID) || null;
  const 当前是人物 = !!当前 && 当前.类型 === '人物';
  const 有外貌 = !!当前 && !!String(当前.外貌描述 || '').trim();

  const 缺失清单 = 人物资产.filter(a => a.锁定状态 !== '已锁定' || !a.锚点标识);

  function 切换锁定() {
    const 目标 = (p.assets || []).find(a => a.资产ID === 选中资产ID);
    if (!目标) return;
    if (目标.锁定状态 !== '已锁定' && !String(目标.外貌描述 || '').trim()) {
      // 锚点没有外貌描述时锁定也不生效，此处直接拦下并给出可执行原因
      ctx.showToast('请先填写外貌描述，否则锚点无法生效', { level: 'warn' });
      return;
    }
    目标.锁定状态 = 目标.锁定状态 === '已锁定' ? '未锁定' : '已锁定';
    ctx.commit(() => {});
    re();
    ctx.showToast(目标.锁定状态 === '已锁定' ? '锚点已锁定，此后新任务自动携带' : '锚点已解锁', { level: 'ok' });
  }

  function 读参考图(file) {
    if (!file) return;
    if (!/^image\//.test(file.type || '')) {
      ctx.showToast('参考图仅支持图片文件，当前文件未写入，工程内容未改变', { level: 'warn' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const 目标 = (p.assets || []).find(a => a.资产ID === 选中资产ID);
      if (!目标) return;
      目标.参考图引用 = String(reader.result || '');
      ctx.commit(() => {});
      re();
      ctx.showToast('参考图已写入，锁定后随锚点注入提示词', { level: 'ok' });
    };
    reader.onerror = () => ctx.showToast('参考图读取失败，工程内容未改变', { level: 'error' });
    reader.readAsDataURL(file);
  }

  const 资产项 = 排序后.map((a, i) => {
    const 状态 = a.类型 === '人物'
      ? (a.锁定状态 === '已锁定' && a.锚点标识 ? 标('chip--lock', '已锁定') : 标('chip--warn', '待完善'))
      : 标('chip--accent', '无需锚点');
    return `<div class="glass list-item${a.资产ID === 选中资产ID ? ' is-active' : ''}" role="button" tabindex="0" data-btn-id="BTN-P004-${10 + i}">
      <div class="list-item__main">
        <div class="ellipsis">${escapeHtml(a.类型)} · ${escapeHtml(a.名称)}</div>
        <div class="list-item__meta">${状态}${a.锚点标识 ? `<span class="mono muted"> ${escapeHtml(a.锚点标识)}</span>` : ''}</div>
      </div>
    </div>`;
  }).join('');

  const 缺失项 = 缺失清单.map((a, i) => {
    const 原因 = [];
    if (a.锁定状态 !== '已锁定') 原因.push('未锁定');
    if (!a.锚点标识) 原因.push('缺锚点标识');
    return `<li class="list-item">
      <div class="list-item__main">
        <span class="mono">${escapeHtml(a.资产ID)}</span>
        <span class="list-item__meta muted">${escapeHtml(a.名称)} · 缺失：${escapeHtml(原因.join(' / '))}</span>
      </div>
      <button type="button" class="btn btn-ghost" data-btn-id="BTN-P004-${30 + i}">去完善</button>
    </li>`;
  }).join('');

  const 锚点编辑 = 当前 ? `<div class="section-body">
    <div class="toolbar">
      ${标('chip--accent', 当前.类型)}
      <strong>${escapeHtml(当前.名称)}</strong>
      ${当前是人物
        ? 标(当前.锁定状态 === '已锁定' ? 'chip--lock' : 'chip--warn', 当前.锁定状态)
        : 标('chip--accent', '非人物资产无需锚点')}
      ${当前.参考图引用 ? 标('chip--ok', '已有参考图') : 标('chip--warn', '无参考图')}
    </div>
    <div class="form-grid">
      <div class="field"><label class="field-label" for="p004-look">外貌描述</label>
        <div class="field-control"><textarea id="p004-look" class="field-input" rows="3" data-role="look"
          data-commit="p004-anchor" data-asset="${escapeHtml(当前.资产ID)}" data-field="外貌描述">${escapeHtml(当前.外貌描述 || '')}</textarea></div>
        <p class="field-hint">锁定后随锚点注入，单条正向词里的同类描述会被锚点覆盖</p></div>
      <div class="field"><label class="field-label" for="p004-cloth">服装描述</label>
        <div class="field-control"><textarea id="p004-cloth" class="field-input" rows="2"
          data-commit="p004-anchor" data-asset="${escapeHtml(当前.资产ID)}" data-field="服装描述">${escapeHtml(当前.服装描述 || '')}</textarea></div></div>
      <div class="field"><label class="field-label" for="p004-trait">特征描述</label>
        <div class="field-control"><textarea id="p004-trait" class="field-input" rows="2"
          data-commit="p004-anchor" data-asset="${escapeHtml(当前.资产ID)}" data-field="特征描述">${escapeHtml(当前.特征描述 || '')}</textarea></div></div>
      <div class="field"><label class="field-label" for="p004-anchor-id">锚点标识</label>
        <div class="field-control"><input id="p004-anchor-id" class="field-input" placeholder="如 ANC-LINXIA-01"
          data-commit="p004-anchor" data-asset="${escapeHtml(当前.资产ID)}" data-field="锚点标识" value="${escapeHtml(当前.锚点标识 || '')}"></div>
        <p class="field-hint">锚点标识进入提示词快照，同一标识跨镜头复用</p></div>
      <div class="field"><label class="field-label" for="p004-image">参考图</label>
        <div class="field-control">
          ${/^data:/.test(String(当前.参考图引用 || ''))
            ? `<img class="asset-thumb" src="${escapeHtml(当前.参考图引用)}" alt="${escapeHtml(当前.名称)} 参考图" width="180" height="100">`
            : '<div class="muted">暂无参考图（占位）</div>'}
          <input id="p004-image" class="field-input" type="file" accept="image/*" data-role="image">
          <button type="button" class="btn btn-ghost" data-btn-id="BTN-P004-02">上传参考图</button>
        </div>
        <p class="field-hint">图片以 dataURL 存在工程内，锁定后与描述一起注入</p></div>
    </div>
    <div class="section-actions">
      <button type="button" class="btn ${当前.锁定状态 === '已锁定' ? 'btn-ghost' : 'btn-primary'}" data-btn-id="BTN-P004-01">
        ${当前.锁定状态 === '已锁定' ? '解锁锚点' : '锁定锚点'}
      </button>
      <span class="muted">锁定只影响此后新建的生成任务，不回溯已产出的历史产物</span>
    </div>
  </div>` : '<div class="section-body"><p class="muted">资产清单为空，请先到「分解提取资产」页提取资产。</p></div>';

  container.innerHTML = `<div class="page" data-page="p004">
    <header class="page-head">
      <div class="page-head__main">
        <h1 class="page-title">人物锚点锁定</h1>
        <p class="page-desc">锁定人物外貌 / 服装 / 特征与参考图，让同一角色跨镜头长相一致</p>
      </div>
      <div class="page-head__actions">
        ${标(已锁定数 === 人物资产.length && 人物资产.length ? 'chip--ok' : 'chip--warn', `锚点齐备 ${已锁定数}/${人物资产.length}`)}
      </div>
    </header>

    <div class="grid-2">
      <section class="section glass">
        <div class="section-head">
          <h2 class="section-title">资产清单</h2>
          <p class="section-sub">人物优先排列，点击切换右侧编辑</p>
        </div>
        <div class="section-body">
          <div class="list">${资产项 || '<p class="muted">暂无资产</p>'}</div>
        </div>
      </section>

      <section class="section glass">
        <div class="section-head">
          <h2 class="section-title">锚点编辑</h2>
          <p class="section-sub">${当前 ? `当前编辑：${escapeHtml(当前.名称)}` : '未选择资产'}</p>
        </div>
        ${锚点编辑}
      </section>
    </div>

    <section class="section glass">
      <div class="section-head">
        <h2 class="section-title">锚点缺失清单</h2>
        <p class="section-sub">未锁定或缺锚点标识的人物，生成图片前会被判定为锚点缺失</p>
      </div>
      <div class="section-body">
        ${人物资产.length
          ? (缺失清单.length
            ? `<ul class="list">${缺失项}</ul>`
            : 标('chip--ok', `锚点齐备 ${已锁定数}/${人物资产.length}`))
          : '<p class="muted">工程内还没有人物资产，先到「分解提取资产」页提取。</p>'}
      </div>
    </section>

    <section class="section glass">
      <div class="section-head">
        <h2 class="section-title">生效范围说明</h2>
      </div>
      <div class="section-body">
        <ul class="list">
          <li class="list-item"><div class="list-item__main">锁定后，F-006 图片生成 / F-007 关键帧 / F-010 分镜生成 / F-012 导演提示词自动携带锚点描述、锚点标识与参考图。</div></li>
          <li class="list-item"><div class="list-item__main">锚点优先于单条正向词中的同类描述，冲突词会被记入「被锚点覆盖」且不生效。</div></li>
          <li class="list-item"><div class="list-item__main">锁定只影响此后新建的生成任务，不回溯已产出的历史产物；提示词快照在任务创建瞬间冻结。</div></li>
        </ul>
      </div>
    </section>
  </div>`;

  btn('BTN-P004-01', {
    类别: 当前 && 当前是人物 && 有外貌 ? '①' : '②',
    禁用原因: !当前
      ? '请先在左侧选择一个资产'
      : (当前是人物 ? '请先填写外貌描述，否则锚点无法生效' : '非人物资产无需锁定锚点'),
    handler: 切换锁定,
    关联FID: 'F-004'
  });
  btn('BTN-P004-02', {
    类别: 当前 ? '①' : '②',
    禁用原因: '请先在左侧选择一个资产',
    handler: () => {
      const picker = container.querySelector('[data-role="image"]');
      if (picker && typeof picker.click === 'function') picker.click();
    },
    关联FID: 'F-004'
  });
  排序后.forEach((a, i) => {
    btn(`BTN-P004-${10 + i}`, {
      类别: '①',
      handler: () => { 选中资产ID = a.资产ID; re(); },
      关联FID: 'F-004'
    });
  });
  缺失清单.forEach((a, i) => {
    btn(`BTN-P004-${30 + i}`, {
      类别: '①',
      handler: () => { 选中资产ID = a.资产ID; re(); },
      关联FID: 'F-004'
    });
  });

  ctx.registerAction('commit:p004-anchor', el => {
    const 目标 = (p.assets || []).find(a => a.资产ID === el.getAttribute('data-asset'));
    const 字段 = el.getAttribute('data-field');
    if (目标 && 字段) 目标[字段] = el.value;
  });

  // 外貌描述改完不重渲染，仅重登记锁定按钮类别，避免「已填写却仍提示先填外貌」
  const 外貌域 = container.querySelector('[data-role="look"]');
  if (外貌域) {
    外貌域.addEventListener('input', () => {
      const 目标 = (p.assets || []).find(a => a.资产ID === 选中资产ID);
      if (目标) 目标.外貌描述 = 外貌域.value;
      btn('BTN-P004-01', {
        类别: 当前 && 当前是人物 && 外貌域.value.trim() ? '①' : '②',
        禁用原因: 当前是人物 ? '请先填写外貌描述，否则锚点无法生效' : '非人物资产无需锁定锚点',
        handler: 切换锁定,
        关联FID: 'F-004'
      });
    });
  }

  const 图域 = container.querySelector('[data-role="image"]');
  if (图域) 图域.addEventListener('change', () => 读参考图(图域.files && 图域.files[0]));
}
