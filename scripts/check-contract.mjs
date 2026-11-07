#!/usr/bin/env node
// 数据契约与核心函数断言：任何一条 FAIL 即以 1 退出，用于提交前门禁
import { createEmptyProject, SCHEMA_VERSION } from '../source/ai-drama-studio/web-app/js/schema.js';
import { EL_FRAMEWORK } from '../source/ai-drama-studio/web-app/js/constants.js';
import { assembleNegativePrompt } from '../source/ai-drama-studio/web-app/js/core/prompt-builder.js';
import { generateShotTimeline, generateReview } from '../source/ai-drama-studio/web-app/js/core/director.js';
import { countByStage } from '../source/ai-drama-studio/web-app/js/core/rules-library.js';

let failed = 0;
const pass = (名, 附 = '') => console.log(`PASS  ${名}${附 ? ' —— ' + 附 : ''}`);
const fail = (名, 附 = '') => { failed++; console.log(`FAIL  ${名}${附 ? ' —— ' + 附 : ''}`); };
const 断言 = (名, 条件, 附 = '') => (条件 ? pass(名, 附) : fail(名, 附));

const p = createEmptyProject();

// ① 4 类 V3 集合 + 一致性种子 + 内置区规模 + 版本
const V3 = ['shotDeconstructions', 'promptArchitectResults', 'reverseAnalyses', 'consistencyRules'];
断言('createEmptyProject 含 4 类 V3 集合', V3.every(k => Array.isArray(p[k])),
  V3.map(k => `${k}=${Array.isArray(p[k]) ? 'array' : 'missing'}`).join(' '));
断言('consistencyRules 6 条', p.consistencyRules.length === 6, `实际 ${p.consistencyRules.length}`);
断言('一致性约束锁定 === true', p.一致性约束锁定 === true, `实际 ${p.一致性约束锁定}`);
断言('rulesLibrary.内置规则 18 条', p.rulesLibrary.内置规则.length === 18, `实际 ${p.rulesLibrary.内置规则.length}`);
断言('ruleTemplates 5 条', p.ruleTemplates.length === 5, `实际 ${p.ruleTemplates.length}`);
断言('compositionPresets 24 条', p.compositionPresets.length === 24, `实际 ${p.compositionPresets.length}`);
断言('schemaVersion >= 4', p.schemaVersion >= 4, `SCHEMA_VERSION=${SCHEMA_VERSION}，实例=${p.schemaVersion}`);

// ② 8 要素框架：8 个要素，每个要素的细分项（可选取值）≥3
const 要素键 = Object.keys(EL_FRAMEWORK);
const 细分统计 = 要素键.map(k => `${k}:维度${Object.keys(EL_FRAMEWORK[k]).length}/取值${Object.values(EL_FRAMEWORK[k]).flat().length}`);
断言('EL_FRAMEWORK 8 要素', 要素键.length === 8, `实际 ${要素键.length}`);
断言('EL_FRAMEWORK 每要素细分项 ≥3',
  要素键.every(k => Object.values(EL_FRAMEWORK[k]).flat().length >= 3), 细分统计.join(' '));

// ③ 负面词组装：6 类一致性表达齐全
const 负面 = assembleNegativePrompt(p, { 单条负面词: ['模糊'] });
const 缺类 = p.consistencyRules.filter(r => !负面.includes(r.提示词表达)).map(r => r.类别);
断言('assembleNegativePrompt 6 类一致性表达齐全', 缺类.length === 0,
  `共 ${负面.length} 条${缺类.length ? '，缺 ' + 缺类.join('/') : ''}`);

// ④ 镜头时间轴：条数 > 0、23 维度非空、镜头序号升序
const 时间轴 = generateShotTimeline(p, {});
const 有值维度 = (() => {
  const e = 时间轴[0] || {};
  return Object.values(e).filter(v => {
    if (v === null || v === undefined || v === '') return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.values(v).some(x => x !== '' && x != null);
    return true;
  }).length;
})();
const 字段数 = 时间轴[0] ? Object.keys(时间轴[0]).length : 0;
const 序号升序 = 时间轴.every((e, i) => i === 0 || e.镜头序号 > 时间轴[i - 1].镜头序号);
断言('generateShotTimeline 条数 > 0', 时间轴.length > 0, `实际 ${时间轴.length} 条`);
断言('时间轴 23 维度非空', 有值维度 >= 23, `字段 ${字段数} 个，非空 ${有值维度} 个`);
断言('镜头序号升序', 序号升序, 时间轴.map(e => e.镜头序号).join(','));

// ⑤ 复核报告：检查项 ≥15（7 基础 + R-01~R-08 规则库注入）
const 报告 = generateReview(p, []);
const 检查项 = (报告.检查项结果 || []).length;
断言('generateReview 检查项 ≥15', 检查项 >= 15, `实际 ${检查项}`);

// ⑥ 规则库五阶段计数
const 期望 = { 剧本: 3, 分镜: 5, 画面资产: 4, 视频: 4, 审阅: 2 };
const 实测 = countByStage(p);
断言('countByStage 五阶段计数', Object.keys(期望).every(k => 实测[k] === 期望[k]),
  `实际 ${JSON.stringify(实测)}`);

console.log(`\n== 统计 ==\n失败 ${failed} 项`);
if (failed > 0) { console.log('结果：失败'); process.exit(1); }
console.log('结果：通过');
