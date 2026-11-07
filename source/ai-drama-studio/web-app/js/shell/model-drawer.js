import { renderModelConfigForm } from '../components/index.js';
import { callModel, selectConfig } from '../core/model-adapter.js';
import { SOURCE_MARK } from '../constants.js';
import { uid } from '../core/uid.js';

const GROUPS = [
  { key: 'text', title: '① agnes-ai · 文本', 来源类型: SOURCE_MARK['agnes-ai 文本'], 默认用途: '文本', saveBtn: 'BTN-MDL-01', cancelBtn: 'BTN-MDL-04' },
  { key: 'media', title: '② agnes-ai · 媒体', 来源类型: SOURCE_MARK['agnes-ai 媒体'], 默认用途: '媒体', saveBtn: 'BTN-MDL-02', cancelBtn: 'BTN-MDL-05' },
  { key: 'custom', title: '③ 自定义（Base URL + API Key + 用途）', 来源类型: SOURCE_MARK.自定义, 默认用途: '文本', saveBtn: 'BTN-MDL-03', cancelBtn: 'BTN-MDL-06' },
];

const USAGES = ['文本', '媒体', '视频'];

function findConfig(project, 来源类型) {
  return (project.modelConfigs || []).find(c => c && c.来源类型 === 来源类型) || null;
}

function groupRoot(key) {
  return typeof document !== 'undefined' ? document.querySelector('[data-group="' + key + '"]') : null;
}

function fieldValue(root, name) {
  const el = root ? root.querySelector('[name="' + name + '"]') : null;
  return el && typeof el.value === 'string' ? el.value.trim() : '';
}

function saveGroup(ctx, group) {
  const root = groupRoot(group.key);
  if (!root) return;
  const base = fieldValue(root, 'Base URL');
  const model = fieldValue(root, '模型名称/ID');
  const 用途 = fieldValue(root, '用途') || group.默认用途;

  if (!base || !model) { ctx.showToast('必填项未完成：Base URL 与 模型名称/ID 不能为空', { level: 'warn' }); return; }
  if (!USAGES.includes(用途)) { ctx.showToast('用途只能填写：文本 / 媒体 / 视频', { level: 'warn' }); return; }

  const project = ctx.getProject();
  const 已有ID = (findConfig(project, group.来源类型) || {}).配置ID;
  const secretInput = root.querySelector('[data-secret="1"]');
  const enabled = root.querySelector('[name="启用状态"]');
  const timeout = Number(fieldValue(root, '超时阈值')) || 30;

  ctx.commit(target => {
    const list = (target.modelConfigs || (target.modelConfigs = []));
    let cfg = list.find(c => c.配置ID === 已有ID);
    if (!cfg) { cfg = { 配置ID: uid('mc') }; list.push(cfg); }
    cfg.来源类型 = group.来源类型;
    cfg.用途 = 用途;
    cfg['Base URL'] = base;
    cfg['模型名称/ID'] = model;
    cfg.超时阈值 = timeout;
    cfg.启用状态 = !!(enabled && enabled.checked);
    // 密钥只写内存态；落盘由 storage 抽取到 SECRETS 通道并从工程 JSON 剥离，导出物结构上不含该键
    if (secretInput && secretInput.value) cfg['API Key'] = secretInput.value;
    const refs = target.模型配置引用 || (target.模型配置引用 = []);
    if (!refs.includes(cfg.配置ID)) refs.push(cfg.配置ID);
  });

  ctx.showToast('模型配置已保存；密钥仅存本地密钥通道，不进入工程明文与导出物', { level: 'info' });
}

export function openModelDrawer(ctx) {
  const host = typeof document !== 'undefined' ? document.getElementById('modalRoot') : null;
  if (!host || !ctx || typeof ctx.getProject !== 'function') return;

  const project = ctx.getProject() || {};
  const forms = GROUPS.map(g => {
    const cfg = findConfig(project, g.来源类型) || {};
    return `<div class="md-group" data-group="${g.key}">
      <h3>${g.title}</h3>
      ${renderModelConfigForm({
        ...cfg,
        来源类型: cfg.来源类型 || g.来源类型,
        用途: cfg.用途 || g.默认用途,
        超时阈值: cfg.超时阈值 || 30,
        启用状态: cfg.启用状态 === true,
      }, { saveBtnId: g.saveBtn, cancelBtnId: g.cancelBtn, 关联FID: 'M-001' })}
    </div>`;
  }).join('');

  host.innerHTML = `<div class="md-mask" data-component="model-drawer">
    <aside class="glass md" role="dialog" aria-modal="true" aria-label="模型配置">
      <div class="md-head">
        <h2>模型配置（M-001）</h2>
        <button class="btn btn-ghost" type="button" data-btn-id="BTN-MDL-10">关闭</button>
      </div>
      <p class="md-hint">API Key 只写入本地密钥通道（SECRETS），不进入工程明文、不进入导出物，界面永不回显真实值。未配置模型或配置未启用时，全部流程自动使用演示数据并可继续；也可直接勾选顶部「强制演示数据」，此时不会向任何模型地址发起请求。</p>
      <p class="md-hint">自定义配置的「用途」可填写：文本 / 媒体 / 视频。</p>
      ${forms}
      <div class="form-actions">
        <button class="btn btn-ghost" type="button" data-btn-id="BTN-MDL-09">连通性测试</button>
      </div>
    </aside>
  </div>`;

  // C-06 自带固定成功 Toast；此处覆盖为无 toast 版本，改为按校验结果给出可读反馈
  GROUPS.forEach(g => {
    ctx.registerButton(g.saveBtn, { 类别: '①', 关联FID: 'M-001', handler: () => saveGroup(ctx, g) });
  });

  ctx.registerButton('BTN-MDL-09', {
    类别: '①', 关联FID: 'M-001',
    handler: async () => {
      const p = ctx.getProject();
      const cfg = selectConfig(p, '文本');
      if (!cfg) {
        ctx.showToast(p.是否强制演示数据
          ? '已强制使用演示数据，不会向任何模型地址发起请求'
          : '请先填写 Base URL 与 API Key，并勾选启用状态后再测试', { level: 'warn' });
        return;
      }
      const r = await callModel(p, '文本', { prompt: '连通性测试：仅返回 ok' });
      if (r.ok) { ctx.showToast('连通成功，耗时 ' + (r.latencyMs || 0) + ' ms', { level: 'ok' }); return; }
      ctx.showToast('连通失败：' + (r.message || '未知原因') + '（耗时 ' + (r.latencyMs || 0) + ' ms）', { level: 'warn' });
    }
  });

  ctx.registerButton('BTN-MDL-10', { 类别: '①', 关联FID: 'M-001', handler: () => closeModelDrawer(ctx) });
}

export function closeModelDrawer() {
  const host = typeof document !== 'undefined' ? document.getElementById('modalRoot') : null;
  if (host) host.innerHTML = '';
}
