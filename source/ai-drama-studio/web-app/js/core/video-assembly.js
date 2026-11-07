import { TRANSITION } from '../constants.js';
import { uid, now } from './uid.js';

export function defaultExportConfig() {
  return {
    帧率: 24,
    分辨率: '1920x1080',
    输出命名规则: '{顺序号}_{分镜ID}',
    片段顺序: '按镜号升序',
    默认转场类型: TRANSITION.硬切
  };
}

// VID-01/02/03：唯一片段编排点；只产出片段清单 / 导出配置 / 顺序预览数据，不产出 mp4 / webm
export function buildAssembly(project) {
  const p = project || {};
  const 导出配置 = defaultExportConfig();
  // 成品表已按「场次序号 → 镜号」排好，此处不再二次排序：各场次镜号都从 1 重数，按镜号排会把跨场次镜头打散
  const 成品 = (p.storyboardItems || []).slice();
  const 片段清单 = 成品.map((s, i) => ({
    顺序号: i + 1,
    分镜ID: s.分镜ID,
    关键帧引用: s.关键帧图引用 || '',
    时长: s.时长 || 0,
    转场类型: 导出配置.默认转场类型,
    画面说明: s.画面描述 || ''
  }));
  const assembly = { 产物ID: uid('asm'), 片段清单, 导出配置, 生成时间: now() };
  p.videoAssembly = assembly;
  return assembly;
}

export function getPreviewData(project, index) {
  const 清单 = project?.videoAssembly?.片段清单 || [];
  return Number.isInteger(index) && index >= 0 && index < 清单.length ? 清单[index] : null;
}
