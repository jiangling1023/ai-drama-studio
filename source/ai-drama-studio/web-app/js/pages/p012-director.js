import {
  escapeHtml, openConfirmModal, renderAlertBar, renderConsistencyEditor, renderDataTable,
  renderEmptyState, renderPromptView, renderSourceBadge, renderTimeline
} from '../components/index.js';
import {
  applyWriteBack, buildPromptArchitect, generatePlan, generateReview, generateShotTimeline,
  getConsistencyRules, getProgress, markConsistencyHits, refreshTaskStatus, reverseAnalyze,
  splitTasks, toggleConsistencyCategory, toggleConsistencyGlobalLock
} from '../core/director.js';
import { isForceDemo, selectConfig } from '../core/model-adapter.js';
import { DIRECTOR_TASK_STATUS, FINDING_SEVERITY, W } from '../constants.js';
import { uid } from '../core/uid.js';
import * as IO from '../io.js';

const 段表 = [
  { id: 'plan', 名: '规划' }, { id: 'execute', 名: '执行' },
  { id: 'review', 名: '复核' }, { id: 'architect', 名: '提示词架构' }
];

// 固定 11 模块：ID 顺序即执行顺序，页面不按数据顺序排列
const 模块名 = {
  'F-001': '剧本', 'F-002': '拆分剧本', 'F-003': '分解提取资产', 'F-004': '人物锚点锁定',
  'F-005': '分镜脚本', 'F-006': '图片生成', 'F-007': '关键帧生成', 'F-008': '提示词',
  'F-009': '画布生成', 'F-010': '分镜生成', 'F-011': '视频整合'
};
const 模块ID们 = Object.keys(模块名);

const 输入源们 = ['项目内分镜', '分镜成品', '关键帧', '粘贴参考视频描述'];

// 与 C-19 的六类固定顺序一致，仅用于把「锁定/解锁」按钮编号映射回项目规则
const 一致性类别 = ['人物变脸', '服装脱落', '肢体错位', '背景闪烁', '动作断裂', '物理关系失真'];

// 当前段 / 选中镜头 / 检查项展开 / 输入源 / 模型选择均为纯 UI 态，产物一律落 Project
let 当前段 = 'plan';
let 选中镜头ID = '';
let 输入源 = '项目内分镜';
let 目标模型配置ID = '';

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
const 状态chip = 状态 => 标({
  已完成: 'chip--ok', 进行中: 'chip--accent', 受阻: 'chip--fail'
}[状态] || 'chip--muted', 状态 || '未开始');
// 目标模块ID → 页面ID：F-003 → p003，与 pages/index.js 的 13 页注册表一一对应
const 模块页 = 模块ID => `p${String(模块ID).slice(2)}`;

export function render(container, ctx, extra = {}) {
  const p = ctx.getProject() || {};
  const btn = (id, spec) => ctx.registerButton(id, spec);
  当前段 = 段表.some(x => x.id === extra.stage) ? extra.stage : 当前段;
  const re = () => ctx.setView('p012', { stage: 当前段 });

  // 状态一律由 refreshTaskStatus 按工程数据重算，禁写死；回落时把缺失去向带回界面
  function 重算状态() {
    const 之前 = new Map((p.directorTasks || []).map(t => [t.目标模块ID, t.状态]));
    const 表 = refreshTaskStatus(p);
    const 掉落 = 表.filter(t => 之前.get(t.目标模块ID) === DIRECTOR_TASK_STATUS.已完成 && t.状态 !== DIRECTOR_TASK_STATUS.已完成)
      .map(t => `${t.目标模块ID} ${模块名[t.目标模块ID] || ''}：${t.受阻原因 || t.状态判定依据 || '产物条目已删除'}`);
    return { 表, 掉落 };
  }
  const 任务结果 = (p.directorTasks || []).length ? 重算状态() : { 表: [], 掉落: [] };
  const 任务表 = 任务结果.表;
  const 进度 = getProgress(p);
  const 完成率 = Math.round((进度.已完成数 / 11) * 100);

  const 规划 = (p.directorPlans || []).slice(-1)[0] || null;
  const 报告 = (p.directorReviews || []).slice(-1)[0] || null;
  const 报告发现 = 报告 ? (p.reviewFindings || []).filter(f => f.报告ID === 报告.报告ID) : [];
  const 时间轴 = (p.shotDeconstructions || []).slice().sort((a, b) => (Number(a.镜头序号) || 0) - (Number(b.镜头序号) || 0));
  const 规则 = getConsistencyRules(p);
  const 命中镜头 = 时间轴.filter(s => (s.一致性标记 || []).length);
  const 结果表 = p.promptArchitectResults || [];

  const 创意文本 = String(p.一句话创意 || '').trim() || String(p.剧本原文 || '').slice(0, 120).trim();
  const 有复核对象 = !!(String(p.剧本原文 || '').trim() || (p.scenes || []).length || (p.shots || []).length
    || (p.storyboardItems || []).length || (p.keyFrames || []).length || p.检查前置确认);

  const 读数 = (role, fallback) => {
    const el = container.querySelector(`[data-role="${role}"]`);
    const n = Number(el ? el.value : fallback);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const 读文 = role => {
    const el = container.querySelector(`[data-role="${role}"]`);
    return el ? String(el.value) : '';
  };

  // ── 规划 ──
  function 生成规划书() {
    const plan = generatePlan(p, {
      创意文本,
      目标集数: 读数('episodes', 2),
      目标单集时长: 读数('duration', 3)
    });
    if (!plan) {
      ctx.showToast('请先输入一句话创意或导入剧本', { level: 'warn' });
      return;
    }
    ctx.commit(() => {});
    re();
    ctx.showToast(W['W-D01'], { level: 'ok' });
  }

  // ── 执行 ──
  function 拆解清单() {
    if (!规划) return;
    const 任务 = splitTasks(p, 规划);
    ctx.commit(() => {});
    re();
    ctx.showToast(`导演执行清单已拆解为 ${任务.length} 条任务`, { level: 'ok' });
  }

  function 刷新状态() {
    const { 掉落 } = 重算状态();
    ctx.commit(() => {});
    re();
    if (掉落.length) ctx.showToast(`任务状态已回落：${掉落.join('；')}`, { level: 'warn' });
    else ctx.showToast('任务状态已最新，11 个模块状态与工程数据一致', { level: 'info' });
  }

  // ── 复核 ──
  function 生成报告(仅当前集) {
    let 范围 = [];
    if (仅当前集) {
      const 集ID = p.当前集ID || ((p.episodes || [])[0] || {}).集ID || '';
      const 场次 = (p.scenes || []).filter(s => s.集ID === 集ID);
      const 分镜 = (p.shots || []).filter(s => 场次.some(x => x.场次ID === s.场次ID));
      const 成品 = (p.storyboardItems || []).filter(s => 分镜.some(x => x.分镜ID === s.分镜ID));
      范围 = [...场次.map(s => s.场次ID), ...分镜.map(s => s.分镜ID), ...成品.map(s => s.成品ID)];
    } else {
      范围 = [
        ...(p.scenes || []).map(s => s.场次ID),
        ...(p.shots || []).map(s => s.分镜ID),
        ...(p.storyboardItems || []).map(s => s.成品ID)
      ];
    }
    const r = generateReview(p, 范围);
    if (!r) {
      ctx.showToast('无可复核对象：缺少剧本 / 场次 / 分镜脚本 / 分镜成品', { level: 'warn' });
      return;
    }
    ctx.commit(() => {});
    re();
    ctx.showToast(`复核报告已生成：${r.检查项结果.length} 个检查项，总判定「${r.总判定}」`, { level: 'ok' });
  }

  function 确认({ title, message, 条目ID, label, confirmId, cancelId, onOk, cancelToast }) {
    openConfirmModal({
      title, message, 变更条目ID: 条目ID, confirmLabel: label,
      confirmBtnId: confirmId, cancelBtnId: cancelId,
      onConfirm: () => { 关弹层(); onOk(); },
      关联FID: 'F-012'
    });
    // C-04 取消默认落④不执行 handler，改登记①才能真关掉浮层并保证零变更
    btn(cancelId, {
      类别: '①',
      handler: () => { 关弹层(); ctx.showToast(cancelToast, { level: 'info' }); },
      关联FID: 'F-012'
    });
  }

  // ── 提示词架构 ──
  const 视频配置 = (p.modelConfigs || []).filter(c => c.用途 === '视频' && c.启用状态 === true);
  if (!视频配置.some(c => c.配置ID === 目标模型配置ID)) 目标模型配置ID = 视频配置[0] ? 视频配置[0].配置ID : '';
  const 目标配置 = 视频配置.find(c => c.配置ID === 目标模型配置ID) || null;
  const 目标spec = 目标配置
    ? { 类型: 目标配置.来源类型 === 'agnes-ai 视频' ? 'agnes-ai视频' : '自定义视频模型', 名称: 目标配置['模型名称/ID'] || 目标配置.配置ID }
    : { 类型: '演示', 名称: '演示模型' };
  const 当前结果 = (选中镜头ID ? 结果表.filter(r => r.关联镜头拆解ID === 选中镜头ID).slice(-1)[0] : null)
    || 结果表.slice(-1)[0] || null;

  function 生成时间轴() {
    const 取分镜ID = 表 => ((表 || [])[0] || {}).分镜ID || '';
    const 分镜ID = 输入源 === '分镜成品' ? 取分镜ID(p.storyboardItems)
      : 输入源 === '关键帧' ? 取分镜ID(p.keyFrames) : 取分镜ID(p.shots);
    const spec = 输入源 === '粘贴参考视频描述'
      ? { 来源类型: '逆向工程', 逆向工程源: '用户粘贴文字描述' }
      : { 来源类型: '项目内分镜', 关联分镜ID: String(分镜ID || '') };
    const 新 = generateShotTimeline(p, spec);
    if (!选中镜头ID || !新.some(s => String(s.条目ID) === 选中镜头ID)) 选中镜头ID = String((新[0] || {}).条目ID || '');
    ctx.commit(() => {});
    re();
    ctx.showToast(`已生成 ${新.length} 条镜头时间轴（23 维度 + 五段式衔接）`, { level: 'ok' });
  }

  function 逆向拆解() {
    const 文本 = 读文('desc').trim();
    const r = reverseAnalyze(p, 文本);
    ctx.commit(() => {});
    re();
    ctx.showToast(`参考描述已拆解为 ${r.镜头拆解.length} 条镜头，仅提取镜头逻辑与视觉方法`, { level: 'ok' });
  }

  function 生成提示词() {
    if (!时间轴.length) return;
    const ids = 选中镜头ID ? [选中镜头ID] : 时间轴.map(s => String(s.条目ID));
    const 结果 = buildPromptArchitect(p, ids, 目标spec);
    if (结果.length) 选中镜头ID = 结果[0].关联镜头拆解ID;
    ctx.commit(() => {});
    re();
    ctx.showToast(`已生成 ${结果.length} 条成品提示词（目标模型：${目标spec.名称}）`, { level: 'ok' });
  }

  function 防漂移检查() {
    markConsistencyHits(p, 时间轴.map(s => String(s.条目ID)));
    const 命中 = (p.shotDeconstructions || []).filter(s => (s.一致性标记 || []).length).length;
    ctx.commit(() => {});
    re();
    ctx.showToast(命中 ? `${命中} 个镜头存在一致性风险，已标红并在顶部汇总` : '未发现一致性风险，镜头衔接连续', { level: 命中 ? 'warn' : 'ok' });
  }

  function 回写一致性() {
    const 已有 = new Set((p.reviewFindings || []).map(f => `${f.检查项}|${f.对象ID}`));
    const 报告ID = 报告 ? 报告.报告ID : '';
    let 新增 = 0;
    for (const s of 命中镜头) {
      if (已有.has(`一致性风险|${s.条目ID}`)) continue;
      // 回写只碰建议字段与待办项，不动原文
      (p.reviewFindings ||= []).push({
        findingID: uid('find'), 报告ID, 检查项: '一致性风险',
        对象类型: '镜头拆解', 对象ID: s.条目ID,
        实测值: (s.一致性标记 || []).join('、'), 期望值: '无一致性风险',
        原因: `镜头 ${s.镜头序号} 命中一致性风险：${(s.一致性标记 || []).join('、')}`,
        建议动作: '回 F-005 调整分镜或回 F-007 重建关键帧后重新生成时间轴',
        目标模块ID: 'F-005', 严重度: FINDING_SEVERITY.提示, 建议替换文本: null
      });
      新增 += 1;
    }
    ctx.commit(() => {});
    re();
    ctx.showToast(新增 ? `已写入 ${新增} 条一致性待办项（不改动剧本原文与分镜正文）` : '一致性命中项已全部登记，无新增', { level: 新增 ? 'ok' : 'info' });
  }

  // ── 分区 HTML ──
  const 规划格 = 规划
    ? [
      ['目标集数', `${规划.目标集数} 集 · 单集 ${规划.目标单集时长} 分钟`],
      ['每集场次数', `${规划.每集场次数} 场`],
      ['角色表', `${(规划.角色表 || {}).人数 || 0} 人`],
      ['视觉基调', 规划.视觉基调 || '—'],
      ['表演密度目标', `${(规划.表演密度目标 || {}).动作描述条数下限 ?? '—'} 条 / ${(规划.表演密度目标 || {}).动作描述字数下限 ?? '—'} 字`],
      ['旁白占比上限', `${规划.旁白占比上限}%`],
      ['台词覆盖率下限', `${规划.台词覆盖率下限}%`]
    ]
    : [];
  const 角色chips = 规划 ? ((规划.角色表 || {}).角色名 || []).map(n => 标('chip--accent', n)).join(' ') : '';
  const 规划网格 = 规划
    ? `<div class="grid-3">${规划格.map(([k, v]) => `<div class="kv"><div class="kv-item">
        <span class="kv-key">${escapeHtml(k)}</span>
        <span class="kv-val" style="white-space:normal">${escapeHtml(v)}${k === '角色表' ? ` ${角色chips}` : ''}</span>
      </div></div>`).join('')}</div>
      <div class="divider"></div>
      <p class="muted">规划依据：${escapeHtml(规划.规划依据 || '—')}</p>
      <div class="toolbar">
        ${标(String(规划.数据来源标记) === '演示数据' ? 'chip--demo' : 'chip--ok', `数据来源：${规划.数据来源标记 || '真实模型'}`)}
        ${String(规划.数据来源标记) === '演示数据' ? '<span class="demo-badge" data-component="demo">来源：演示数据</span>' : ''}
        <span class="mono muted">规划书ID ${escapeHtml(规划.规划书ID)}</span>
        <span class="muted">历史规划书 ${(p.directorPlans || []).length} 份</span>
      </div>`
    : renderEmptyState({
      title: '尚无导演规划书',
      message: '输入目标集数与单集时长后点「生成导演规划书」，7 项字段一次填全',
      missing: ['directorPlans 为空：尚未生成规划书'],
      guideBtnId: 'BTN-P012-90',
      guideLabel: '填写目标集数',
      onGuide: () => {
        const el = container.querySelector('[data-role="episodes"]');
        if (el && typeof el.focus === 'function') el.focus();
        ctx.showToast('填好目标集数与单集时长后点「生成导演规划书」', { level: 'info' });
      },
      关联FID: 'F-012'
    });

  const 规划区 = `<section class="section glass glow-g1">
    <div class="section-head">
      <h2 class="section-title">规划 · 导演规划书</h2>
      <p class="section-sub">按目标集数与单集时长拆解场次、角色与视觉基调，7 项字段随规划书冻结</p>
    </div>
    <div class="section-body">
      <div class="grid-2">
        <div class="field">
          <label class="field-label" for="p012-episodes">目标集数</label>
          <div class="field-control">
            <input id="p012-episodes" class="field-input" type="number" min="1" max="12" data-role="episodes"
              value="${Number(规划 && 规划.目标集数) || 2}">
          </div>
          <p class="field-hint">未填写时按内置默认 2 集生成，并在规划依据里标注假设</p>
        </div>
        <div class="field">
          <label class="field-label" for="p012-duration">目标单集时长（分钟）</label>
          <div class="field-control">
            <input id="p012-duration" class="field-input" type="number" min="1" max="60" data-role="duration"
              value="${Number(规划 && 规划.目标单集时长) || 3}">
          </div>
          <p class="field-hint">时长只写入规划书，不改变已产出分镜的镜头时长</p>
        </div>
      </div>
      <div class="toolbar">
        <button type="button" class="btn btn-primary" data-btn-id="BTN-P012-01">生成导演规划书</button>
        <button type="button" class="btn btn-ghost" data-btn-id="BTN-P012-02">重新生成</button>
        ${标('chip--accent', 创意文本 ? '输入来源：一句话创意 / 剧本原文' : '输入为空')}
      </div>
    </div>
  </section>

  <section class="section glass">
    <div class="section-head">
      <h2 class="section-title">规划书</h2>
      <p class="section-sub">7 项必显字段：目标集数 / 每集场次数 / 角色表 / 视觉基调 / 表演密度目标 / 旁白占比上限 / 台词覆盖率下限</p>
    </div>
    <div class="section-body">${规划网格}</div>
  </section>`;

  const 下一步 = 模块ID们.find(id => !任务表.some(t => t.目标模块ID === id && t.状态 === DIRECTOR_TASK_STATUS.已完成));
  const 任务有序 = 任务表.slice().sort((a, b) => String(a.目标模块ID).localeCompare(String(b.目标模块ID)));
  const 执行表 = 任务有序.length
    ? renderDataTable(
      [
        { key: '模块', label: '模块' },
        { key: '建议参数', label: '建议参数' },
        { key: '前置条件', label: '前置条件' },
        { key: '状态', label: '状态' },
        { key: '依据', label: '状态判定依据' },
        { key: '受阻', label: '受阻原因' },
        { key: '操作', label: '操作' }
      ],
      任务有序.map((t, i) => ({
        模块: `${t.目标模块ID} · ${模块名[t.目标模块ID] || ''}`,
        建议参数: `__PARAM_${i}__`,
        前置条件: (t.前置条件 || []).join('、') || '无前置',
        状态: `__STATUS_${i}__`,
        依据: 截断(t.状态判定依据, 72),
        受阻: `__BLOCK_${i}__`,
        操作: `__ACT_${i}__`
      })),
      { raw: true, countBtnId: 'BTN-P012-30' }
    )
      .replace(/__PARAM_(\d+)__/g, (_, n) => {
        const 参数 = 任务有序[Number(n)].建议参数 || {};
        const 项 = Object.entries(参数).map(([k, v]) => 标('chip--accent', `${k} ${v}`));
        return 项.length ? 项.join(' ') : '<span class="muted">无</span>';
      })
      .replace(/__STATUS_(\d+)__/g, (_, n) => 状态chip(任务有序[Number(n)].状态))
      .replace(/__BLOCK_(\d+)__/g, (_, n) => {
        const 原因 = 任务有序[Number(n)].受阻原因;
        return 原因 ? `<span style="color:var(--fail)">${escapeHtml(截断(原因, 60))}</span>` : '<span class="muted">—</span>';
      })
      .replace(/__ACT_(\d+)__/g, (_, n) => `<button type="button" class="btn btn-ghost" data-btn-id="BTN-P012-${10 + Number(n)}">前往</button>`)
    : renderEmptyState({
      title: '尚无执行清单',
      message: 规划 ? '已具备规划书，点「拆解执行清单」生成 11 条模块任务' : '请先在「规划」段生成导演规划书',
      missing: ['directorTasks 为空：尚未拆解'],
      guideBtnId: 'BTN-P012-91',
      guideLabel: 规划 ? '拆解执行清单' : '前往规划段',
      onGuide: 规划 ? 拆解清单 : () => { 当前段 = 'plan'; re(); },
      关联FID: 'F-012'
    });

  const 执行区 = `<section class="section glass glow-g1">
    <div class="section-head">
      <h2 class="section-title">执行 · 11 模块调度</h2>
      <p class="section-sub">状态一律由 refreshTaskStatus 按工程数据重算，禁写死；产物被删即回落并列出缺失</p>
    </div>
    <div class="section-body">
      <div class="toolbar">
        <button type="button" class="btn btn-primary" data-btn-id="BTN-P012-03">拆解执行清单</button>
        <button type="button" class="btn btn-ghost" data-btn-id="BTN-P012-04">刷新状态</button>
        ${标(进度.受阻数 ? 'chip--fail' : 'chip--ok', `受阻 ${进度.受阻数}`)}
      </div>
      <div class="toolbar" style="gap:10px">
        <div class="progress" style="flex:1 1 200px;min-width:120px"><span class="progress__bar" style="width:${完成率}%"></span></div>
        <span class="muted">已完成 ${进度.已完成数} / 11</span>
        <span class="muted">下一步建议：${下一步 ? `${下一步} · ${模块名[下一步]}` : '全部模块已就绪'}</span>
      </div>
      ${执行表}
    </div>
  </section>`;

  const 检查项 = (报告 && 报告.检查项结果) || [];
  const 原因表 = 检查项.map(c => {
    const 相关 = 报告发现.filter(f => f.检查项 === c.检查项);
    return 相关.length
      ? 相关.map(f => `${f.对象ID}：${f.原因}｜建议：${f.建议动作}`).join('\n')
      : '本项通过，无原因需展开';
  });
  const 检查表 = 检查项.length
    ? renderDataTable(
      [
        { key: '检查项', label: '检查项' },
        { key: '实测值', label: '实测值' },
        { key: '期望值', label: '期望值' },
        { key: '结论', label: '结论' },
        { key: '原因', label: '原因' }
      ],
      检查项.map((c, i) => ({
        检查项: `${c.编号 ? `${c.编号} ` : ''}${c.检查项}`,
        实测值: c.实测值,
        期望值: c.阈值,
        结论: `__CONC_${i}__`,
        原因: `__CAUSE_${i}__`
      })),
      { raw: true, countBtnId: 'BTN-P012-31' }
    )
      .replace(/__CONC_(\d+)__/g, (_, n) => 标(检查项[Number(n)].结论 === '通过' ? 'chip--ok' : 'chip--fail', 检查项[Number(n)].结论))
      .replace(/__CAUSE_(\d+)__/g, (_, n) => `<div class="toolbar" style="gap:6px;flex-wrap:wrap">
        <button type="button" class="btn btn-ghost" data-btn-id="BTN-P012-${40 + Number(n)}">原因</button>
        <div data-role="cause-${Number(n)}" hidden style="white-space:normal;max-width:300px;font-size:11px;line-height:16px;color:var(--text-3)">${escapeHtml(原因表[Number(n)]).replace(/\n/g, '<br>')}</div>
      </div>`)
    : '';

  const 发现列表 = 报告发现.length
    ? `<div class="list">${报告发现.map(f => `<article class="glass list-item">
        <div class="list-item__main">
          <div class="toolbar">
            <strong class="ellipsis">${escapeHtml(f.检查项)}</strong>
            ${标(f.严重度 === FINDING_SEVERITY.阻塞 ? 'chip--fail' : 'chip--warn', f.严重度 || '提示')}
            <span class="mono muted">${escapeHtml(f.对象类型 || '')} ${escapeHtml(f.对象ID || '')}</span>
          </div>
          <div class="kv">
            <div class="kv-item"><span class="kv-key">实测值</span><span class="kv-val" style="white-space:normal">${escapeHtml(f.实测值 || '—')}</span></div>
            <div class="kv-item"><span class="kv-key">期望值</span><span class="kv-val" style="white-space:normal">${escapeHtml(f.期望值 || '—')}</span></div>
            <div class="kv-item"><span class="kv-key">目标模块</span><span class="kv-val">${escapeHtml(f.目标模块ID || '—')}</span></div>
          </div>
          <div class="list-item__meta">原因：${escapeHtml(f.原因 || '—')}</div>
          <div class="list-item__meta">建议动作：${escapeHtml(f.建议动作 || '—')}</div>
          <div class="list-item__meta">建议替换文本：${escapeHtml(f.建议替换文本 ? String(f.建议替换文本.文本 || f.建议替换文本) : '无（仅给建议动作）')}</div>
        </div>
      </article>`).join('')}</div>`
    : `<div class="toolbar">${标('chip--ok', '无不通过项')}<span class="muted">当前报告无阻塞或提示级发现项</span></div>`;

  const 复核区 = `<section class="section glass glow-g1">
    <div class="section-head">
      <h2 class="section-title">复核 · 成片体检</h2>
      <p class="section-sub">15 项检查 = 原 7 项一致性检查 + R-01~R-08 规则复核；不通过只给结论与建议，不阻断任何操作</p>
    </div>
    <div class="section-body">
      <div class="toolbar">
        <button type="button" class="btn btn-primary" data-btn-id="BTN-P012-05">生成复核报告</button>
        <button type="button" class="btn btn-ghost" data-btn-id="BTN-P012-06">仅当前集</button>
        ${报告 ? 标(报告.总判定 === '通过' ? 'chip--ok' : 'chip--fail', `总判定：${报告.总判定}`) : ''}
        ${报告 && 报告.是否过期 ? 标('chip--warn', '已过期') : ''}
      </div>
      ${报告 ? `<div class="toolbar">
        ${标(String(报告.数据来源标记) === '演示数据' ? 'chip--demo' : 'chip--ok', `数据来源：${报告.数据来源标记 || '真实模型'}`)}
        ${String(报告.数据来源标记) === '演示数据' ? '<span class="demo-badge" data-component="demo">来源：演示数据</span>' : ''}
        <span class="muted">生成时间：${escapeHtml(报告.生成时间 || '—')}</span>
        <span class="muted">检查项：${检查项.length} 项 · 不通过项：${报告发现.length} 条</span>
      </div>
      <p class="mono muted ellipsis">复核范围：${escapeHtml((报告.复核范围 || []).join('、') || '—')}</p>
      ${报告.是否过期 ? renderAlertBar('复核后数据已变更，建议重新复核', { tone: 'degrade' }) : ''}
      ${检查表}
      <div class="divider"></div>
      <h3 class="section-title">不通过项</h3>
      ${发现列表}
      <div class="toolbar">
        <button type="button" class="btn btn-danger" data-btn-id="BTN-P012-07">一键回写修正</button>
        <span class="muted">仅写入建议字段与待办项，不修改剧本原文、分镜正文、锚点与锁定词</span>
      </div>` : renderEmptyState({
        title: '尚无复核报告',
        message: 有复核对象 ? '点「生成复核报告」对全部场次 / 分镜 / 成品做 15 项检查' : '无可复核对象：缺少剧本 / 场次 / 分镜脚本 / 分镜成品',
        missing: 有复核对象 ? ['directorReviews 为空：尚未复核'] : ['剧本', '场次', '分镜脚本', '分镜成品'],
        guideBtnId: 'BTN-P012-92',
        guideLabel: 有复核对象 ? '生成复核报告' : '前往 F-001 生成剧本',
        onGuide: 有复核对象 ? () => 生成报告(false) : () => ctx.setView('p001'),
        关联FID: 'F-012'
      })}
    </div>
  </section>`;

  const 模型选项 = `<select class="field-input" style="width:200px" data-role="model" aria-label="目标视频模型">${
    视频配置.map(c => `<option value="${escapeHtml(c.配置ID)}"${c.配置ID === 目标模型配置ID ? ' selected' : ''}>${escapeHtml(c['模型名称/ID'] || c.配置ID)} · ${escapeHtml(c.来源类型 || '')}</option>`).join('')
  }<option value=""${目标配置 ? '' : ' selected'}>演示模型</option></select>`;

  const 命中汇总 = 命中镜头.length
    ? renderAlertBar(`${命中镜头.length} 个镜头存在一致性风险`, { tone: 'fail' })
      + `<div class="list">${命中镜头.map(s => `<article class="glass list-item consistency-hit">
          <div class="list-item__main">
            <div class="toolbar">
              <span class="mono">镜 ${escapeHtml(s.镜头序号)}</span>
              <span class="mono muted">${escapeHtml(String(s.条目ID))}</span>
              ${(s.一致性标记 || []).map(t => 标('chip--fail', t)).join(' ')}
            </div>
            <div class="list-item__meta">原因：${escapeHtml((s.一致性标记 || []).map(t => {
              const r = 规则.find(x => x.类别 === t);
              return `${t}（${(r && r.判定口径) || '相邻镜头衔接不一致'}）`;
            }).join('；'))}</div>
          </div>
        </article>`).join('')}</div>`
    : '';

  const 架构区 = `<section class="section glass glow-g1">
    <div class="section-head">
      <h2 class="section-title">提示词架构 · 23 维度时间轴</h2>
      <p class="section-sub">先时间轴后提示词：镜头时间轴是成品提示词的唯一输入，时间轴为空时不可生成</p>
    </div>
    <div class="section-body">
      <div class="toolbar">
        <label class="field-label" for="p012-model">目标视频模型</label>
        ${模型选项}
        ${!视频配置.length ? 标('chip--demo', '无视频模型配置') : ''}
        <button type="button" class="btn btn-primary" data-btn-id="BTN-P012-20">生成镜头时间轴</button>
        <button type="button" class="btn btn-ghost" data-btn-id="BTN-P012-21">逆向拆解参考描述</button>
        <button type="button" class="btn btn-primary" data-btn-id="BTN-P012-22">生成成品提示词</button>
        <button type="button" class="btn btn-ghost" data-btn-id="BTN-P012-23">刷新</button>
      </div>
      <div class="toolbar">
        ${输入源们.map((s, i) => `<button type="button" class="tab${输入源 === s ? ' is-active active' : ''}" data-btn-id="BTN-P012-${60 + i}">${escapeHtml(s)}</button>`).join('')}
        ${标('chip--accent', `时间轴 ${时间轴.length} 镜`)}
        ${标(结果表.length ? 'chip--ok' : 'chip--muted', `成品提示词 ${结果表.length} 条`)}
      </div>
      <div class="toolbar">
        <button type="button" class="btn btn-ghost" data-btn-id="BTN-P012-25">防漂移检查</button>
        <button type="button" class="btn btn-ghost" data-btn-id="BTN-P012-24">一键回写一致性命中项</button>
        <span class="muted">命中项只写入待办与建议字段，不改动原文</span>
      </div>
      ${输入源 === '粘贴参考视频描述' ? `<div class="field">
        <label class="field-label" for="p012-desc">参考视频描述</label>
        <div class="field-control">
          <textarea id="p012-desc" class="field-input" rows="4" data-role="desc" placeholder="粘贴参考片段的结构化描述：景别、机位、运镜、光线、节奏…"></textarea>
        </div>
        <p class="field-hint">仅提取镜头逻辑与视觉方法，不复制人物、品牌、台词与具体故事</p>
      </div>` : ''}
      ${命中汇总}
      <div id="p012-timeline"></div>
      <div id="p012-consistency"></div>
      <div class="toolbar" id="p012-prompt-meta"></div>
      <div id="p012-prompt"></div>
      <p class="muted">主体身份已脱敏为 角色A / 角色B，不包含真实人物、品牌与台词</p>
    </div>
  </section>`;

  const 分段HTML = { plan: 规划区, execute: 执行区, review: 复核区, architect: 架构区 };
  const 段状态 = {
    plan: !!(p.directorPlans || []).length,
    execute: !!(p.directorTasks || []).length,
    review: !!(p.directorReviews || []).length,
    architect: !!(p.shotDeconstructions || []).length
  };
  const 文本模型 = selectConfig(p, '文本');
  const 演示 = isForceDemo(p) || !文本模型;

  container.innerHTML = `<div class="page" data-page="p012">
    <header class="page-head">
      <div class="page-head__main">
        <h1 class="page-title">AI 短剧导演</h1>
        <p class="page-desc">统筹规划、执行调度、成片复核与提示词架构，一位全程在线的导演</p>
      </div>
      <div class="page-head__actions" style="flex-direction:column;align-items:flex-end;gap:6px;align-self:center">
        <div class="progress" style="width:180px"><span class="progress__bar" style="width:${完成率}%"></span></div>
        <span class="muted">${进度.已完成数} / 11 模块已就绪</span>
      </div>
    </header>

    <div class="toolbar" style="justify-content:flex-end">
      ${renderSourceBadge({
        sourceType: '统一适配层', purpose: '文本',
        modelId: 文本模型 ? (文本模型['模型名称/ID'] || 文本模型.配置ID) : '',
        degradeReason: 演示 ? '未配置' : '', dataMark: 演示 ? '演示数据' : '真实模型', compact: true
      }, { btnId: 'BTN-C15-P012-CHAIN' })}
    </div>

    <div class="director-tabs" role="tablist">
      ${段表.map((s, i) => `<button type="button" class="tab${当前段 === s.id ? ' is-active active' : ''}" data-btn-id="BTN-P012-T${i + 1}">
        ${escapeHtml(s.名)}
        <span class="badge-dot" style="margin-left:6px;${段状态[s.id] ? '' : 'background:var(--border);box-shadow:none'}"></span>
      </button>`).join('')}
    </div>

    ${分段HTML[当前段]}
  </div>`;

  // C-15 的调用链面板靠 hidden 属性折叠，但 .chain-panel 的 display:grid 会盖掉 [hidden]，
  // 页面内改用内联 display 收起，点「查看调用链」再展开，避免占掉 290px 垂直空间挤走正文
  const 链板 = container.querySelector('.source-badge .chain-panel');
  if (链板) {
    链板.style.display = 'none';
    btn('BTN-C15-P012-CHAIN', {
      类别: '①',
      handler: () => { 链板.style.display = 链板.style.display === 'none' ? 'grid' : 'none'; },
      关联FID: 'CR-06'
    });
  }

  // ── 分段 Tab：段编码进 hash，刷新后停留同一段 ──
  段表.forEach((s, i) => {
    btn(`BTN-P012-T${i + 1}`, {
      类别: '①',
      handler: () => {
        const h = `#/p012/${s.id}`;
        if (typeof location !== 'undefined' && location.hash !== h) location.hash = h;
        else { 当前段 = s.id; re(); }
      },
      关联FID: 'F-012'
    });
  });

  // ── 规划段 ──
  btn('BTN-P012-01', {
    类别: 创意文本 ? '①' : '②',
    禁用原因: '请先在 F-001 输入一句话创意或导入剧本',
    handler: 生成规划书,
    关联FID: 'F-012'
  });
  btn('BTN-P012-02', {
    类别: 规划 && 创意文本 ? '①' : '②',
    禁用原因: 规划 ? '请先在 F-001 输入一句话创意或导入剧本' : '尚无规划书，请先点「生成导演规划书」',
    handler: () => 确认({
      title: '重新生成导演规划书',
      message: `将按当前输入新增一份规划书，旧规划书（${规划.规划书ID}）保留在历史中，共 ${(p.directorPlans || []).length} 份。`,
      条目ID: [规划.规划书ID],
      label: '确认重新生成',
      confirmId: 'BTN-P012-02a',
      cancelId: 'BTN-P012-02b',
      onOk: 生成规划书,
      cancelToast: '已取消重新生成，规划书未改变'
    }),
    关联FID: 'F-012'
  });

  // ── 执行段 ──
  btn('BTN-P012-03', {
    类别: 规划 ? '①' : '②',
    禁用原因: '请先在「规划」段生成导演规划书',
    handler: 拆解清单,
    关联FID: 'F-012'
  });
  btn('BTN-P012-04', {
    类别: 任务表.length ? '①' : '②',
    禁用原因: '尚无执行清单，请先拆解执行清单',
    handler: 刷新状态,
    关联FID: 'F-012'
  });
  任务有序.forEach((t, i) => {
    const 页 = 模块页(t.目标模块ID);
    const 可达 = /^p0(0[1-9]|1[0-2])$/.test(页);
    btn(`BTN-P012-${10 + i}`, 可达
      ? { 类别: '①', handler: () => ctx.setView(页), 关联FID: 'F-012' }
      : { 类别: '④', toast: W['W-D12'], 关联FID: 'F-012' });
  });

  // ── 复核段 ──
  btn('BTN-P012-05', {
    类别: 有复核对象 ? '①' : '②',
    禁用原因: '无可复核对象：缺少剧本 / 场次 / 分镜脚本 / 分镜成品',
    handler: () => 生成报告(false),
    关联FID: 'F-012'
  });
  btn('BTN-P012-06', {
    类别: (p.scenes || []).length ? '①' : '②',
    禁用原因: '当前集暂无场次，请先在 F-002 完成拆分',
    handler: () => 生成报告(true),
    关联FID: 'F-012'
  });
  btn('BTN-P012-07', {
    类别: 报告 && 报告发现.length ? '①' : '②',
    禁用原因: 报告 ? '当前报告无不通过项，无需回写' : '尚无复核报告，请先生成复核报告',
    handler: () => 确认({
      title: '一键回写修正',
      message: W['W-D04'].replace('<ID 清单>', `${报告发现.length} 条`),
      条目ID: 报告发现.map(f => f.findingID),
      label: '确认回写',
      confirmId: 'BTN-P012-07a',
      cancelId: 'BTN-P012-07b',
      onOk: () => {
        const r = applyWriteBack(p, 报告.报告ID, true);
        ctx.commit(() => {});
        re();
        ctx.showToast(r.changed.length
          ? `回写完成：已写入 ${r.changed.length} 条建议字段与待办项；原报告已标记「已过期」`
          : '回写完成：当前报告无可写入的建议字段与待办项，工程数据未变更；原报告已标记「已过期」', { level: 'ok' });
      },
      cancelToast: '已取消回写，工程数据零变更'
    }),
    关联FID: 'F-012'
  });
  检查项.forEach((c, i) => {
    btn(`BTN-P012-${40 + i}`, {
      类别: '①',
      handler: () => {
        const 盒 = container.querySelector(`[data-role="cause-${i}"]`);
        const 按 = container.querySelector(`[data-btn-id="BTN-P012-${40 + i}"]`);
        if (!盒) return;
        盒.hidden = !盒.hidden;
        if (按) 按.textContent = 盒.hidden ? '原因' : '收起';
      },
      关联FID: 'F-012'
    });
  });

  // ── 提示词架构段 ──
  btn('BTN-P012-20', {
    类别: 输入源 === '粘贴参考视频描述' ? '②' : '①',
    禁用原因: '粘贴模式请改用「逆向拆解参考描述」',
    handler: 生成时间轴,
    关联FID: 'F-012'
  });
  输入源们.forEach((s, i) => {
    btn(`BTN-P012-${60 + i}`, {
      类别: '①',
      handler: () => { 输入源 = s; re(); ctx.showToast(`输入源已切换为：${s}`, { level: 'info' }); },
      关联FID: 'F-012'
    });
  });
  const 粘贴文本 = 输入源 === '粘贴参考视频描述' ? 读文('desc').trim() : '';
  btn('BTN-P012-21', {
    类别: 输入源 === '粘贴参考视频描述' && 粘贴文本 ? '①' : '②',
    禁用原因: 输入源 === '粘贴参考视频描述' ? '请先粘贴参考视频描述文本' : '请先切换到「粘贴参考视频描述」输入源',
    handler: 逆向拆解,
    关联FID: 'F-012'
  });
  // 先时间轴后提示词：时间轴为空一律②并复述原因，不得静默无反应
  btn('BTN-P012-22', {
    类别: 时间轴.length ? '①' : '②',
    禁用原因: '请先生成镜头时间轴',
    handler: 生成提示词,
    关联FID: 'F-012'
  });
  btn('BTN-P012-23', {
    类别: '①',
    handler: () => { re(); ctx.showToast('状态已最新', { level: 'info' }); },
    关联FID: 'F-012'
  });
  btn('BTN-P012-24', {
    类别: 命中镜头.length ? '①' : '②',
    禁用原因: '暂无一致性命中项，请先执行「防漂移检查」',
    handler: 回写一致性,
    关联FID: 'F-012'
  });
  btn('BTN-P012-25', {
    类别: 时间轴.length ? '①' : '②',
    禁用原因: '请先生成镜头时间轴',
    handler: 防漂移检查,
    关联FID: 'F-012'
  });

  if (当前段 === 'architect') {
    const 时间轴盒 = container.querySelector('#p012-timeline');
    renderTimeline(时间轴盒, {
      shots: 时间轴,
      selectedShotId: 选中镜头ID,
      onSelect: id => { 选中镜头ID = String(id); re(); },
      onExpand: id => { 选中镜头ID = 选中镜头ID === String(id) ? '' : String(id); re(); },
      onEdit: id => { 选中镜头ID = String(id); re(); },
      onRefresh: () => { ctx.commit(() => {}); re(); }
    });
    // C-16 空态引导默认只回调节点刷新（文案说跳转但不换页），本页改为真跳 F-005
    if (!时间轴.length) btn('BTN-C10-P005-01', { 类别: '①', handler: () => ctx.setView('p005'), 关联FID: 'F-005' });

    const 约束盒 = container.querySelector('#p012-consistency');
    renderConsistencyEditor(约束盒, {
      rules: 规则,
      globalLock: !!p.一致性约束锁定,
      onToggleCategory: 类别 => {
        // 核心只暴露 toggleConsistencyCategory（翻转该类锁定），页面不另造第二套规则集合
        toggleConsistencyCategory(p, 类别);
        ctx.commit(() => {});
        re();
      },
      onLockCategory: 类别 => {
        if (类别 === '__global__') toggleConsistencyGlobalLock(p, true);
        else {
          const r = 规则.find(x => x.类别 === 类别);
          if (r) r.全局锁定状态 = true;
        }
        ctx.commit(() => {});
        re();
      },
      onUnlockCategory: 类别 => {
        关弹层();
        if (类别 === '__global__') toggleConsistencyGlobalLock(p, false);
        else {
          const r = 规则.find(x => x.类别 === 类别);
          if (r) r.全局锁定状态 = false;
        }
        ctx.commit(() => {});
        re();
      }
    });
    // C-19 的解锁确认走组件内固定 ID 的 C-04（取消落④不关浮层），本页改用自有 ID 重登记：
    // 取消真关闭且锁定状态零变更，确认才写回规则
    一致性类别.forEach((类别, i) => {
      const 条 = 规则.find(x => x.类别 === 类别);
      const 已锁 = !!(条 && 条.全局锁定状态);
      btn(`BTN-C19-P012-LK-0${i + 1}`, {
        类别: '①',
        handler: () => {
          if (!已锁) {
            if (条) 条.全局锁定状态 = true;
            ctx.commit(() => {});
            re();
            ctx.showToast(`一致性约束「${类别}」已锁定`, { level: 'ok' });
            return;
          }
          确认({
            title: '解锁一致性约束',
            message: `解锁「${类别}」后，此后新提示词不再强制附加该类（词文本保留）。`,
            条目ID: [],
            label: '确认解锁',
            confirmId: 'BTN-P012-26a',
            cancelId: 'BTN-P012-26b',
            onOk: () => {
              const t = 规则.find(x => x.类别 === 类别);
              if (t) t.全局锁定状态 = false;
              ctx.commit(() => {});
              re();
              ctx.showToast(`一致性约束「${类别}」已解锁`, { level: 'ok' });
            },
            cancelToast: '已取消，锁定状态未改变'
          });
        },
        关联FID: 'F-012'
      });
    });

    btn('BTN-C19-P012-07', {
      类别: '①',
      handler: () => {
        if (!p.一致性约束锁定) {
          toggleConsistencyGlobalLock(p, true);
          ctx.commit(() => {});
          re();
          ctx.showToast('一致性约束已全局锁定', { level: 'ok' });
          return;
        }
        确认({
          title: '解除一致性约束全局锁定',
          message: '解除全局锁定后，此后新提示词不再强制附加 6 类禁止项（默认开启，与 NEG 同源）。',
          条目ID: [],
          label: '确认解锁',
          confirmId: 'BTN-P012-26a',
          cancelId: 'BTN-P012-26b',
          onOk: () => {
            toggleConsistencyGlobalLock(p, false);
            ctx.commit(() => {});
            re();
            ctx.showToast('一致性约束已全局解锁', { level: 'ok' });
          },
          cancelToast: '已取消，锁定状态未改变'
        });
      },
      关联FID: 'F-012'
    });

    const 提示词盒 = container.querySelector('#p012-prompt');
    if (当前结果) {
      renderPromptView(提示词盒, { result: 当前结果 });
      // pre 默认 white-space:pre 不换行，会把整页最小宽度顶到 1600px 以上；此处只做换行收敛
      提示词盒.querySelectorAll('.prompt-text').forEach(el => {
        el.style.whiteSpace = 'pre-wrap';
        el.style.wordBreak = 'break-word';
      });
      const 元盒 = container.querySelector('#p012-prompt-meta');
      if (元盒) {
        元盒.innerHTML = `${标('chip--accent', `目标模型：${当前结果.目标模型}`)}${标(String(当前结果.来源标记) === '演示数据' ? 'chip--demo' : 'chip--ok', `来源标记：${当前结果.来源标记}`)}<span class="muted">八要素结构 ${Object.keys(当前结果.八要素结构 || {}).length} 项 · 一致性约束 ${(当前结果.一致性约束组 || []).length} 类</span>`;
      }
      // C-18 的复制按钮默认落④不执行复制，按本页口径改登记①并给出「提示词已复制」
      btn('BTN-C18-P012-01', {
        类别: '①',
        handler: () => {
          const c = typeof navigator !== 'undefined' && navigator.clipboard;
          if (c && c.writeText) c.writeText([当前结果.正向提示词, 当前结果.负面提示词].join('\n')).catch(() => {});
        },
        toast: '提示词已复制',
        关联FID: 'F-012'
      });
      btn('BTN-C18-P012-02', {
        类别: '①',
        handler: () => {
          try {
            IO.exportFile(当前结果, 'json', '成品提示词.json');
          } catch (e) {
            ctx.showToast(String((e && e.message) || '导出中止，未生成文件'), { level: 'error' });
          }
        },
        toast: '提示词已导出（已校验：不含 API Key）',
        关联FID: 'F-012'
      });
    } else {
      提示词盒.innerHTML = renderEmptyState({
        title: '尚无成品提示词',
        message: 时间轴.length ? '选中一个镜头后点「生成成品提示词」，按 8 要素框架输出正向词与负面词' : '请先生成镜头时间轴',
        missing: 时间轴.length ? ['promptArchitectResults 为空：尚未生成'] : ['shotDeconstructions 为空：时间轴未生成'],
        guideBtnId: 'BTN-P012-93',
        guideLabel: 时间轴.length ? '生成成品提示词' : '生成镜头时间轴',
        onGuide: 时间轴.length ? 生成提示词 : 生成时间轴,
        关联FID: 'F-012'
      });
    }
  }

  // 进入即重算：状态回落属于数据事实，进页就要让人看见，不藏在按钮后面
  if (任务结果.掉落.length) {
    ctx.showToast(`任务状态已回落：${任务结果.掉落.join('；')}`, { level: 'warn' });
  }
}
