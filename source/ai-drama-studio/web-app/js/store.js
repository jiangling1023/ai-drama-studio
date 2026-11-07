import { loadProject, saveProject } from './storage.js';

let timer = null;
let dirty = false;

// 唯一引用由 storage 会话缓存持有；app.js 可直接 export { getProject } from './store.js'，不新建第二份
export function getProject() {
  return loadProject().project;
}

export function isDirty() {
  return dirty;
}

export function markDirty() {
  dirty = true;
  getProject().保存状态 = '未保存';
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; saveNow(); }, 300);
}

export function saveNow() {
  if (timer !== null) { clearTimeout(timer); timer = null; }
  const r = saveProject(getProject());
  if (r.ok) dirty = false;
  return r;
}

export function commit(mutator) {
  mutator(getProject());
  markDirty();
}

// 关闭 / 刷新前兜底一次落盘，防抖窗口内的更改不丢失
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('beforeunload', () => { if (dirty) saveNow(); });
}
