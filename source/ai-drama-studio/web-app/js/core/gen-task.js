import { TASK_STATUS, SOURCE_MARK, DEGRADE_REASON } from '../constants.js';
import { uid, now } from './uid.js';
import { buildPromptSnapshot } from './prompt-builder.js';
import { callModel, selectConfig, isForceDemo, getDemoFallback, ERROR_TO_DEGRADE } from './model-adapter.js';
import { DEMO_MARK } from '../demo/demo-data.js';

const 找任务 = (project, taskId) => (project?.genTasks || []).find(t => t.任务ID === taskId);
const usageOf = (类型) => (类型 === '文本' ? '文本' : '媒体');

export function isRunning(project, objectId) {
  return (project?.genTasks || []).some(t => t.输入快照?.对象ID === objectId && t.状态 === TASK_STATUS.进行中);
}

// ③④：创建即冻结最终提示词快照，九环节落库只写 GenTask 既有字段
export function createTask(project, spec = {}) {
  const p = project || {};
  // 同对象进行中重复点击不建第二任务（去重置灰）
  const running = (p.genTasks || []).find(t => t.输入快照?.对象ID === spec.对象ID && t.状态 === TASK_STATUS.进行中);
  if (running) return running;

  const 类型 = spec.类型 || '文本';
  const cfg = selectConfig(p, spec.用途 || usageOf(类型));
  // ①选用配置：来源模型标识创建时冻结；强制开关/无候选即演示数据
  const 来源模型标识 = isForceDemo(p) || !cfg ? SOURCE_MARK.演示数据 : cfg.来源类型;
  const 输入快照 = {
    对象ID: spec.对象ID || '',
    关联资产ID列表: (spec.关联资产ID列表 || []).slice(),
    帧类型: spec.帧类型
  };
  const 最终提示词快照 = buildPromptSnapshot({
    project: p, taskType: 类型, 对象ID: spec.对象ID,
    关联资产ID列表: 输入快照.关联资产ID列表, 帧类型: spec.帧类型,
    单条正向词: spec.单条正向词, 单条负面词: spec.单条负面词,
    来源模型标识
  });
  const task = {
    任务ID: uid('task'), 类型, 来源模型标识, 输入快照, 最终提示词快照,
    输出引用: '', 状态: TASK_STATUS.待处理, 耗时: 0, 错误信息: '', 重试次数: 0, 创建时间: now()
  };
  (p.genTasks ||= []).push(task);
  return task;
}

// ⑤⑥：唯一模型调用点，任何模块不得绕过统一入口
export async function runTask(project, taskId) {
  const task = 找任务(project, taskId);
  if (!task || task.状态 === TASK_STATUS.进行中) return task;
  task.状态 = TASK_STATUS.进行中;
  const usage = usageOf(task.类型);
  const 正面 = task.最终提示词快照?.正向 || {};
  const 负面 = task.最终提示词快照?.负面 || {};
  const payload = {
    taskType: task.类型, usage,
    prompt: [正面.全局正向词, 正面.单条正向词].filter(Boolean).join(' '),
    negative: [...(负面.全局锁定负面词 || []), ...(负面.单条负面词 || [])],
    input: task.输入快照
  };
  const result = await callModel(project, usage, payload);
  return settleTask(project, taskId, result);
}

// D-06 重试幂等：复用同一 taskId 与产物槽，只覆盖输出引用，不追加 KeyFrame/StoryboardItem
export async function retryTask(project, taskId) {
  const task = 找任务(project, taskId);
  if (!task || task.状态 === TASK_STATUS.进行中) return task;
  task.重试次数 += 1;
  return runTask(project, taskId);
}

// ⑦⑧：写回状态 / 耗时 / 错误信息；模型类失败一律降级，本地错误仍可读且无原始堆栈
export function settleTask(project, taskId, result = {}) {
  const task = 找任务(project, taskId);
  if (!task) return null;
  task.耗时 = Number(result.latencyMs) || 0;
  if (result.ok) {
    task.状态 = TASK_STATUS.成功;
    task.错误信息 = '';
    task.输出引用 = typeof result.data === 'string' ? result.data : String(result.data ?? '');
  } else {
    const code = result.errorCode || 'NOT_CONFIGURED';
    task.状态 = TASK_STATUS['已降级(演示数据)'];
    task.来源模型标识 = SOURCE_MARK.演示数据;
    const demo = getDemoFallback(project, task.类型, {
      对象ID: task.输入快照?.对象ID, 帧类型: task.输入快照?.帧类型
    });
    task.输出引用 = typeof demo.数据 === 'string' && demo.数据.startsWith('data:image') ? demo.数据 : DEMO_MARK;
    // 九类降级原因可见：错误类型 + 可读文案，不展示原始堆栈
    task.错误信息 = `${result.message || '已降级为演示数据；流程可继续'}；降级原因：${ERROR_TO_DEGRADE[code] || DEGRADE_REASON['未配置']}`;
  }
  return task;
}
