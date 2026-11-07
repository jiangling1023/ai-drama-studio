// 13 页懒加载注册表：页面文件由 E/F 并行产出，未就绪时不阻塞其他页
const DEFS = [
  { step: 1, pageId: 'p001', funcId: 'F-001', name: '剧本', file: './p001-script.js' },
  { step: 2, pageId: 'p002', funcId: 'F-002', name: '拆分剧本', file: './p002-split.js' },
  { step: 3, pageId: 'p003', funcId: 'F-003', name: '分解提取资产', file: './p003-assets.js' },
  { step: 4, pageId: 'p004', funcId: 'F-004', name: '人物锚点锁定', file: './p004-anchor.js' },
  { step: 5, pageId: 'p005', funcId: 'F-005', name: '分镜脚本', file: './p005-storyboard.js' },
  { step: 6, pageId: 'p006', funcId: 'F-006', name: '图片生成', file: './p006-image.js' },
  { step: 7, pageId: 'p007', funcId: 'F-007', name: '关键帧生成', file: './p007-keyframe.js' },
  { step: 8, pageId: 'p008', funcId: 'F-008', name: '提示词', file: './p008-prompt.js' },
  { step: 9, pageId: 'p009', funcId: 'F-009', name: '画布生成', file: './p009-canvas.js' },
  { step: 10, pageId: 'p010', funcId: 'F-010', name: '分镜生成', file: './p010-storyboard-gen.js' },
  { step: 11, pageId: 'p011', funcId: 'F-011', name: '视频整合', file: './p011-video.js' },
  { step: 12, pageId: 'p012', funcId: 'F-012', name: 'AI 短剧导演', file: './p012-director.js' },
  { step: 0, pageId: 'p013', funcId: 'F-013', name: '短剧规则库', file: './p013-rules.js' },
];

// 懒加载容错：页面文件未交付/加载失败时给出可读占位，绝不白屏、不改动工程数据
function lazy(id, file, name) {
  return function render(container, ctx, extra) {
    import(file).then(m => {
      if (typeof m.render === 'function') m.render(container, ctx, extra || {});
    }).catch(e => {
      if (!container) return;
      container.innerHTML = `<div class="page"><div class="section"><h2>${name} 页面模块未就绪</h2><p class="muted">文件 ${file} 尚未交付或加载失败，工程数据未改动</p></div></div>`;
    });
  };
}

export const PAGE_REGISTRY = DEFS.map(d => ({ ...d, render: lazy(d.pageId, d.file, d.name) }));

export function getPage(pageId) {
  const d = PAGE_REGISTRY.find(x => x.pageId === pageId);
  return d && d.render;
}

export function getNextStep(step) {
  const d = PAGE_REGISTRY.filter(x => x.step > 0).sort((a, b) => a.step - b.step).find(x => x.step === step + 1);
  return d ? d.pageId : '';
}
