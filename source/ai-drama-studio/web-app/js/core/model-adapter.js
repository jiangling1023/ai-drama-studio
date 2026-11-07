import { DEGRADE_REASON, SOURCE_MARK } from '../constants.js';
import { demoFor, DEMO_MARK } from '../demo/demo-data.js';

// 九类 errorCode（V2 在 V1 八类基础上拆出 DISABLED），全应用唯一发网出口的错误口径
export const ErrorCode = Object.freeze({
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  DISABLED: 'DISABLED',
  AUTH: 'AUTH',
  RATE_LIMIT: 'RATE_LIMIT',
  SERVER: 'SERVER',
  TIMEOUT: 'TIMEOUT',
  NETWORK: 'NETWORK',
  BAD_RESPONSE: 'BAD_RESPONSE',
  FORCE_DEMO: 'FORCE_DEMO'
});

// 九类 errorCode → 降级原因，值全部取自 constants.js 唯一枚举
export const ERROR_TO_DEGRADE = Object.freeze({
  NOT_CONFIGURED: DEGRADE_REASON['未配置'],
  DISABLED: DEGRADE_REASON['未启用'],
  AUTH: DEGRADE_REASON['401'],
  RATE_LIMIT: DEGRADE_REASON['429'],
  SERVER: DEGRADE_REASON['5xx'],
  TIMEOUT: DEGRADE_REASON['超时'],
  NETWORK: DEGRADE_REASON['网络中断'],
  BAD_RESPONSE: DEGRADE_REASON['响应非法'],
  FORCE_DEMO: DEGRADE_REASON['强制演示数据']
});

const 可读文案 = {
  NOT_CONFIGURED: '未配置模型，当前使用演示数据；流程可继续',
  DISABLED: '模型配置未启用，当前使用演示数据；流程可继续',
  AUTH: '密钥无效或权限不足，请检查模型配置；流程可继续',
  RATE_LIMIT: '模型请求被限流，已使用演示数据，可重试；流程可继续',
  SERVER: '模型服务暂时不可用，已使用演示数据；流程可继续',
  TIMEOUT: '请求已超时，已终止等待并使用演示数据；流程可继续',
  NETWORK: '网络连接不可用，已使用演示数据；流程可继续',
  BAD_RESPONSE: '模型返回格式异常，已使用演示数据，未写入异常数据；流程可继续',
  FORCE_DEMO: '已强制使用演示数据，不会向任何模型地址发起请求；流程可继续'
};

function fail(code, latencyMs) {
  return {
    ok: false, data: undefined, sourceMark: SOURCE_MARK.演示数据,
    errorCode: code, message: 可读文案[code] || '已降级为演示数据；流程可继续', latencyMs
  };
}

export function isForceDemo(project) {
  return !!(project && project.是否强制演示数据);
}

// ①按用途选配置：强制开关 → 无请求；同类按来源优先级与配置ID字典序取第一条
export function selectConfig(project, usage) {
  if (isForceDemo(project)) return null;
  const all = (project?.modelConfigs || []).filter(c => c.启用状态 === true && c.用途 === usage);
  if (!all.length) return null;
  // usage 合法值：文本/媒体/视频；视频优先 agnes-ai 视频，其余回退媒体优先级（保持既有文本/媒体逻辑）
  const prefByUsage = { '文本': SOURCE_MARK['agnes-ai 文本'], '视频': 'agnes-ai 视频' };
  const preferred = prefByUsage[usage] || SOURCE_MARK['agnes-ai 媒体'];
  const rank = c => c.来源类型 === preferred ? 0 : (c.来源类型 === SOURCE_MARK.自定义 ? 1 : 2);
  return all.slice().sort((a, b) => rank(a) - rank(b) || String(a.配置ID).localeCompare(String(b.配置ID)))[0];
}

// 唯一可替换点：真实接口文档或自定义端点结构差异只改此处注册，调用方零改动
const ADAPTERS = Object.create(null);
export function registerAdapter(sourceType, adapterFn) {
  if (!sourceType || !adapterFn) return;
  ADAPTERS[sourceType] = typeof adapterFn === 'function' ? { buildRequest: adapterFn } : adapterFn;
}

// V3 视频用途唯一转译注册表：未注册自定义视频适配器时返回演示提示词占位，零外部请求（VID-03）
// 文档到位只改此处与 translateVideoPrompt，调用方零改动
export const DEFAULT_ADAPTERS = Object.freeze({
  '视频': (cfg, payload) => ({ 演示提示词占位: '视频模型演示提示词占位（零外部请求）' })
});

function defaultBuildRequest(cfg, payload, usage) {
  const base = String(cfg['Base URL'] || '').replace(/\/+$/, '');
  const path = usage === '文本' ? '/chat/completions' : '/images/generations';
  const body = usage === '文本'
    ? {
        model: cfg['模型名称/ID'],
        messages: payload.messages || [
          { role: 'system', content: '你是短剧编剧助手，只返回结构化文本' },
          { role: 'user', content: payload.prompt || JSON.stringify(payload.input || '') }
        ],
        temperature: 0.7, stream: false
      }
    : { model: cfg['模型名称/ID'], prompt: payload.prompt || '', n: 1, size: '1024x1024', response_format: 'b64_json' };
  return {
    url: base + path,
    init: {
      method: 'POST', mode: 'cors', credentials: 'omit',
      // 密钥仅内存态注入请求头，不进快照 / 日志 / 导出物（K-01/K-03）
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (cfg['API Key'] || '') },
      body: JSON.stringify(body)
    }
  };
}

function defaultParseResponse(json, usage) {
  if (usage === '文本') {
    const t = json?.choices?.[0]?.message?.content;
    if (typeof t !== 'string' || !t.trim()) throw Object.assign(new Error('BAD_RESPONSE'), { code: 'BAD_RESPONSE' });
    return t;
  }
  const b = json?.data?.[0]?.b64_json;
  if (typeof b !== 'string' || !b) throw Object.assign(new Error('BAD_RESPONSE'), { code: 'BAD_RESPONSE' });
  return 'data:image/png;base64,' + b;
}

function mapHttp(status) {
  if (status === 401 || status === 403) return ErrorCode.AUTH;
  if (status === 429) return ErrorCode.RATE_LIMIT;
  if (status >= 500) return ErrorCode.SERVER;
  return ErrorCode.BAD_RESPONSE;
}

// 全应用唯一 fetch 出口；演示数据路径永不进入 ⑤⑥，零外部请求
export async function callModel(project, usage, payload = {}) {
  // ②配置校验第一行短路：强制开关直接返回，fetch 次数 = 0（D-05 / §14 自检⑦）
  if (isForceDemo(project)) return fail(ErrorCode.FORCE_DEMO, 0);

  const cfg = selectConfig(project, usage);
  if (!cfg) {
    // 有配置但未启用 → DISABLED；完全无候选 → NOT_CONFIGURED
    const 有候选 = (project?.modelConfigs || []).some(c => c.用途 === usage);
    return fail(有候选 ? ErrorCode.DISABLED : ErrorCode.NOT_CONFIGURED, 0);
  }

  const adapter = ADAPTERS[cfg.来源类型] || {};
  const buildRequest = typeof adapter.buildRequest === 'function' ? adapter.buildRequest : defaultBuildRequest;
  const parseResponse = typeof adapter.parseResponse === 'function' ? adapter.parseResponse : defaultParseResponse;
  const started = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), (Number(cfg.超时阈值) || 30) * 1000);
  try {
    const req = buildRequest(cfg, payload, usage);
    const res = await fetch(req.url, { ...req.init, signal: ac.signal });
    if (!res.ok) throw Object.assign(new Error('HTTP ' + res.status), { code: mapHttp(res.status) });
    let json;
    try { json = await res.json(); } catch { throw Object.assign(new Error('BAD_RESPONSE'), { code: ErrorCode.BAD_RESPONSE }); }
    const data = parseResponse(json, usage);
    return { ok: true, data, sourceMark: cfg.来源类型, errorCode: undefined, message: '', latencyMs: Date.now() - started };
  } catch (e) {
    // 降级分支：D-03 永不向页面抛异常，统一 ok:false，流程继续
    const code = e?.code || (e?.name === 'AbortError' ? ErrorCode.TIMEOUT : ErrorCode.NETWORK);
    return fail(code, Date.now() - started);
  } finally {
    clearTimeout(timer);
  }
}

const KIND_BY_TYPE = { 文本: '剧本', 图片: '图片', 关键帧: '首帧' };

// ⑦降级演示数据：固定样例深拷贝 + 来源标记，全程零外部请求
export function getDemoFallback(project, taskType, spec = {}) {
  let kind = spec.demoKind || KIND_BY_TYPE[taskType] || '剧本';
  if (taskType === '关键帧' && spec.帧类型 === '尾帧') kind = '尾帧';
  return { 数据: demoFor(kind, spec), 标记: DEMO_MARK, 来源模型标识: SOURCE_MARK.演示数据 };
}

// V3 视频提示词转译唯一出口：把中文语义要求译为目标模型格式（VID-03 不调用其生成视频）
export function translateVideoPrompt(targetModelSpec, semanticText) {
  // 文档到位只改此处：当前演示实现原样返回语义文本，不触达任何视频生成端点
  return semanticText;
}
