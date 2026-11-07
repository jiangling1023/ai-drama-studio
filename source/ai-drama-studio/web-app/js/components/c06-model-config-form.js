import { escapeHtml } from './index.js';
import { registerButton } from '../core/ui-response.js';

// C-06 模型配置表单：输入框 100% 不透明实底、密钥区不加光晕；API Key 永不回显真实值，只给掩码占位
export function renderModelConfigForm(config = {}, opts = {}) {
  const saveId = opts.saveBtnId || 'BTN-M001-05';
  const cancelId = opts.cancelBtnId || 'BTN-M001-06';
  registerButton(saveId, { 类别: '①', handler: opts.onSave, 禁用原因: '必填项未完成：模型名称/ID 不能为空', toast: '模型配置已保存', 关联FID: opts.关联FID });
  registerButton(cancelId, { 类别: '④', toast: '已取消，配置未改变', handler: opts.onCancel, 关联FID: opts.关联FID });

  const input = (label, key, type = 'text') => `<label class="form-row"><span class="form-label">${escapeHtml(label)}</span>
    <input class="field-input" type="${type}" name="${escapeHtml(key)}" data-editable="1" data-field="${escapeHtml(key)}" value="${escapeHtml(config[key] == null ? '' : config[key])}"></label>`;
  const rows = [
    `<div class="form-row"><span class="form-label">配置ID</span><span class="value-pill">${escapeHtml(config['配置ID'] || '自动生成')}</span></div>`,
    input('来源类型', '来源类型'), input('用途', '用途'), input('Base URL', 'Base URL'),
    // 密钥位永远只输出掩码占位，value 保持为空，不读取 config['API Key']
    `<label class="form-row secret-row"><span class="form-label">API Key</span><input class="field-input" type="password" name="API Key" data-secret="1" value="" placeholder="••••••••（不回显）" autocomplete="off"></label>`,
    input('模型名称/ID', '模型名称/ID'), input('超时阈值（秒）', '超时阈值', 'number'),
    `<label class="form-row"><span class="form-label">启用状态</span><input class="field-input" type="checkbox" name="启用状态" ${config['启用状态'] ? 'checked' : ''}></label>`
  ].join('');

  const html = `<div class="glass form-card" data-component="c06">
    <div class="form-grid">${rows}</div>
    <div class="form-actions">
      <button type="button" class="btn btn-ghost" data-btn-id="${escapeHtml(cancelId)}">取消</button>
      <button type="button" class="btn btn-primary" data-btn-id="${escapeHtml(saveId)}">保存配置</button>
    </div>
  </div>`;
  if (opts.container && typeof opts.container === 'object') opts.container.innerHTML = html;
  return html;
}
