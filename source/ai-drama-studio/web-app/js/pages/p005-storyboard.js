import { escapeHtml, openConfirmModal, renderDataTable, renderEmptyState } from '../components/index.js';
import { createTask, runTask } from '../core/gen-task.js';
import { demoFor } from '../demo/demo-data.js';
import { uid } from '../core/uid.js';

// 台词字数上限按每秒 3 字折算，2 / 3 / 4 秒取固定档，避免四舍五入后与原表不一致
const 台词上限 = 时长 => ({ 2: 6, 3: 9, 4: 12 }[时长] ?? Math.floor(时长 * 3));

// 六要素：景别、机位、运镜、人物左右方向、表情推进、转场（后四项看画面描述里是否写清）
const 六要素 = [
  { 名: '景别', 有: s => !!String(s.景别 || '').trim() },
  { 名: '机位', 有: (s, 文) => /机位|平视|俯拍|仰拍|侧拍|过肩|顶光/.test(文) },
  { 名: '运镜', 有: s => !!String(s.运镜 || '').trim() },
  { 名: '左右方向', 有: (s, 文) => /左|右/.test(文) },
  { 名: '表情推进', 有: (s, 文) => /表情|眼神|神色|皱眉|咬唇|瞳孔|眼眶/.test(文) },
  { 名: '转场', 有: (s, 文) => /转场|切至|叠化|硬切|淡出|淡入|推近|拉远|摇向/.test(文) }
];

const 高风险词表 = [
  ['人物交叉', /擦肩|交叉|错身|对穿|交错/],
  ['手持小物', /手持|攥着|握着|递出|接过|塞进|捏着/],
  ['文字', /文字|字幕|标语|招牌|信件|纸条|文件|屏幕/],
  ['镜像倒影', /倒影|镜像|反射|玻璃映/],
  ['左右不对称', /左侧|右侧|左边|右边/],
  ['一镜换光', /灯光|光线|亮起|熄灭|开灯|关灯|昏黄|霓虹/],
  ['连续多动作', /随后|接着|然后|一边|又/],
  ['俯拍遮脸', /俯拍|俯视|遮挡|挡住脸|遮住/],
  ['配角过多', /众人|人群|路人|围观|几个/]
];

const 注入标记 = html => String(html)
  .replace(/__OK_([^_]+)__/g, (_, t) => `<span class="chip chip--ok status-tag tone-ok">${t}</span>`)
  .replace(/__WARN_([^_]+)__/g, (_, t) => `<span class="chip chip--warn status-tag tone-degrade">${t}</span>`)
  .replace(/__FAIL_([^_]+)__/g, (_, t) => `<span class="chip chip--fail status-tag tone-fail">${t}</span>`);

let 选中场次ID = '';
let 仅看缺项 = false;
let 生成中 = false;

export function render(container, ctx, extra = {}) {
  const p = ctx.getProject() || {};
  const btn = (id, spec) => ctx.registerButton(id, spec);
  const re = () => ctx.setView('p005');

  const 场次列表 = p.scenes || [];
  if (!选中场次ID || !场次列表.some(s => s.场次ID === 选中场次ID)) {
    选中场次ID = 场次列表[0] ? 场次列表[0].场次ID : '';
  }
  const 当前场次 = 场次列表.find(s => s.场次ID === 选中场次ID) || null;
  const 当前分镜 = (p.shots || []).filter(s => s.场次ID === 选中场次ID);

  const 关弹层 = () => {
    const el = typeof document !== 'undefined' ? document.getElementById('modalRoot') : null;
    if (el) el.innerHTML = '';
  };

  const 六要素检查 = s => {
    const 文 = `${s.画面描述 || ''} ${s.对白 || ''}`;
    return 六要素.map(f => ({ 名: f.名, 有: f.有(s, 文) }));
  };

  function 造分镜(场次) {
    const 模板 = demoFor('分镜脚本');
    const 池 = 模板.filter(t => t.场次ID === 场次.场次ID);
    // 该场次没有对应样例时取模板前两镜做骨架，只换场次归属，不编造新画面
    const 用 = 池.length ? 池 : 模板.slice(0, 2);
    const 出场 = String(场次.出场人物 || '').split(/[\n、,，\s]+/).filter(Boolean);
    const 关联 = (p.assets || []).filter(a => 出场.includes(a.名称)).map(a => a.资产ID);
    return 用.map((t, i) => ({
      分镜ID: uid('sh'),
      场次ID: 场次.场次ID,
      镜号: i + 1,
      景别: t.景别,
      运镜: t.运镜,
      画面描述: t.画面描述,
      对白: t.对白,
      时长: t.时长,
      关联资产ID列表: 关联,
      关联关键帧ID列表: [],
      单条正向词: t.单条正向词 || '',
      单条负面词: []
    }));
  }

  async function 生成分镜(场次们) {
    if (生成中 || !场次们.length) return;
    生成中 = true;
    re(); // 先置进行中态，长调用期间页面保持可读
    for (const 场次 of 场次们) {
      const task = createTask(p, { 任务类型: '分镜脚本', 用途: '文本', 对象ID: 场次.场次ID });
      await runTask(p, task.任务ID);
      // 每场次整体覆盖，重生成同一场次不产生重复镜号
      p.shots = (p.shots || []).filter(s => s.场次ID !== 场次.场次ID).concat(造分镜(场次));
    }
    ctx.commit(() => {});
    生成中 = false;
    re();
    ctx.showToast(`已生成 ${场次们.length} 个场次的分镜`, { level: 'ok' });
  }

  function 删除分镜(分镜) {
    openConfirmModal({
      title: '删除分镜',
      message: `将删除第 ${分镜.镜号} 镜，场次内其余分镜与资产引用不变。`,
      变更条目ID: [分镜.分镜ID],
      confirmLabel: '确认删除',
      confirmBtnId: 'BTN-P005-70',
      cancelBtnId: 'BTN-P005-71',
      confirmToast: '分镜已删除',
      onConfirm: () => {
        p.shots = (p.shots || []).filter(x => x.分镜ID !== 分镜.分镜ID);
        ctx.commit(() => {});
        关弹层();
        re();
      }
    });
  }

  const 评估 = 当前分镜.map((s, i) => {
    const 检查 = 六要素检查(s);
    const 字数 = String(s.对白 || '').length;
    const 上限 = 台词上限(Number(s.时长) || 0);
    return { s, i, 缺: 检查.filter(x => !x.有).map(x => x.名), 字数, 上限 };
  });
  const 展示 = 仅看缺项 ? 评估.filter(x => x.缺.length > 0 || x.字数 > x.上限) : 评估;

  const 行 = 展示.map(x => ({
    镜号: `镜 ${x.s.镜号}`,
    景别: x.s.景别 || '',
    运镜: x.s.运镜 || '',
    画面描述: String(x.s.画面描述 || '').length > 44 ? `${String(x.s.画面描述).slice(0, 44)}…` : String(x.s.画面描述 || ''),
    对白: `${x.s.对白 || ''} ${x.字数 > x.上限 ? `__FAIL_实测${x.字数}/上限${x.上限}__` : `__OK_${x.字数}/${x.上限}字__`}`,
    时长: `${Number(x.s.时长) || 0} 秒`,
    六要素检查: x.缺.length ? x.缺.map(n => `__FAIL_${n}__`).join(' ') : '__OK_齐全__',
    // 行内操作不走 rowActions：组件会把同一组按钮铺到每一行，改为按行号占位后替换
    操作: `__ACT_${x.i}__`
  }));

  const 表格 = 注入标记(renderDataTable(
    [
      { key: '镜号', label: '镜号' },
      { key: '景别', label: '景别' },
      { key: '运镜', label: '运镜' },
      { key: '画面描述', label: '画面描述' },
      { key: '对白', label: '对白' },
      { key: '时长', label: '时长' },
      { key: '六要素检查', label: '六要素检查' },
      { key: '操作', label: '操作' }
    ],
    行,
    { countBtnId: 'BTN-P005-72' }
  )).replace(/__ACT_(\d+)__/g, (_, n) => {
    const i = Number(n);
    return `<button type="button" class="btn btn-ghost" data-btn-id="BTN-P005-${20 + i}">删除</button>`;
  });

  const 齐全镜数 = 评估.filter(x => x.缺.length === 0).length;
  const 超限镜数 = 评估.filter(x => x.字数 > x.上限).length;

  const 命中风险 = 当前分镜.length
    ? 高风险词表.filter(([, re2]) => 当前分镜.some(s => re2.test(`${s.画面描述 || ''}${s.对白 || ''}`))).map(([名]) => 名)
    : [];

  const 场次选项 = 场次列表.map(s => `<option value="${escapeHtml(s.场次ID)}"${s.场次ID === 选中场次ID ? ' selected' : ''}>第 ${escapeHtml(s.场次序号)} 场 · ${escapeHtml(s.地点 || '未标注')} · ${escapeHtml(s.时间 || '')}</option>`).join('');

  const 分镜区 = !场次列表.length
    ? renderEmptyState({
      title: '还没有场次',
      message: '分镜按场次生成，请先到「拆分剧本」完成拆分',
      missing: ['scenes 为空：F-002 未执行'],
      guideBtnId: 'BTN-P005-90',
      guideLabel: '去拆分剧本',
      onGuide: () => ctx.setView('p002'),
      关联FID: 'F-005'
    })
    : (当前分镜.length
      ? `<div class="alert-bar ${命中风险.length ? 'tone-degrade' : ''}">${命中风险.length ? `本场次 命中 ${命中风险.length} 类高风险画面，建议拆分：${escapeHtml(命中风险.join(' / '))}` : '本场次 未命中 9 类高风险画面，可逐镜进入图片生成'}</div>
        <p class="muted">本场次 ${当前分镜.length} 镜 · 六要素齐全 ${齐全镜数}/${当前分镜.length} · 台词超限 ${超限镜数} 镜</p>
        ${表格}`
      : renderEmptyState({
        title: '本场次还没有分镜',
        message: `当前场次：第 ${当前场次 ? 当前场次.场次序号 : '-'} 场，生成后可逐镜校验六要素与台词字数`,
        missing: ['该场次 shots 为空：生成分镜未执行'],
        guideBtnId: 'BTN-P005-91',
        guideLabel: '生成分镜',
        onGuide: () => 生成分镜([当前场次].filter(Boolean)),
        关联FID: 'F-005'
      }));

  container.innerHTML = `<div class="page" data-page="p005">
    <header class="page-head">
      <div class="page-head__main">
        <h1 class="page-title">分镜脚本</h1>
        <p class="page-desc">按场次生成分镜，逐镜校验六要素、台词字数与高风险画面</p>
      </div>
      <div class="page-head__actions">
        ${生成中 ? '<span class="chip chip--accent status-tag">生成中…</span>' : ''}
        <span class="chip chip--demo status-tag tone-demo">分镜 ${(p.shots || []).length}</span>
      </div>
    </header>

    <section class="section glass">
      <div class="section-head">
        <h2 class="section-title">生成与筛选</h2>
        <p class="section-sub">批量生成会逐场次覆盖同场次旧分镜，不产生重复镜号</p>
      </div>
      <div class="section-body">
        <div class="toolbar">
          <label class="field-label" for="p005-scene">场次</label>
          <select id="p005-scene" class="field-input" data-role="scene">${场次选项 || '<option value="">暂无场次</option>'}</select>
          <button type="button" class="btn btn-primary" data-btn-id="BTN-P005-01">生成分镜</button>
          <button type="button" class="btn btn-ghost" data-btn-id="BTN-P005-02">批量生成全部场次</button>
          <button type="button" class="btn btn-ghost" data-btn-id="BTN-P005-03">${仅看缺项 ? '查看全部分镜' : '仅看缺项'}</button>
        </div>
      </div>
    </section>

    <section class="section glass">
      <div class="section-head">
        <h2 class="section-title">分镜表</h2>
        <p class="section-sub">六要素缺项标红；台词超限按每秒 3 字折算给出实测/上限</p>
      </div>
      <div class="section-body">${分镜区}</div>
      <div class="section-actions">
        <button type="button" class="btn btn-primary" data-btn-id="BTN-P005-05">下一步：图片生成 →</button>
      </div>
    </section>
  </div>`;

  btn('BTN-P005-01', {
    类别: 当前场次 ? '①' : '②',
    禁用原因: '暂无场次，请先到「拆分剧本」完成拆分',
    handler: () => 生成分镜([当前场次].filter(Boolean)),
    关联FID: 'F-005'
  });
  btn('BTN-P005-02', {
    类别: 场次列表.length ? '①' : '②',
    禁用原因: '暂无场次，请先到「拆分剧本」完成拆分',
    handler: () => {
      openConfirmModal({
        title: '批量生成全部场次分镜',
        message: `将按 ${场次列表.length} 个场次逐场生成，同场次旧分镜会被覆盖。`,
        变更条目ID: 场次列表.map(s => s.场次ID).slice(0, 8),
        confirmLabel: '开始生成',
        confirmBtnId: 'BTN-P005-60',
        cancelBtnId: 'BTN-P005-61',
        onConfirm: async () => {
          关弹层();
          await 生成分镜(场次列表);
        }
      });
    },
    关联FID: 'F-005'
  });
  btn('BTN-P005-03', {
    类别: '①',
    handler: () => {
      仅看缺项 = !仅看缺项;
      re();
      ctx.showToast(仅看缺项 ? '仅显示六要素缺项或台词超限的分镜' : '已显示全部分镜', { level: 'info' });
    },
    关联FID: 'F-005'
  });
  展示.forEach(x => {
    btn(`BTN-P005-${20 + x.i}`, { 类别: '①', handler: () => 删除分镜(x.s), 关联FID: 'F-005' });
  });
  btn('BTN-P005-05', { 类别: '①', handler: () => ctx.setView('p006'), 关联FID: 'F-006' });

  const 场次域 = container.querySelector('[data-role="scene"]');
  if (场次域) {
    场次域.addEventListener('change', () => {
      选中场次ID = 场次域.value;
      re();
    });
  }
}
