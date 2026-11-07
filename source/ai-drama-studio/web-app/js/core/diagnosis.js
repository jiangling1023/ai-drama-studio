import { DIAGNOSIS_CONFIG, DIAGNOSIS_LEVEL } from '../constants.js';
import { uid, now } from './uid.js';
// 配置唯一定义在 constants.js；此处只 re-export，不重复定义（§20.1）
export { DIAGNOSIS_CONFIG } from '../constants.js';

const 角色前缀 = /^\s*[\u4e00-\u9fa5A-Za-z·]{1,10}\s*[：:]/;
const 引号台词 = /^[「"『“]/;
const 舞台指示 = /[（(【\[][\s\S]*[）)】\]]/;
// 显式动作动词以双字词为主：过宽的单字表会把全知背景句误判为动作描述，破坏旁白占比
const 动作动词 = /快步|走到|推开|抬眼|望向|发颤|颤抖|侧身|靠在|敲着|俯身|拽住|搭在|抹过|抬手|挡住|越过|穿过|挪到|划过|按住|侧耳|折好|塞进|退后|掀起|转身|迈上|坐下|站起|打开|放下|扶住|摸出|指向|闪过|递出|握住|攥紧|点头|摇头|凝视|抬头|低头|靠近|后退|伸手|迈步|跨过|举|捡起|抱住/;

const 集标记 = /^\s*第\s*[一二三四五六七八九十\d]+\s*集/;
const 场次标记 = /^\s*(第?\s*\d+\s*场|场次\s*\d+|场景\s*\d+)/;

export function splitSentences(text) {
  if (!text) return [];
  let s = String(text).replace(/\r\n?/g, '\n');
  // 括号舞台指示是整体：其内部句号不参与切分，否则「（…。）」会碎成「）」并被误计入旁白
  const 保护 = [];
  s = s.replace(/[（(【\[][^）)】\]]*[）)】\]]/g, m => {
    保护.push(m);
    return `\u0000${保护.length - 1}\u0000`;
  });
  for (const b of DIAGNOSIS_CONFIG.句子边界) {
    if (b !== '\n') s = s.split(b).join('\n');
  }
  return s.split('\n').map(x => x.trim()).filter(Boolean)
    .map(x => x.replace(/\u0000(\d+)\u0000/g, (_, i) => 保护[Number(i)]));
}

// 「集 > 场次」逐场次扫描：集标记只是分组不产生块，场次标记行不参与句子计数
function splitSceneBlocks(text) {
  const blocks = [];
  let cur = null;
  for (const line of String(text || '').split(/\r?\n/)) {
    if (集标记.test(line)) continue;
    if (场次标记.test(line)) {
      cur = { 行: [] };
      blocks.push(cur);
    } else {
      if (!cur) { cur = { 行: [] }; blocks.push(cur); }
      cur.行.push(line);
    }
  }
  return blocks.map(b => ({ 句子: splitSentences(b.行.join('\n')) }));
}

export function classify(sentence, ctx) {
  const 字段 = typeof ctx === 'string' ? ctx : (ctx?.字段 || '');
  const s = String(sentence ?? '');
  // 判定优先级命中即停：台词 > 动作/表演描述 > 旁白/解说句，一句话只归一类
  if (字段 === '对白' || 角色前缀.test(s) || 引号台词.test(s)) return '台词';
  if (字段 === '画面描述' || 舞台指示.test(s) || 动作动词.test(s)) return '动作/表演描述';
  return '旁白/解说句';
}

// 旁路缓存：改写建议复用同一次切分结果，不给冻结的 ScriptDiagnosis 增字段、也不另写口径
const 改写源 = new WeakMap();

export function diagnose(project, 对象类型, 对象ID, 文本) {
  const cfg = DIAGNOSIS_CONFIG;
  const p = project || {};
  const 总场次 = (p.scenes || []).length;
  const 源文本 = 文本 ?? p.剧本原文 ?? '';
  const 空 = (等级) => ({
    诊断ID: uid('diag'), 对象类型: 对象类型 || '剧本', 对象ID: 对象ID || '',
    旁白句数: 0, 句子总数: 0, 旁白占比: 0,
    台词场次: 0, 总场次, 台词覆盖率: 0,
    动作描述条数: 0, 动作描述字数: 0, 密度达标场次: 0,
    诊断等级: 等级, 诊断口径版本: cfg.VERSION, 生成时间: now()
  });

  // 文本为空或总场次为 0 不计算比例，直接判不通过（§5.2）
  if (!String(源文本).trim() || 总场次 === 0) return 空(DIAGNOSIS_LEVEL.不通过);

  const 块 = splitSceneBlocks(源文本);
  const 句 = 块.flatMap(b => b.句子);
  const 类 = 句.map(s => classify(s, { 对象ID }));
  const 旁白句 = 句.filter((s, i) => 类[i] === '旁白/解说句');
  const 句子总数 = 句.length;
  const 旁白句数 = 旁白句.length;
  const 旁白占比 = 句子总数 ? 旁白句数 / 句子总数 * 100 : 0;

  let 台词场次 = 0, 动作描述条数 = 0, 动作描述字数 = 0, 密度达标场次 = 0;
  const 未达标场次ID = [];
  // 总场次固定取 F-002 拆分条目数；文本未覆盖到的场次视为无产物，密度不达标
  for (let i = 0; i < 总场次; i += 1) {
    const sc = p.scenes[i];
    const 句组 = 块[i]?.句子 || [];
    const k = 句组.map(s => classify(s, { 对象ID: sc.场次ID }));
    if (k.includes('台词')) 台词场次 += 1;
    const 动作句 = 句组.filter((s, j) => k[j] === '动作/表演描述');
    const 条数 = 动作句.length;
    const 字数 = 动作句.reduce((n, s) => n + s.length, 0);
    动作描述条数 += 条数;
    动作描述字数 += 字数;
    if (条数 >= cfg.每场次动作描述条数下限 && 字数 >= cfg.每场次动作描述字数下限) 密度达标场次 += 1;
    else 未达标场次ID.push(sc.场次ID);
  }
  const 台词覆盖率 = 总场次 ? 台词场次 / 总场次 * 100 : 0;
  const 未达标占比 = 总场次 ? 未达标场次ID.length / 总场次 * 100 : 0;

  // 先判不通过线、再判通过线，否则需改写（§5.3 三值，无中间态）
  const 诊断等级 =
    (旁白占比 > cfg.旁白占比不通过线 || 台词覆盖率 < cfg.台词覆盖率不通过线 || 未达标占比 > cfg.未达标场次占比不通过线)
      ? DIAGNOSIS_LEVEL.不通过
      : (旁白占比 > cfg.旁白占比上限 || 台词覆盖率 < cfg.台词覆盖率下限 || 未达标占比 > 0)
        ? DIAGNOSIS_LEVEL.需改写
        : DIAGNOSIS_LEVEL.通过;

  const result = {
    诊断ID: uid('diag'), 对象类型: 对象类型 || '剧本', 对象ID: 对象ID || '',
    旁白句数, 句子总数, 旁白占比, 台词场次, 总场次, 台词覆盖率,
    动作描述条数, 动作描述字数, 密度达标场次,
    诊断等级, 诊断口径版本: cfg.VERSION, 生成时间: now()
  };
  改写源.set(result, { 旁白句, 对象ID: result.对象ID, 未达标场次ID });
  return result;
}

// 四字段改写建议：只出结论，不自动写回原文（§5.4 / 回写边界）
export function buildRewriteAdvice(diag, project) {
  const cfg = DIAGNOSIS_CONFIG;
  const src = 改写源.get(diag);
  const 旁白句 = src?.旁白句 || [];
  const 对象ID = src?.对象ID || diag?.对象ID || '';
  const 占比 = Number((diag?.旁白占比 ?? 0).toFixed(1));
  return 旁白句.map((原句, i) => {
    const 命中 = (cfg.旁白标记词表 || []).find(w => 原句.includes(w));
    const 类型 = i % 2 === 0 ? '台词' : '动作描述';
    const 去尾 = 原句.replace(/[。；！？\s]+$/g, '');
    return {
      对象ID,
      原句,
      建议替换: {
        文本: 类型 === '台词'
          ? `林夏：「${去尾}，这件事我得亲口说清楚。」`
          : `（${去尾}，她抬眼望向对方，指尖轻轻攥紧。）`,
        类型
      },
      理由: `该句${命中 ? `命中旁白标记词「${命中}」` : '为第三人称全知背景陈述'}，按判定优先级计入旁白；当前旁白占比 ${占比}% > 上限 ${cfg.旁白占比上限}%；诊断口径版本 ${cfg.VERSION}`
    };
  });
}
