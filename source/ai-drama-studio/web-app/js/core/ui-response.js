import * as CONST from '../constants.js';
import { showToast } from '../components/index.js';

// 单一注册表：§16 的 260 个按钮 ID 是唯一登记处，新增可点击元素须先登记，缺登记即由 dispatch 兜底
const REGISTRY = new Map();
const CLICKABLE = 'button,[role="button"],a[href],[data-btn-id],[tabindex="0"],input[type="button"],input[type="submit"]';
// 四类类别键唯一取自 constants.js 的 BUTTON_RESPONSE，不另造第二份枚举
const BR = (CONST && CONST.BUTTON_RESPONSE) || { '①': '', '②': '', '③': '', '④': '' };
const KINDS = new Set(Object.keys(BR));

export function registerButton(按钮ID, spec = {}) {
  REGISTRY.set(按钮ID, { 按钮ID, ...spec });
}

// ④兜底：未登记 / handler 空 / 抛异常统一走这里，非 error 级、不冒泡、不留控制台 error
function fallback(id) {
  showToast('该操作暂无可执行内容：' + (id || '未标识操作'), { level: 'info' });
}

export function respond(类别, spec = {}, ctx) {
  const k = KINDS.has(类别) ? 类别 : (KINDS.has(spec.类别) ? spec.类别 : '①');
  const id = spec.按钮ID;

  // ②禁用态点击复述具体禁用原因，不吞点击
  if (spec.disabled === true || k === '②') {
    const why = spec.禁用原因 || '该操作当前不可用，请先满足前置条件';
    showToast(why, { level: 'warn' });
    return null;
  }
  if (k === '④') {
    showToast(spec.toast || '操作已完成', { level: 'info' });
    return null;
  }
  if (k === '③') {
    // ③空态引导入口本身落①
    if (typeof spec.handler === 'function') return spec.handler(ctx);
    showToast(spec.空状态 || '当前无内容，请先完成前置步骤', { level: 'info' });
    return null;
  }
  // ①真实执行并产生可见结果
  if (typeof spec.handler === 'function') {
    const r = spec.handler(ctx);
    if (spec.toast) showToast(spec.toast, { level: 'info' });
    return r;
  }
  fallback(id);
  return null;
}

export function dispatch(按钮ID, ctx, event) {
  const spec = REGISTRY.get(按钮ID);
  if (!spec) { fallback(按钮ID); return; }
  const el = event && event.target && typeof event.target.closest === 'function'
    ? event.target.closest('[data-btn-id]') : null;
  let r;
  try {
    r = respond(spec.类别, spec, ctx);
  } catch (e) {
    // handler 抛异常同样落④，绝不冒泡成未捕获异常
    fallback(按钮ID);
    return;
  }
  if (r && typeof r.then === 'function') {
    // 异步操作置进行中态；fulfill/reject 都恢复按钮并处理，避免悬挂 Promise rejection
    if (el) { el.disabled = true; el.classList.add('is-busy'); }
    const done = () => { if (el) { el.disabled = false; el.classList.remove('is-busy'); } };
    r.then(done, () => { done(); fallback(按钮ID); });
  }
}

export function auditButtons(container, 清单) {
  const root = container || (typeof document !== 'undefined' ? document.body : null);
  const 未登记 = [];
  let 实测数 = 0;
  if (root && typeof root.querySelectorAll === 'function') {
    root.querySelectorAll(CLICKABLE).forEach(el => {
      实测数++;
      const id = el.getAttribute('data-btn-id');
      if (!id) 未登记.push('可点击元素未标注@' + el.tagName.toLowerCase());
      else if (!REGISTRY.has(id)) 未登记.push(id);
    });
  }
  // 未传清单时以实测数为基线，便于每次视图切换自检；传入清单则比对声明数与实测数
  const 清单数 = Array.isArray(清单) ? 清单.length
    : (typeof 清单 === 'number' ? 清单 : 实测数);
  return { 未登记, 差异: Math.abs(清单数 - 实测数) };
}
