import { escapeHtml, openConfirmModal, renderEmptyState } from '../components/index.js';
import { CANVAS_COMMANDS, applyCanvasCommand, buildCanvasNodes, checkCanvasIntegrity, matchCommand } from '../core/canvas-command.js';
import { V1_TEXT } from '../constants.js';

// 输入框内容 / 选中节点 / 行内编辑目标都是纯 UI 态，工程数据只写 canvasNodes
let 指令值 = '';
let 选中节点ID = '';
let 编辑节点ID = '';
let 空态原因 = '';

const 识别失败 = '无法识别指令，可用：按场次生成 / 按分镜生成 / 按资产生成';
const 色调 = { 'chip--ok': 'tone-ok', 'chip--warn': 'tone-degrade', 'chip--fail': 'tone-fail', 'chip--lock': 'tone-lock', 'chip--accent': '' };
const 标 = (kind, text) => `<span class="chip ${kind} status-tag ${色调[kind] || ''}">${escapeHtml(text)}</span>`;
const 关弹层 = () => {
  const el = typeof document !== 'undefined' ? document.getElementById('modalRoot') : null;
  if (el) el.innerHTML = '';
};

// 节点视觉宽度固定 180（见 style.css .canvas-node），连线用固定尺寸估算端点
const 节宽 = 180;
const 节高 = 68;

// 同一分组（同一批指令产出的同一类型节点）按 x 升序相邻连线
function 连线HTML(节点们) {
  const 分组 = 节点们.reduce((m, n) => {
    (m[n.类型] ||= []).push(n);
    return m;
  }, {});
  const 段 = [];
  Object.values(分组).forEach(g => {
    const 排 = g.slice().sort((a, b) => (a.布局坐标?.x || 0) - (b.布局坐标?.x || 0));
    for (let i = 0; i < 排.length - 1; i += 1) {
      const a = 排[i].布局坐标 || {};
      const b = 排[i + 1].布局坐标 || {};
      段.push(`<line x1="${(a.x || 0) + 节宽}" y1="${(a.y || 0) + 节高 / 2}" x2="${b.x || 0}" y2="${(b.y || 0) + 节高 / 2}" />`);
    }
  });
  return 段.join('');
}

export function render(container, ctx, extra = {}) {
  const p = ctx.getProject() || {};
  const btn = (id, spec) => ctx.registerButton(id, spec);
  const re = () => ctx.setView('p009');

  const 节点们 = p.canvasNodes || [];
  const 取指令 = () => {
    const el = container.querySelector('[data-role="cmd"]');
    return String(el ? el.value : 指令值).trim();
  };

  function 落盘(cmd) {
    const r = applyCanvasCommand(p, cmd, '当前集', true);
    空态原因 = r.changed && !(p.canvasNodes || []).length ? (r.reason || V1_TEXT.DATA_SOURCE_EMPTY) : '';
    ctx.commit(() => {});
    re();
    if (空态原因) ctx.showToast(空态原因, { level: 'warn' });
    else ctx.showToast(`已按「${cmd}」生成 ${(p.canvasNodes || []).length} 个节点`, { level: 'ok' });
  }

  function 执行(cmd) {
    const c = matchCommand(cmd);
    if (!c) {
      ctx.showToast(识别失败, { level: 'warn' });
      return;
    }
    const 待建 = buildCanvasNodes(p, c, '当前集').nodes.length;
    // CNV-04：画布非空时全量重建须一次显式确认，取消则零变更
    if ((p.canvasNodes || []).length) {
      openConfirmModal({
        title: '全量重建画布节点',
        message: 待建 ? `将按当前数据源全量重建 ${待建} 个节点，现有节点布局会丢失。` : '当前数据源为空，确认后画布将清空为 0 个节点。',
        confirmLabel: '确认重建',
        confirmBtnId: 'BTN-P009-C04',
        cancelBtnId: 'BTN-P009-C05',
        confirmToast: '画布节点已重建',
        onConfirm: () => {
          关弹层();
          落盘(c);
        }
      });
      // C-04 取消默认落④不会执行 handler，改登记为①才能真关掉浮层且零变更
      btn('BTN-P009-C05', { 类别: '①', handler: () => { 关弹层(); ctx.showToast('已取消重建，画布节点未改变', { level: 'info' }); }, 关联FID: 'F-009' });
      return;
    }
    落盘(c);
  }

  // 执行按钮类别随输入实时切换：空输入落②、非法指令落④（只吐原句、节点数不变）、合法指令落①
  const 同步执行 = () => {
    const 文本 = 取指令();
    if (!文本) {
      btn('BTN-P009-01', { 类别: '②', 禁用原因: '请先输入指令：按场次生成 / 按分镜生成 / 按资产生成', handler: () => {}, 关联FID: 'F-009' });
      return;
    }
    if (!matchCommand(文本)) {
      btn('BTN-P009-01', { 类别: '④', toast: 识别失败, 关联FID: 'F-009' });
      return;
    }
    btn('BTN-P009-01', { 类别: '①', handler: () => 执行(文本), 关联FID: 'F-009' });
  };

  const 完检 = checkCanvasIntegrity(p);
  const 完chip = !节点们.length
    ? 标('chip--warn', '画布为空：执行指令后再校验')
    : (完检.equal
      ? 标('chip--ok', `节点数 = 数据源条目数（${完检.nodeCount}/${完检.sourceCount}）`)
      : 标('chip--fail', `节点数 ${完检.nodeCount} / 数据源 ${完检.sourceCount}，或关联数据ID 不可解析 / 重复`));

  const 宽 = Math.max(640, ...节点们.map(n => (n.布局坐标?.x || 0) + 节宽 + 40));
  const 高 = Math.max(520, ...节点们.map(n => (n.布局坐标?.y || 0) + 节高 + 60));

  const 节点卡 = (n, i) => {
    const 编辑中 = 编辑节点ID === n.节点ID;
    return `<div class="canvas-node${选中节点ID === n.节点ID ? ' is-active' : ''}" data-btn-id="BTN-P009-${40 + i}"
      data-node-drag="${escapeHtml(n.节点ID)}" style="left:${n.布局坐标?.x || 0}px;top:${n.布局坐标?.y || 0}px">
      <div class="toolbar" style="gap:6px;flex-wrap:nowrap">
        ${编辑中
    ? `<input class="field-input" data-role="node-title" style="width:110px" value="${escapeHtml(n.标题 || '')}" aria-label="节点标题">`
    : `<strong class="ellipsis" style="max-width:104px">${escapeHtml(n.标题 || '未命名节点')}</strong>
             <button type="button" class="btn btn-ghost" style="height:20px;padding:0 6px;font-size:10px" data-btn-id="BTN-P009-${10 + i}">编辑</button>`}
      </div>
      <div class="toolbar" style="gap:4px;margin-top:4px">${标('chip--accent', n.类型 || '节点')}</div>
      <div class="mono muted ellipsis" style="margin-top:4px">${escapeHtml(n.关联数据ID || '')}</div>
    </div>`;
  };

  const 画布区 = 节点们.length
    ? `<div class="canvas">
        <div style="position:relative;width:${宽}px;height:${高}px">
          <svg style="position:absolute;inset:0;width:${宽}px;height:${高}px;pointer-events:none" aria-hidden="true">
            <g stroke="rgba(124,140,255,.35)" stroke-width="1.5">${连线HTML(节点们)}</g>
          </svg>
          ${节点们.map(节点卡).join('')}
        </div>
      </div>`
    : renderEmptyState({
      title: '画布还没有节点',
      message: 空态原因 || '用一句指令生成节点：按场次生成 / 按分镜生成 / 按资产生成',
      missing: 空态原因 ? [空态原因] : ['canvasNodes 为空：尚未执行指令'],
      guideBtnId: 'BTN-P009-06',
      guideLabel: '按分镜生成',
      onGuide: () => {
        指令值 = CANVAS_COMMANDS[1];
        执行(CANVAS_COMMANDS[1]);
      },
      关联FID: 'F-009'
    });

  container.innerHTML = `<div class="page" data-page="p009">
    <header class="page-head">
      <div class="page-head__main">
        <h1 class="page-title">画布生成</h1>
        <p class="page-desc">用三种指令把场次 / 分镜 / 资产铺成画布节点，拖动排版不改关联数据</p>
      </div>
      <div class="page-head__actions">
        ${标('chip--accent', `节点 ${节点们.length}`)}
      </div>
    </header>

    <section class="section glass glow-g1">
      <div class="section-head">
        <h2 class="section-title">画布指令</h2>
        <p class="section-sub">支持三种指令：按场次生成 / 按分镜生成 / 按资产生成</p>
      </div>
      <div class="section-body">
        <div class="toolbar">
          <input id="p009-cmd" class="field-input" style="flex:1 1 320px;min-width:240px" data-role="cmd"
            placeholder="输入指令，如：按分镜生成" value="${escapeHtml(指令值)}">
          <button type="button" class="btn btn-primary" data-btn-id="BTN-P009-01">执行</button>
        </div>
        <div class="toolbar">
          <span class="muted">快捷指令：</span>
          ${CANVAS_COMMANDS.map((cmd, i) => `<button type="button" class="btn btn-ghost" data-btn-id="BTN-P009-0${2 + i}">${escapeHtml(cmd)}</button>`).join('')}
          <span class="muted">点击即刻填入并执行</span>
        </div>
      </div>
    </section>

    <section class="section glass">
      <div class="section-head">
        <h2 class="section-title">画布</h2>
        <p class="section-sub">节点按数据源顺序单向布局，可拖动；编辑只改标题，「关联数据ID」只读</p>
      </div>
      <div class="section-body">${画布区}</div>
      <div class="section-actions toolbar">
        ${完chip}
        <button type="button" class="btn btn-ghost" data-btn-id="BTN-P009-05">重算完整性</button>
      </div>
    </section>
  </div>`;

  同步执行();

  CANVAS_COMMANDS.forEach((cmd, i) => {
    btn(`BTN-P009-0${2 + i}`, {
      类别: '①',
      handler: () => {
        指令值 = cmd;
        const el = container.querySelector('[data-role="cmd"]');
        if (el) el.value = cmd;
        执行(cmd);
      },
      关联FID: 'F-009'
    });
  });

  btn('BTN-P009-05', {
    类别: 节点们.length ? '①' : '②',
    禁用原因: '画布还没有节点，暂无可校验的关联数据ID',
    handler: () => {
      const r = checkCanvasIntegrity(p);
      re();
      ctx.showToast(r.equal ? `完整性检查通过：节点数 ${r.nodeCount}/${r.sourceCount}` : `完整性检查未通过：节点数 ${r.nodeCount} / 数据源 ${r.sourceCount}`, { level: r.equal ? 'ok' : 'warn' });
    },
    关联FID: 'F-009'
  });

  节点们.forEach((n, i) => {
    btn(`BTN-P009-${40 + i}`, {
      类别: '①',
      // 已选中的节点不重复渲染，避免点击行内输入框时替换掉正在编辑的元素
      handler: () => {
        if (选中节点ID === n.节点ID) return;
        选中节点ID = n.节点ID;
        re();
      },
      关联FID: 'F-009'
    });
    btn(`BTN-P009-${10 + i}`, {
      类别: '①',
      handler: () => {
        编辑节点ID = n.节点ID;
        选中节点ID = n.节点ID;
        re();
        const el = container.querySelector('[data-role="node-title"]');
        if (el && typeof el.focus === 'function') el.focus();
      },
      关联FID: 'F-009'
    });
  });

  节点们.forEach(n => {
    const el = container.querySelector(`[data-node-drag="${n.节点ID}"]`);
    if (!el) return;
    el.addEventListener('dblclick', e => {
      if (e.target.closest('input,textarea')) return;
      编辑节点ID = n.节点ID;
      选中节点ID = n.节点ID;
      re();
      const 域 = container.querySelector('[data-role="node-title"]');
      if (域 && typeof 域.focus === 'function') 域.focus();
    });
    el.addEventListener('mousedown', e => {
      // 只在节点本体按下才拖动：点内部按钮 / 标题输入框不移动节点
      if (e.target.closest('[data-btn-id]') !== el || e.target.closest('input,textarea')) return;
      const 起X = e.clientX;
      const 起Y = e.clientY;
      const 原X = n.布局坐标?.x || 0;
      const 原Y = n.布局坐标?.y || 0;
      let 动过 = false;
      const 移 = ev => {
        const x = Math.max(0, 原X + ev.clientX - 起X);
        const y = Math.max(0, 原Y + ev.clientY - 起Y);
        // 拖动只改布局坐标，关联数据ID 与标题一字不动
        n.布局坐标 = { x, y };
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        动过 = true;
        const 线 = container.querySelector('.canvas svg > g');
        if (线) 线.innerHTML = 连线HTML(p.canvasNodes || []);
      };
      const 停 = () => {
        document.removeEventListener('mousemove', 移);
        document.removeEventListener('mouseup', 停);
        if (动过) ctx.commit(() => {});
      };
      document.addEventListener('mousemove', 移);
      document.addEventListener('mouseup', 停);
    });
  });

  const 标题域 = container.querySelector('[data-role="node-title"]');
  if (标题域) {
    const 提交标题 = () => {
      const n = (p.canvasNodes || []).find(x => x.节点ID === 编辑节点ID);
      if (n) n.标题 = 标题域.value;
      编辑节点ID = '';
      ctx.commit(() => {});
      re();
    };
    标题域.addEventListener('keydown', e => { if (e.key === 'Enter') 提交标题(); });
    标题域.addEventListener('blur', 提交标题);
  }

  const 指令域 = container.querySelector('[data-role="cmd"]');
  if (指令域) {
    指令域.addEventListener('input', () => {
      指令值 = 指令域.value;
      同步执行();
    });
  }
}
