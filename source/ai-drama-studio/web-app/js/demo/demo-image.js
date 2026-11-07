// 内联 SVG dataURL 唯一生成点：零外链、零随机、零时间，同 seed 永远同图（D-04 / §8.2）
function fnv1a(seed) {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function esc(text) {
  return String(text).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
  }[c]));
}

// 标签最多 12 字，超长截断补 …，避免左下角文字溢出画布
function clip(text, max) {
  const cs = Array.from(String(text == null ? '' : text));
  return cs.length > max ? cs.slice(0, max - 1).join('') + '…' : cs.join('');
}

const FONT = "system-ui, -apple-system, 'Microsoft YaHei', sans-serif";

function svgDataUrl(seed, label, kind) {
  const h = fnv1a(seed);
  const tail = kind === '尾帧';
  // 首尾帧靠色相偏移 + 构图水平镜像区分：同一分镜的两帧肉眼可分，但仍由 seed 唯一决定
  const hueA = ((h % 360) + (tail ? 26 : 0)) % 360;
  const hueB = (((h >>> 9) % 360) + (tail ? 320 : 0)) % 360;
  const hueC = (((h >>> 17) % 360) + (tail ? 30 : 0)) % 360;
  const mx = v => (tail ? 320 - v : v);

  // 柔和光斑：椭圆 + objectBoundingBox 径向渐变，等效大半径柔化，透明度 .18~.30
  const b1x = mx(70 + (h % 70));
  const b1y = 34 + ((h >>> 6) % 32);
  const b2x = mx(210 + ((h >>> 12) % 70));
  const b2y = 104 + ((h >>> 20) % 46);
  const b3x = mx(140 + ((h >>> 4) % 90));
  const b3y = 8 + ((h >>> 26) % 30);

  // 背景天际线：seed 决定每根高度，极低透明度只作纵深，不与人物剪影抢主体
  const bars = [0, 1, 2, 3].map(i => {
    const bh = 20 + ((h >>> (i * 3 + 11)) % 46);
    const bw = 34 + ((h >>> (i * 5 + 3)) % 30);
    const bx = i * 82 + ((h >>> (i + 21)) % 16) - 4;
    return `<rect x="${bx}" y="${180 - bh}" width="${bw}" height="${bh}" rx="2" fill="#fff" opacity=".035"/>`;
  }).join('');

  // 抽象人物剪影：头（椭圆）+ 肩（贝塞尔梯形），seed 决定水平落点
  const cx = mx(148 + ((h >>> 8) % 44));
  const figure = `<ellipse cx="${cx}" cy="84" rx="12" ry="15" fill="url(#fig)"/>`
    + `<path d="M ${cx - 46} 180 C ${cx - 44} 132 ${cx - 22} 114 ${cx - 10} 100 L ${cx + 10} 100`
    + ` C ${cx + 22} 114 ${cx + 44} 132 ${cx + 46} 180 Z" fill="url(#fig)"/>`;

  const labelText = clip(label, 12);
  const tag = clip(kind || '演示图', 4);
  const tagW = 16 + Array.from(tag).length * 10;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180" role="img">`
    + `<defs>`
    + `<linearGradient id="bg" x1="0" y1="0" x2="0.9" y2="1"><stop offset="0" stop-color="#0E1420"/><stop offset="1" stop-color="#1A2233"/></linearGradient>`
    + `<radialGradient id="gA"><stop offset="0" stop-color="hsl(${hueA},72%,66%)" stop-opacity=".30"/><stop offset="1" stop-color="hsl(${hueA},72%,66%)" stop-opacity="0"/></radialGradient>`
    + `<radialGradient id="gB"><stop offset="0" stop-color="hsl(${hueB},70%,62%)" stop-opacity=".22"/><stop offset="1" stop-color="hsl(${hueB},70%,62%)" stop-opacity="0"/></radialGradient>`
    + `<radialGradient id="gC"><stop offset="0" stop-color="hsl(${hueC},78%,70%)" stop-opacity=".18"/><stop offset="1" stop-color="hsl(${hueC},78%,70%)" stop-opacity="0"/></radialGradient>`
    + `<linearGradient id="fig" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity=".06"/></linearGradient>`
    + `<linearGradient id="vg" x1="0" y1="0" x2="0" y2="1"><stop offset=".58" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient>`
    + `<pattern id="sc" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#fff" fill-opacity=".03"/></pattern>`
    + `</defs>`
    + `<rect width="320" height="180" fill="url(#bg)"/>`
    + `<ellipse cx="${b1x}" cy="${b1y}" rx="130" ry="98" fill="url(#gA)"/>`
    + `<ellipse cx="${b2x}" cy="${b2y}" rx="112" ry="86" fill="url(#gB)"/>`
    + `<ellipse cx="${b3x}" cy="${b3y}" rx="96" ry="72" fill="url(#gC)"/>`
    + bars
    + figure
    + `<rect width="320" height="180" fill="url(#vg)"/>`
    + `<rect width="320" height="180" fill="url(#sc)"/>`
    + `<text x="12" y="168" font-family="${FONT}" font-size="11" fill="#E8ECF4" opacity=".92" letter-spacing=".3">${esc(labelText)}</text>`
    + `<rect x="${312 - tagW}" y="9" width="${tagW}" height="18" rx="9" fill="#0E1420" opacity=".55" stroke="#fff" stroke-opacity=".16"/>`
    + `<text x="${312 - tagW / 2}" y="22" text-anchor="middle" font-family="${FONT}" font-size="10" fill="#E8ECF4" opacity=".85">${esc(tag)}</text>`
    + `</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export function demoImage(seed, label) {
  const s = String(seed ?? '');
  return svgDataUrl(s, label || s, '');
}

// 首帧/尾帧几何不同且可复现：seed 固定为「分镜ID|帧类型」
export function demoKeyFrame(分镜ID, 帧类型) {
  const id = String(分镜ID ?? '');
  const t = String(帧类型 ?? '首帧');
  return svgDataUrl(`${id}|${t}`, `${id}·${t}`, t);
}
