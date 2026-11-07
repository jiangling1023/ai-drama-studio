let seq = 0;

// 全站唯一 ID / 时间来源；自增序 + 随机尾码保证同一毫秒及刷新后不撞号
export function uid(prefix = 'id') {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function now() {
  return new Date().toISOString();
}
