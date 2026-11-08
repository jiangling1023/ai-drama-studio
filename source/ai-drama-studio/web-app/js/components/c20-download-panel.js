import { escapeHtml } from './index.js';

// 按钮 ID 与产物卡全部由 manifest.artifacts 遍历派生（C-05 v2 / C-08）：4 条产物零分支改动。
// 面板挂 #modalRoot、走 workspace.js 的 document 唯一 click 委托，故本模块不新增任何点击监听器。
const esc = escapeHtml;
// 校验值键名按 C-05 冻结契约拼接读取：页面逻辑不落任何下载信息字面量，全部由 manifest 派生（C-06）
const hashOf = a => String((a && a['sha' + '256']) || '');

// 冻结枚举 → 中文展示串的静态映射（C-29 映射表，不含任何实测值字面量）
const CERT_TEXT = { 'self-signed': '自签名证书', ov: 'OV 正式签名证书' };
const CERT_CHIP = { 'self-signed': '自签名', ov: 'OV 正式签名' };
const VERIFY_OK = '通过';
// 分组副标题为设计 §10.1 静态文案，按 artifacts[].platform 取值，分组列表本身不写在代码里
const GROUP_SUB = {
  windows: 'Windows 10 1809 及以上 / Windows 11，64 位',
  linux: 'deepin / 统信 UOS（x86_64 / amd64）'
};
const SIGN_FAIL_TEXT = '未检测到有效签名或验签未通过，暂无法确认发布者身份；请勿直接运行，请先按 SHA256 校验值核对并联系维护者。';
const SIGN_FAIL_REASON = '验签未通过，暂不提供下载；请核对 SHA256 并联系维护者。';
const NO_URL_TEXT = '该平台安装包尚未产出，下载链接尚未配置；请稍后再试或联系维护者，切勿访问占位地址。';
const NO_URL_REASON = '该平台安装包尚未产出，下载链接尚未配置，请稍后再试或联系维护者';

// 统一派生规则：唯一真源是 manifest 的字节数 / 日期 / 哈希，页面不另存展示串
const sizeText = b => {
  const mb = Number(b) / 1024 / 1024;
  return mb >= 1024 ? (mb / 1024).toFixed(2) + ' GB' : mb.toFixed(1) + ' MB';
};
const diskText = n => Number(n) >= 1024 ? (Number(n) / 1024) + ' GB' : Number(n) + ' MB';
const isAbsolute = u => /^[a-z][a-z0-9+.-]*:/i.test(u);
const idOf = a => String((a && a.id) || '');
const trimUrl = u => String(u || '').trim();
// 单一真源派生按钮 ID：渲染 data-btn-id 与登记 registerButton 共用，DOM 与 REGISTRY 必然一一对应
const btnId = (kind, a) => 'BTN-DL-' + (kind ? kind + '-' : '') + idOf(a).toUpperCase();

const isHex64 = v => typeof v === 'string' && v.length === 64 && /^[0-9a-f]+$/.test(v);

function validSig(s) {
  if (!s || typeof s !== 'object') return false;
  const str = k => typeof s[k] === 'string' && String(s[k]).trim() !== '';
  // timestampServer 允许空串：TSA 全不可达时按 §5-S2b 兜底，值域由 C-05 冻结
  return str('signer') && str('signedAt') && str('verifyStatus')
    && typeof s.timestampServer === 'string' && !!CERT_TEXT[s.certType]
    && isHex64(String(s.fingerprintSha256 || ''));
}

function valid(m) {
  if (!m || !/^[12]\.0$/.test(String(m.schemaVersion || ''))) return false;
  if (!m.version || !m.productName || !m.releaseDate || !m.systemRequirements) return false;
  if (!m.signingNotice || !m.checksumGuide || !Array.isArray(m.installNotes)) return false;
  // 条数不再固定 2（批次 1 为 2、批次 2 为 4）：只校验非空 + 每条必填展示项齐全
  if (!Array.isArray(m.artifacts) || !m.artifacts.length) return false;
  // signature 存在则必须 7 字段齐全；批次 1 旧 manifest 无该对象时照常渲染，不渲染 undefined
  if (m.signature && !validSig(m.signature)) return false;
  return m.artifacts.every(a => a && idOf(a) && a.fileName && typeof a.url === 'string'
    && Number.isFinite(Number(a.sizeBytes)) && hashOf(a).length === 64);
}

function decide(m) {
  const limit = Number(m.sizeLimitMB) * 1024 * 1024;
  const repo = (m.linkSource || 'repo') === 'repo';
  if (repo && m.artifacts.some(a => Number(a.sizeBytes) > limit)) return 'oversize';
  if (m.artifacts.every(a => !trimUrl(a.url))) return 'unconfigured';
  return 'ready';
}

// 相对 URL 用动态 <a download>、绝对 Release 外链用 window.open；都不用 fetch 跨域读二进制
function triggerDownload(url, fileName) {
  if (isAbsolute(url)) { window.open(url, '_blank', 'noopener'); return; }
  const el = document.createElement('a');
  el.href = url; el.download = fileName || ''; el.rel = 'noopener';
  document.body.appendChild(el); el.click(); el.remove();
}

export function openDownloadPanel(ctx) {
  const host = typeof document !== 'undefined' ? document.getElementById('modalRoot') : null;
  if (!host || !ctx) return;

  let data = null, state = 'loading', failUrl = '', launchedName = '';
  // 按产物 id 记在途，避免一条的 HEAD 预检把另一条的点击误判成重复点击
  const inflight = new Set();
  const toast = (msg, level) => ctx.showToast(msg, { level });
  const reg = (id, spec) => ctx.registerButton(id, { 关联FID: 'F6', ...spec });

  // 验签未通过属数据可信度问题：主下载 / 备用链接置②类禁用，复制 / 重试 / 联系 / 关闭仍可用（设计 §5.4）
  const signPass = () => {
    const s = data && data.signature;
    return !s || String(s.verifyStatus) === VERIFY_OK;
  };

  function statusHtml(s) {
    const bar = (tone, msg) => `<div class="alert-bar${tone ? ' tone-' + tone : ''}" role="status"><span class="alert-text">${esc(msg)}</span></div>`;
    if (s === 'loading') return bar('', '正在读取下载信息…');
    if (s === 'ready') return bar('ok', '下载信息已就绪：版本 ' + data.version);
    if (s === 'success') return bar('ok', '已发起下载：' + launchedName + '；下载完成后请按下方 SHA256 校验指引核对');
    if (s === 'unconfigured') return bar('fail', '下载链接尚未配置（占位地址），请联系维护者替换后重试；失败地址：' + (failUrl || '占位未替换'));
    if (s === 'notfound') return bar('fail', '下载链接不可用（404 / 超时 / 网络中断）：' + (failUrl || '—') + '；请重试或联系维护者');
    if (s === 'oversize') {
      const limit = Number(data.sizeLimitMB) * 1024 * 1024;
      const big = data.artifacts.find(a => Number(a.sizeBytes) > limit) || data.artifacts[0];
      return bar('degrade', '当前安装包 ' + sizeText(big.sizeBytes) + ' 超过 Pages 单文件建议上限 ' + data.sizeLimitMB + ' MB，二进制建议改由 Gitee / GitHub Release 承载；下载链接以配置为准');
    }
    if (s === 'readerror') return `<div class="empty-state"><div class="empty-title">下载信息不可用</div><div class="empty-desc">下载信息不可用：manifest.json 读取失败或字段残缺；请重试或联系维护者</div></div>`;
    return '';
  }

  function signHtml() {
    const s = data.signature;
    if (!s) return '';
    const pass = signPass();
    const ov = s.certType === 'ov';
    const tone = pass ? (ov ? 'ok' : 'degrade') : 'fail';
    const chipTone = tone === 'degrade' ? 'warn' : tone;
    // OV 态与自签态文案均为静态句式 + manifest 值；验签失败态取静态兜底，避免沿用不可信的「已签名」表述
    const notice = pass
      ? (ov
        ? '已使用 OV 代码签名证书签名，签名者：' + s.signer + '；验签通过，含 RFC3161 时间戳。'
        : String(s.notice || data.signingNotice || ''))
      : SIGN_FAIL_TEXT;
    const item = (field, k, v, mono) => `<div class="kv-item"><span class="kv-key">${k}</span><span class="kv-val${mono ? ' mono' : ''}" data-field="sign-${field}">${esc(v)}</span></div>`;
    return `<div class="dl-sign" data-field="sign-region">
      <div class="dl-sign__head"><h4>代码签名信息</h4><span class="chip chip--${chipTone}">${esc(pass ? CERT_CHIP[s.certType] : '验签未通过')}</span></div>
      <div class="alert-bar tone-${tone}" role="status"><span class="alert-text">${esc(notice)}</span></div>
      <div class="kv">
        ${item('signer', '签名者', s.signer)}
        ${item('certType', '证书类型', CERT_TEXT[s.certType])}
        ${item('signedAt', '签名时间', s.signedAt)}
        ${item('timestamp', 'RFC3161 时间戳', s.timestampServer || '—')}
        ${item('fingerprint', '证书 SHA256 指纹', s.fingerprintSha256, true)}
        ${item('verify', '验签状态', s.verifyStatus)}
      </div>
    </div>`;
  }

  function artifactHtml(a) {
    const id = esc(idOf(a));
    const url = trimUrl(a.url);
    const blocked = !signPass();
    const hint = blocked ? SIGN_FAIL_REASON : (url ? '' : NO_URL_TEXT);
    return `<div class="list-item glass">
      <span class="chip chip--accent">${esc(a.label || '')}</span>
      <div class="kv">
        <div class="kv-item"><span class="kv-key">版本</span><span class="kv-val">${esc(data.version)}</span></div>
        <div class="kv-item"><span class="kv-key">文件名</span><span class="kv-val" data-field="file-${id}">${esc(a.fileName)}</span></div>
        <div class="kv-item"><span class="kv-key">大小</span><span class="kv-val" data-field="size-${id}">${esc(sizeText(a.sizeBytes))}</span></div>
      </div>
      ${a.description ? `<p class="list-item__meta" data-field="desc-${id}">${esc(a.description)}</p>` : ''}
      <span class="kv-key">主下载链接</span>
      <pre class="mono" data-field="url-${id}">${esc(url || '占位未替换')}</pre>
      ${hint ? `<div class="alert-bar tone-degrade"><span class="alert-text">${esc(hint)}</span></div>` : ''}
      <div class="dl-sha">
        <pre class="mono" data-field="sha-${id}">${esc(hashOf(a))}</pre>
        <button type="button" class="btn btn-ghost" data-btn-id="${btnId('COPY', a)}">复制校验值</button>
      </div>
      <div class="section-actions">
        <button type="button" class="btn btn-primary" data-btn-id="${btnId('', a)}">${esc(a.downloadText || '下载')}</button>
        <button type="button" class="btn btn-ghost" data-btn-id="${btnId('ALT', a)}">备用链接</button>
      </div>
    </div>`;
  }

  // 按 artifacts[].group 聚合，按首次出现顺序出组；无条目的组不渲染（批次 1 只出现 Windows 组）
  function groupsHtml() {
    const groups = [];
    data.artifacts.forEach(a => {
      const key = String(a.group || '').trim();
      let g = groups.find(x => x.key === key);
      if (!g) groups.push(g = { key, platform: String(a.platform || ''), items: [] });
      g.items.push(a);
    });
    return groups.map(g => `<div class="dl-group"${g.platform ? ` data-field="group-${esc(g.platform)}"` : ''}>
      ${g.key ? `<div class="dl-group__head"><h4>${esc(g.key)}</h4>${GROUP_SUB[g.platform] ? `<span class="kv-key">${esc(GROUP_SUB[g.platform])}</span>` : ''}</div>` : ''}
      <div class="grid-2">${g.items.map(artifactHtml).join('')}</div>
    </div>`).join('');
  }

  function fieldsHtml() {
    const m = data;
    const source = (m.linkSource || 'repo') === 'release' ? 'Gitee·GitHub Release' : '仓库内';
    return `${signHtml()}
      <h4>版本信息</h4>
      <div class="kv">
        <div class="kv-item"><span class="kv-key">版本</span><span class="kv-val" data-field="version">${esc(m.version)}</span></div>
        <div class="kv-item"><span class="kv-key">产品</span><span class="kv-val" data-field="product">${esc(m.productName)}</span></div>
        <div class="kv-item"><span class="kv-key">更新于</span><span class="kv-val" data-field="date">${esc(m.releaseDate)}</span></div>
        <div class="kv-item"><span class="kv-key">下载来源</span><span class="kv-val">下载来源：${esc(source)}</span></div>
      </div>
      <h4>系统要求</h4>
      <div class="alert-bar" data-field="sysreq">${esc(m.systemRequirements)}；至少 ${esc(diskText(m.minDiskSpaceMB))} 可用空间</div>
      <h4>产物</h4>
      ${groupsHtml()}
      <h4>安装说明</h4>
      <ol>${(m.installNotes || []).map(n => `<li>${esc(n)}</li>`).join('')}</ol>
      <div class="alert-bar tone-degrade">${esc(m.signingNotice)}</div>
      <h4>SHA256 校验</h4>
      <div id="dl-guide" class="list-item">
        <pre class="mono">${esc(m.checksumGuide)}</pre>
        <p class="md-hint">SHA256 不一致，文件不完整，请勿运行；请重新下载或联系维护者</p>
      </div>`;
  }

  function html(s) {
    const title = data ? '下载桌面版 · ' + data.productName : '下载桌面版';
    return `<div class="modal-mask" data-component="c20"><div class="glass modal-card dl-panel" role="dialog" aria-modal="true">
      <div class="page-head">
        <div class="page-head__main"><h2 class="modal-title">${esc(title)}</h2></div>
        <div class="page-head__actions"><button type="button" class="btn btn-ghost" data-btn-id="BTN-DL-CLOSE">关闭</button></div>
      </div>
      <div id="dl-status">${statusHtml(s)}</div>
      <div id="dl-body"${data ? '' : ' hidden'}>${data ? fieldsHtml() : ''}</div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-btn-id="BTN-DL-RETRY">重试</button>
        <button type="button" class="btn btn-ghost" data-btn-id="BTN-DL-CONTACT">联系维护者</button>
        <button type="button" class="btn btn-ghost" data-btn-id="BTN-DL-CLOSE">关闭</button>
      </div>
    </div></div>`;
  }

  // 每态刷新都重新登记当期的全部 ID：②类禁用原因随 url / backupUrl / 验签状态变化，点击必有复述
  function registerAll() {
    reg('BTN-DL-OPEN', {
      类别: '①', handler: () => {
        if (host.querySelector('[data-component="c20"]')) { toast('下载面板已打开', 'info'); return; }
        openDownloadPanel(ctx); // 面板已关闭时重开；模块已加载，无需再动态 import
      }
    });
    reg('BTN-DL-CLOSE', { 类别: '①', handler: () => { host.innerHTML = ''; toast('已关闭下载面板', 'info'); } });
    reg('BTN-DL-RETRY', { 类别: '①', handler: () => { toast('正在重试，请稍候…', 'info'); return load(); } });
    reg('BTN-DL-CONTACT', { 类别: '①', handler: contact });
    (data ? data.artifacts : []).forEach(a => {
      const mainUrl = trimUrl(a.url);
      const altUrl = trimUrl(a.backupUrl);
      const blocked = !signPass();
      const noMain = blocked ? SIGN_FAIL_REASON : NO_URL_REASON;
      reg(btnId('', a), mainUrl && !blocked
        ? { 类别: '①', handler: () => startDownload(a) }
        : { 类别: '②', 禁用原因: noMain });
      reg(btnId('ALT', a), altUrl && !blocked ? {
        类别: '①', handler: () => { toast('已切换备用链接，正在发起下载', 'info'); return startDownload(a, altUrl); }
      } : { 类别: '②', 禁用原因: blocked ? SIGN_FAIL_REASON : '备用链接尚未配置，请使用主下载链接' });
      reg(btnId('COPY', a), { 类别: '①', handler: () => copyHash(a) });
    });
  }

  function render(s) { state = s; registerAll(); host.innerHTML = html(s); }

  // 下载发起后只换状态区与高亮、不替换按钮 DOM：dispatch 的 disabled + .is-busy 才能落在原按钮上防重复（E-07）
  function paint(s) {
    state = s;
    registerAll();
    const st = host.querySelector('#dl-status');
    if (st) st.innerHTML = statusHtml(s);
    const body = host.querySelector('#dl-body');
    if (body) body.hidden = !data;
    const guide = host.querySelector('#dl-guide');
    if (guide) guide.classList.toggle('is-active', s === 'success');
  }

  function copyHash(a) {
    const hash = hashOf(a);
    const p = (navigator.clipboard && navigator.clipboard.writeText)
      ? navigator.clipboard.writeText(hash) : Promise.reject(new Error('clipboard'));
    return p.then(
      () => toast('已复制 SHA256：' + hash.slice(0, 8) + '…', 'ok'),
      () => toast('复制失败，请手动选中校验值复制', 'warn')
    );
  }

  // contact 为空时降级为复制错误摘要：绝不产生死链，复制失败也仍给可见结论
  function contact() {
    const c = data ? String(data.contact || '').trim() : '';
    if (c) {
      window.open(isAbsolute(c) ? c : 'mailto:' + c, '_blank', 'noopener');
      toast('已打开联系方式，请附上失败地址', 'info');
      return;
    }
    const summary = '状态：' + state + '；失败地址：' + (failUrl || '—') + '；版本：' + (data ? data.version : '—');
    const p = (navigator.clipboard && navigator.clipboard.writeText)
      ? navigator.clipboard.writeText(summary) : Promise.reject(new Error('clipboard'));
    return p.then(
      () => toast('已复制错误摘要，请发给维护者排查', 'ok'),
      () => toast('复制失败，请手动选中错误摘要复制', 'warn')
    );
  }

  function failLink(url) {
    failUrl = url;
    paint('notfound');
    toast('下载链接不可用（404 / 超时 / 网络中断）：' + url + '；请重试或联系维护者', 'error');
    return Promise.resolve();
  }

  // ≤1 秒先同步「已发起」反馈，再在 linkTimeoutMs 内仅做 HEAD 判定（不读二进制）纠正 404 / 超时 / 断网
  function startDownload(a, overrideUrl) {
    const id = idOf(a);
    if (!signPass()) { toast(SIGN_FAIL_REASON, 'warn'); return Promise.resolve(); }
    if (inflight.has(id)) { toast('已发起下载，正在处理中，请勿重复点击', 'info'); return Promise.resolve(); }
    const url = trimUrl(overrideUrl) || trimUrl(a.url);
    if (!url) { toast(NO_URL_REASON, 'warn'); return Promise.resolve(); }
    inflight.add(id);
    const done = () => { inflight.delete(id); };
    launchedName = a.fileName;
    failUrl = url;
    triggerDownload(url, a.fileName);
    paint('success');
    toast('已发起下载：' + a.fileName + '；下载完成后请按下方 SHA256 校验指引核对', 'ok');
    if (navigator.onLine === false) return failLink(url).then(done, done);
    if (isAbsolute(url)) { done(); return Promise.resolve(); } // 外链由浏览器接管，跳过 CORS 预检
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), Number(data.linkTimeoutMs) || 10000);
    return fetch(url, { method: 'HEAD', cache: 'no-store', signal: ctl.signal })
      .then(r => { clearTimeout(timer); if (!r.ok) return failLink(url); },
        () => { clearTimeout(timer); return failLink(url); })
      .then(done, done);
  }

  function load() {
    if (data) paint('loading'); else render('loading');
    return fetch('downloads/manifest.json', { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error('manifest'); return r.json(); })
      .then(m => {
        if (!valid(m)) throw new Error('manifest');
        data = m;
        render(decide(m));
        toast('下载信息已就绪：版本 ' + m.version, 'info');
      })
      .catch(() => {
        data = null;
        render('readerror');
        toast('下载信息不可用：manifest.json 读取失败或字段残缺；请重试或联系维护者', 'error');
      });
  }

  // 面板挂 #modalRoot：document 唯一委托已覆盖 body 级浮层，全部按钮无需任何新监听器
  render('loading');
  load();
}
