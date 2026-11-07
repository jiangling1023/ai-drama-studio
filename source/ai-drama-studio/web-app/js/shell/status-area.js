import { escapeHtml, renderGenTaskCard, renderSourceBadge } from '../components/index.js';

const RUNNING = '进行中', SUCCESS = '成功', FAILED = '失败';

function degradeOf(task) {
  const m = /降级原因：([^；;]+)/.exec(String(task && task.错误信息 || ''));
  return m ? m[1].trim() : '';
}

function panelHtml(tasks) {
  const recent = tasks.slice(-10).reverse();
  if (!recent.length) return '<div class="ws-placeholder">暂无生成任务记录</div>';
  // 重试/快照按钮由 C-07 自带并自行登记，此处只按最近 10 条逐条渲染
  return recent.map((t, i) => renderGenTaskCard(t, { btnPrefix: 'BTN-STATUS-T' + (i + 1) })).join('');
}

export function renderStatusArea(container, ctx) {
  const slot = container || (typeof document !== 'undefined' ? document.getElementById('ws-status') : null);
  if (!slot || !ctx) return;

  const project = ctx.getProject() || {};
  const tasks = Array.isArray(project.genTasks) ? project.genTasks : [];
  const running = tasks.filter(t => t.状态 === RUNNING).slice(-1)[0] || null;
  const latest = tasks[tasks.length - 1] || null;
  const okCount = tasks.filter(t => t.状态 === SUCCESS).length;
  const failCount = tasks.filter(t => t.状态 === FAILED).length;
  const mark = String(latest && latest.来源模型标识 || '').includes('演示') ? '演示数据' : '真实模型';

  const left = running
    ? `<div class="sa-task">
        <span>生成中：<strong>${escapeHtml(running.任务ID || '—')}</strong> · 用途：${escapeHtml(running.类型 || '文本')} · 对象：${escapeHtml((running.输入快照 && running.输入快照.对象ID) || '—')}</span>
        <span class="sa-bar" role="progressbar" aria-label="生成中"><i></i></span>
        <button class="btn btn-ghost" type="button" data-btn-id="BTN-STATUS-02">取消</button>
      </div>`
    : '<div class="sa-task"><span>当前无进行中的生成任务</span></div>';

  const chain = latest
    ? renderSourceBadge({
        sourceType: latest.来源模型标识 || '未配置',
        purpose: latest.类型 || '文本',
        modelId: '',
        degradeReason: degradeOf(latest),
        dataMark: mark,
        compact: true
      }, { btnId: 'BTN-STATUS-C15' })
    : '<span class="sa-note">来源：未配置 · 用途：— · 模型：—</span>';

  slot.innerHTML = `<div class="glass sa" data-component="status-area">
    ${left}
    <div class="sa-chain">${chain}</div>
    <div class="sa-counts">
      <span>任务总数：<strong>${tasks.length}</strong></span>
      <span class="sn-dot ok" role="img" aria-label="成功"></span><span>成功 ${okCount}</span>
      <span class="sn-dot" role="img" aria-label="失败" style="background:var(--fail)"></span><span>失败 ${failCount}</span>
      <button class="btn btn-ghost" type="button" data-btn-id="BTN-STATUS-01">展开任务</button>
    </div>
  </div>
  <section class="glass sa-panel" id="sa-panel" data-component="status-panel" hidden></section>`;

  ctx.registerButton('BTN-STATUS-01', {
    类别: '①', 关联FID: 'C-07',
    handler: () => {
      const panel = slot.querySelector('#sa-panel');
      const trigger = slot.querySelector('[data-btn-id="BTN-STATUS-01"]');
      if (!panel) return;
      if (!panel.hidden) { panel.hidden = true; if (trigger) trigger.textContent = '展开任务'; return; }
      panel.innerHTML = panelHtml(tasks);
      panel.hidden = false;
      if (trigger) trigger.textContent = '收起任务';
    }
  });

  // 无进行中任务时登记为②禁用态（给具体原因），有任务时为①真实取消，避免「点了没反应」
  ctx.registerButton('BTN-STATUS-02', running ? {
    类别: '①', 关联FID: 'C-07',
    handler: () => {
      // 取消只回写任务状态与可读说明，不删除任务、不改动任何产物字段
      ctx.commit(target => {
        const t = (target.genTasks || []).find(x => x.状态 === RUNNING);
        if (t) { t.状态 = FAILED; t.错误信息 = '已取消：等待已终止，产物未写入'; }
      });
      renderStatusArea(slot, ctx);
      ctx.showToast('已取消当前生成任务，工程数据未写入异常内容', { level: 'info' });
    }
  } : {
    类别: '②', 禁用原因: '当前无进行中的生成任务，无需取消', 关联FID: 'C-07'
  });
}
