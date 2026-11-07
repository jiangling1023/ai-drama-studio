import * as STORAGE from './storage.js';
import * as STORE from './store.js';
import * as COMPONENTS from './components/index.js';
import { createEmptyProject } from './schema.js';
import { auditButtons, registerButton } from './core/ui-response.js';
import { mountWorkspace, setView, registerAction } from './shell/workspace.js';

// 模块级唯一 Project 引用：hash 变化/视图切换只 setView，不 loadProject、不 createEmptyProject、不重建引用
let project = null;
export function getProject() { return project; }

const ctx = {
  getProject,
  commit: fn => (typeof STORE.commit === 'function' ? STORE.commit(fn) : undefined),
  registerButton, auditButtons, registerAction,
  showToast: COMPONENTS.showToast,
  components: COMPONENTS,
  清单: null
};

function placeholder(slotId, name) {
  const slot = typeof document !== 'undefined' ? document.getElementById(slotId) : null;
  if (slot) slot.innerHTML = `<div class="glass ws-placeholder">${name} 未就绪：等待交付，工程数据未改动</div>`;
}

// 动态 discover + 容错：壳层/页面注册表由 U-1-F/U-1-D 稍后产出，缺文件时显示可读占位、不白屏、不报未捕获异常
async function enhance() {
  const mods = [
    { key: 'topBar', path: './shell/top-bar.js', fn: 'renderTopBar', slot: 'ws-topbar' },
    { key: 'stepNav', path: './shell/step-nav.js', fn: 'renderStepNav', slot: 'ws-stepnav' },
    { key: 'statusArea', path: './shell/status-area.js', fn: 'renderStatusArea', slot: 'ws-status' },
    { key: 'modelDrawer', path: './shell/model-drawer.js' },
    { key: 'pages', path: './pages/index.js' }
  ];
  const results = await Promise.allSettled(mods.map(m => import(m.path)));
  results.forEach((res, i) => {
    const m = mods[i];
    if (res.status !== 'fulfilled' || !res.value) { if (m.slot) placeholder(m.slot, m.key); return; }
    const mod = res.value;
    if (m.fn && typeof mod[m.fn] === 'function') {
      try { mod[m.fn](document.getElementById(m.slot), ctx); }
      catch (e) { placeholder(m.slot, m.key); }
    }
    if (m.key === 'modelDrawer') {
      ['openModelDrawer', 'closeModelDrawer'].forEach(n => { if (typeof mod[n] === 'function') ctx[n] = mod[n]; });
    }
    if (m.key === 'pages') {
      const reg = Array.isArray(mod.PAGE_REGISTRY) ? mod.PAGE_REGISTRY : [];
      reg.forEach(p => { if (p && p.pageId && typeof p.render === 'function') registerAction('render:' + p.pageId, p.render); });
      if (typeof mod.getPage === 'function') registerAction('getPage', mod.getPage);
      if (typeof mod.getNextStep === 'function') ctx.getNextStep = mod.getNextStep;
      // 注册表就绪后按当前 hash 重渲染一次，仍只替换主工作区 DOM 子树
      const h = typeof ctx.parseHash === 'function' ? ctx.parseHash() : { view: 'p001', stage: '', params: {} };
      setView(h.view, h);
    }
  });
}

let seeded = false;

// 示例工程只在首屏空工程时装一次：demo-project 未交付或抛错则保留空工程，不阻断首屏
async function seedDemoOnce() {
  if (seeded) return;
  seeded = true;
  try {
    const m = await import('./demo/demo-project.js');
    const out = typeof m.seedDemoProject === 'function' ? m.seedDemoProject(project) : null;
    // 返回值不是同一引用时就地灌入，保持唯一 Project 引用不变
    if (out && out !== project) {
      for (const k of Object.keys(project)) delete project[k];
      Object.assign(project, out);
    }
    project.名称 = '示例工程 · 雨夜来信';
  } catch (e) { /* 示例工程不可用时保留空工程，首屏照常渲染 */ }
}

async function boot() {
  try {
    // F5 整页刷新才恢复一次；storage 返回 {project,status} 包装，取 .project 与 store.commit 指向同一对象、不重建引用
    const restored = typeof STORAGE.loadProject === 'function' ? STORAGE.loadProject() : null;
    project = restored && restored.project ? restored.project : null;
    // 首屏空工程自动装载示例工程：只装一次，失败保留空工程、不白屏
    if (!project) project = createEmptyProject();
    if (!restored || restored.status === 'empty') await seedDemoOnce();
    const content = document.getElementById('content') || document.getElementById('app') || document.body;
    mountWorkspace(content, ctx);
    const h = typeof ctx.parseHash === 'function' ? ctx.parseHash() : { view: 'p001', stage: '', params: {} };
    setView(h.view, h);
    auditButtons(content);
    if (typeof window !== 'undefined' && typeof window.__APP_READY__ === 'function') window.__APP_READY__();
    // 首渲染成功后才做壳层增强：此时 ready=true，动态加载失败不再误弹全屏兜底
    enhance().catch(() => {});
  } catch (e) {
    const box = typeof document !== 'undefined' ? document.getElementById('boot-error') : null;
    if (box) {
      box.textContent = '应用模块加载失败：' + (e && e.message || e) + '；请刷新页面重试，工程数据未改动';
      box.hidden = false;
    }
  }
}

if (typeof document !== 'undefined' && document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else if (typeof document !== 'undefined') {
  boot();
}
