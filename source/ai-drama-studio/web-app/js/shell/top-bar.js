import { escapeHtml, renderStatusTag, openConfirmModal } from '../components/index.js';
import * as IO from '../io.js';
import * as STORE from '../store.js';
import { W_V02, W_V03 } from '../constants.js';

const ID = (n) => 'BTN-TOP-' + String(n).padStart(2, '0');

// 导入失败原因 → 可读中文：不把底层解析/版本异常文本抛给用户
const IMPORT_REASON = {
  parse: '导入失败：文件无法解析为 JSON，工程数据未改动',
  version: '导入失败：工程文件版本高于当前工作台，工程数据未改动',
  schema: '导入失败：文件不符合工程结构，工程数据未改动',
  quota: '导入失败：工程体积超出本地存储容量，请先导出备份再清理',
};

// 降级原因取自 GenTask 错误信息中的固定片段，绝不拼接密钥/URL/堆栈
function degradeOf(task) {
  const m = /降级原因：([^；;]+)/.exec(String(task && task.错误信息 || ''));
  return m ? m[1].trim() : '—';
}

function chainHtml(project) {
  const recent = (project.genTasks || []).slice(-5).reverse();
  const rows = recent.length
    ? recent.map(t => `<tr>
        <td>${escapeHtml(t.任务ID || '—')}</td>
        <td>${escapeHtml(t.来源模型标识 || '未配置')}</td>
        <td>${escapeHtml(t.类型 || '—')}</td>
        <td>${escapeHtml(t.状态 || '—')}</td>
        <td>${escapeHtml(degradeOf(t))}</td></tr>`).join('')
    : '<tr><td colspan="5">暂无生成任务，调用链为空</td></tr>';
  return `<table data-component="top-chain">
    <thead><tr><th>任务</th><th>来源类型</th><th>用途</th><th>状态</th><th>降级原因</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function closeModal() {
  const root = typeof document !== 'undefined' ? document.getElementById('modalRoot') : null;
  if (root) root.innerHTML = '';
}

export function renderTopBar(container, ctx) {
  const slot = container || (typeof document !== 'undefined' ? document.getElementById('ws-topbar') : null);
  if (!slot || !ctx || typeof ctx.getProject !== 'function') return;

  const p = ctx.getProject() || {};
  const forceDemo = !!p.是否强制演示数据;
  const noMotion = !!p.关闭动效;
  const isDemo = String(p.名称 || '').includes('示例');

  slot.innerHTML = `<header class="glass tb" data-component="top-bar">
    <div class="tb-brand">
      <span class="tb-mark" aria-hidden="true"></span>
      <div><div class="tb-title">短剧工作台</div><div class="tb-sub">AI 一站式创作</div></div>
    </div>
    <div class="tb-fields">
      <input class="field-input" type="text" id="top-name" data-editable="1" data-commit="项目名称" aria-label="工程名" placeholder="工程名" value="${escapeHtml(p.名称 || '')}">
      <input class="field-input" type="text" id="top-idea" data-editable="1" data-commit="一句话创意" aria-label="一句话创意" placeholder="一句话创意" value="${escapeHtml(p.一句话创意 || '')}">
    </div>
    <span id="top-save-tag">${renderStatusTag(p.保存状态 || '新建')}</span>
    <span class="demo-badge" id="top-demo-badge"${isDemo ? '' : ' style="display:none"'}>示例工程 · 演示数据</span>
    <div class="tb-actions">
      <button class="btn btn-primary" type="button" data-btn-id="${ID(4)}">保存</button>
      <button class="btn btn-ghost" type="button" data-btn-id="${ID(5)}">导出工程</button>
      <button class="btn btn-ghost" type="button" data-btn-id="${ID(6)}">导入工程</button>
      <button class="btn btn-ghost" type="button" data-btn-id="${ID(7)}">模型配置</button>
      <button class="btn btn-ghost" type="button" data-btn-id="${ID(8)}" aria-pressed="${forceDemo}">强制演示数据：${forceDemo ? '开' : '关'}</button>
      <button class="btn btn-ghost" type="button" data-btn-id="${ID(9)}">载入示例工程</button>
      <button class="btn btn-ghost" type="button" data-btn-id="${ID(10)}" aria-pressed="${noMotion}">关闭动效：${noMotion ? '开' : '关'}</button>
      <button class="btn btn-ghost" type="button" data-btn-id="${ID(11)}">来源/调用链</button>
      <button class="btn btn-ghost" type="button" data-btn-id="BTN-DL-OPEN">下载桌面版</button>
    </div>
    <input type="file" id="top-import-file" accept=".json,application/json" hidden>
    <div class="glass tb-chain" id="top-chain" hidden></div>
  </header>`;

  const btn = (n, spec) => ctx.registerButton(ID(n), spec);

  // 失焦写回由 workspace 唯一 focusout 委托按 data-commit 触发，不在此另挂监听
  ctx.registerAction('commit:项目名称', el => {
    const target = ctx.getProject();
    target.名称 = String(el.value || '').trim() || '未命名工程';
    // .demo-badge 自带 display，[hidden] 会被覆盖，故用行内 display 控制显隐
    const badge = typeof document !== 'undefined' ? document.getElementById('top-demo-badge') : null;
    if (badge) badge.style.display = target.名称.includes('示例') ? '' : 'none';
  });
  ctx.registerAction('commit:一句话创意', el => {
    ctx.getProject().一句话创意 = String(el.value || '').trim();
  });

  btn(4, {
    类别: '①', 关联FID: 'F-000',
    handler: () => {
      const r = STORE.saveNow();
      const tag = slot.querySelector('#top-save-tag');
      if (tag) tag.innerHTML = renderStatusTag(ctx.getProject().保存状态 || '新建');
      ctx.showToast(r && r.ok ? '工程已保存' : '保存失败：本地存储空间不足，建议先导出工程备份再清理数据',
        { level: r && r.ok ? 'info' : 'warn' });
    }
  });

  btn(5, { 类别: '①', 关联FID: 'F-011', handler: () => IO.exportProject(ctx.getProject()) });

  btn(6, {
    类别: '①', 关联FID: 'F-001',
    handler: () => {
      const input = slot.querySelector('#top-import-file');
      if (input) input.click();
    }
  });
  const fileInput = slot.querySelector('#top-import-file');
  if (fileInput) {
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (!file) return;
      const r = await IO.importProject(file);
      if (!r || !r.ok) { ctx.showToast(IMPORT_REASON[r && r.reason] || IMPORT_REASON.parse, { level: 'warn' }); return; }
      // hydrate 就地灌入唯一 Project 引用，再按当前 hash 重渲染：不新建引用、不整页刷新
      IO.hydrate(r.project);
      ctx.commit(() => {});
      const h = typeof ctx.parseHash === 'function' ? ctx.parseHash() : { view: 'p001', stage: '', params: {} };
      ctx.setView(h.view, h);
      renderTopBar(slot, ctx);
      ctx.showToast('工程已导入；密钥字段不随文件导入', { level: 'info' });
    });
  }

  btn(7, {
    类别: '①', 关联FID: 'M-001',
    handler: () => {
      if (typeof ctx.openModelDrawer === 'function') { ctx.openModelDrawer(ctx); return; }
      ctx.showToast('模型配置模块未就绪，工程数据未改动', { level: 'warn' });
    }
  });

  btn(8, {
    类别: '①', 关联FID: 'CR-06',
    handler: () => {
      ctx.commit(target => { target.是否强制演示数据 = !target.是否强制演示数据; });
      const on = !!ctx.getProject().是否强制演示数据;
      renderTopBar(slot, ctx);
      ctx.showToast(on ? '已强制使用演示数据，不会向任何模型地址发起请求' : '已关闭强制演示数据，将沿用已启用的模型配置', { level: 'info' });
    }
  });

  btn(9, {
    类别: '①', 关联FID: 'D-04',
    handler: () => {
      openConfirmModal({
      title: '载入示例工程？',
      message: '将用示例工程覆盖当前工程的剧本、场次、资产、分镜等内容，覆盖后不可撤销。',
      confirmLabel: '载入示例工程',
      confirmBtnId: 'BTN-TOP-09a', cancelBtnId: 'BTN-TOP-09b',
      onConfirm: async () => {
        closeModal();
        try {
          const m = await import('../demo/demo-project.js');
          if (typeof m.resetToDemo === 'function') m.resetToDemo(ctx.getProject());
          ctx.commit(() => {});
          renderTopBar(slot, ctx);
          const h = typeof ctx.parseHash === 'function' ? ctx.parseHash() : { view: 'p001', stage: '', params: {} };
          ctx.setView(h.view, h);
          ctx.showToast('示例工程已载入', { level: 'info' });
        } catch (e) {
          ctx.showToast('示例工程模块未就绪：文件尚未交付，工程数据未改动', { level: 'warn' });
        }
      }
      });
      // C-04 的取消属④类（只给反馈、不执行 handler），此处覆盖为①：收起模态并给出反馈，避免遮罩长期挡住界面
      ctx.registerButton('BTN-TOP-09b', {
        类别: '①', 关联FID: 'D-04',
        handler: () => { closeModal(); ctx.showToast('已取消，原始数据未改变', { level: 'info' }); }
      });
    }
  });

  btn(10, {
    类别: '①', 关联FID: 'V-02',
    handler: () => {
      ctx.commit(target => { target.关闭动效 = !target.关闭动效; });
      const off = !!ctx.getProject().关闭动效;
      document.body.classList.toggle('no-motion', off);
      renderTopBar(slot, ctx);
      ctx.showToast(off ? W_V02 : W_V03, { level: 'info' });
    }
  });

  btn(11, {
    类别: '①', 关联FID: 'CR-06',
    handler: () => {
      const panel = slot.querySelector('#top-chain');
      if (!panel) return;
      if (!panel.hidden) { panel.hidden = true; return; }
      panel.innerHTML = chainHtml(ctx.getProject());
      panel.hidden = false;
    }
  });

  // 面板从 handler 里动态加载：不触碰 components/index.js / app.js 的冻结清单，也不新增点击监听
  ctx.registerButton('BTN-DL-OPEN', {
    类别: '①', 关联FID: 'F6',
    handler: () => {
      ctx.showToast('正在读取下载信息…', { level: 'info' });
      import('../components/c20-download-panel.js')
        .then(m => m.openDownloadPanel(ctx))
        .catch(() => ctx.showToast('下载信息模块未就绪，请重试', { level: 'warn' }));
    }
  });
}
