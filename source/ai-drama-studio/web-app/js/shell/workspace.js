import { dispatch, auditButtons } from '../core/ui-response.js';
import * as STORAGE from '../storage.js';
import * as STORE from '../store.js';

const actions = new Map();
const scrollMap = new Map();
let view = null, ctxRef = null, currentPage = '';

function esc(v) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => map[c]);
}

// hash 路由：#/<view>[/<stage>][?<params>]，参数只作 UI 态、不落工程
function parseHash() {
  const raw = String((typeof location !== 'undefined' && location.hash) || '').replace(/^#\/?/, '');
  const qi = raw.indexOf('?');
  const path = qi >= 0 ? raw.slice(0, qi) : raw;
  const query = qi >= 0 ? raw.slice(qi + 1) : '';
  const parts = path.split('/');
  const params = {};
  if (query) query.split('&').forEach(pair => {
    const [k, v] = pair.split('=');
    if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '');
  });
  return { view: parts[0] || 'p001', stage: parts[1] || '', params };
}

function saveScroll(pageId) {
  if (!pageId) return;
  const y = (view && view.scrollTop) || (typeof window !== 'undefined' ? window.scrollY : 0);
  scrollMap.set(pageId, y);
  try {
    const ui = (typeof STORAGE.loadUiState === 'function' && STORAGE.loadUiState()) || {};
    ui['滚动位置'] = Object.assign({}, ui['滚动位置'], { [pageId]: y });
    if (typeof STORAGE.saveUiState === 'function') STORAGE.saveUiState(ui);
  } catch (e) { /* UI 键不可用时退回内存缓存，不影响视图切换 */ }
}

function restoreScroll(pageId) {
  let y = scrollMap.get(pageId);
  if (y == null) {
    try {
      const ui = typeof STORAGE.loadUiState === 'function' && STORAGE.loadUiState();
      y = ui && ui['滚动位置'] && ui['滚动位置'][pageId];
    } catch (e) { /* 同上 */ }
  }
  if (typeof y === 'number') {
    if (view) view.scrollTop = y;
    else if (typeof window !== 'undefined' && window.scrollTo) window.scrollTo(0, y);
  }
}

function blurCommit() {
  // 仅当当前视图存在未提交的可编辑控件时写回一次，避免每次切视图都无谓标脏落盘
  const pending = view && typeof view.querySelector === 'function' ? view.querySelector('[data-editable]') : null;
  if (!pending) return;
  try { if (typeof STORE.commit === 'function') STORE.commit(() => {}); }
  catch (e) { /* 失焦写回失败不冒泡，不重建引用 */ }
}

export function showFrontendEmpty(pageId, reasonList = []) {
  const list = (Array.isArray(reasonList) ? reasonList : []).map(r => `<li>${esc(r)}</li>`).join('');
  if (view) view.innerHTML = `<div class="glass ws-placeholder" data-component="ws">
    <h2>${esc(pageId || '工作区')}</h2>
    <ul>${list || '<li>内容暂未就绪</li>'}</ul>
    <p>工程数据未改动</p>
  </div>`;
}

// 只替换主工作区 DOM 子树：不 loadProject、不 createEmptyProject、不重建 Project 引用
export function setView(pageId, extra = {}) {
  blurCommit();
  saveScroll(currentPage);
  currentPage = pageId;
  const renderFn = actions.get('render:' + pageId) || actions.get('renderPage');
  if (typeof renderFn === 'function') {
    try { renderFn(view, ctxRef, extra); }
    catch (e) { showFrontendEmpty(pageId, ['页面渲染失败：' + (e && e.message || e)]); }
  } else {
    showFrontendEmpty(pageId, ['页面模块未就绪：' + pageId, '等待页面注册表加载，工程数据未改动']);
  }
  restoreScroll(pageId);
  try { auditButtons(view, ctxRef && ctxRef.清单); } catch (e) { /* 自检失败不中断视图 */ }
}

export function registerAction(name, fn) { actions.set(name, fn); }

function ensureSlots(container) {
  const app = typeof document !== 'undefined' ? document.getElementById('app') : null;
  if (app && !document.getElementById('ws-chrome')) {
    const chrome = document.createElement('div');
    chrome.id = 'ws-chrome';
    chrome.innerHTML = '<section id="ws-topbar" class="ws-slot"></section><section id="ws-stepnav" class="ws-slot"></section>';
    app.insertBefore(chrome, app.firstChild);
  }
  if (app && !document.getElementById('ws-status')) {
    const s = document.createElement('section');
    s.id = 'ws-status'; s.className = 'ws-slot';
    app.appendChild(s);
  }
  view = document.getElementById('ws-view');
  if (!view) {
    view = document.createElement('main');
    view.id = 'ws-view'; view.className = 'ws-view';
    container.appendChild(view);
  }
}

// 唯一 click/focusout 委托的挂载点：必须覆盖 #app 整棵子树（#ws-chrome 与 #ws-status 都挂在 #app 下，
// 而非 #content 内），否则壳层的步骤导航与状态条点击会静默无响应。
// index.html 里 #modalRoot / #toast 是 #app 的兄弟节点（body 级浮层），只绑 #app 会让 C-04 确认框、
// 模型抽屉与 Toast 关闭按钮全部静默，故委托挂在 document 上：仍是全应用唯一一个 click 监听，且完整覆盖 #app。
let bound = false;

function bindDelegates() {
  if (bound || typeof document === 'undefined') return;
  bound = true;
  const target = document;

  // 全应用唯一 click 委托：所有可点击元素经 data-btn-id 交给 ui-response.dispatch
  target.addEventListener('click', e => {
    const el = e.target && typeof e.target.closest === 'function' ? e.target.closest('[data-btn-id]') : null;
    if (el) dispatch(el.getAttribute('data-btn-id'), ctxRef, e);
  });

  // 失焦即写回：页面可用 data-commit 指定已登记的 mutator，未指定也触发一次落盘
  target.addEventListener('focusout', e => {
    const t = e.target;
    if (!t || !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || '')) return;
    const name = t.getAttribute && t.getAttribute('data-commit');
    const fn = name && actions.get('commit:' + name);
    try {
      if (typeof STORE.commit === 'function') STORE.commit(() => { if (typeof fn === 'function') fn(t, ctxRef); });
    } catch (err) { /* 不冒泡、不留控制台 error */ }
  });
}

export function mountWorkspace(container, ctx) {
  ctxRef = ctx || {};
  const root = container || (typeof document !== 'undefined' ? document.getElementById('content') : null);
  if (!root) return;
  ensureSlots(root);
  if (ctxRef) { ctxRef.parseHash = parseHash; ctxRef.setView = setView; ctxRef.registerAction = registerAction; }

  bindDelegates();

  if (typeof window !== 'undefined') {
    // hashchange 只 setView，恢复一次 Project 引用仅发生在整页刷新（F5）的 app.js 装配
    window.addEventListener('hashchange', () => {
      const h = parseHash();
      setView(h.view, h);
    });
  }
}
