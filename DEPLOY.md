# 部署说明

本项目为纯静态站点（零构建），**部署目录即应用目录**：`source/ai-drama-studio/web-app`。

## 一、当前线上入口（唯一有效）

```
https://ai-drama-studio-8t2.pages.dev/
```

- 平台：**Cloudflare Pages**
- 状态：2026-11-08 实测 `HTTP 200`，返回 `index.html` 7,216 B，与仓库同名文件逐字节一致
- 页面内路由为 hash 形式，例如剧本页 `.../#/p001`、规则库 `.../#/p013`。hash 变化不向服务器发起新请求，因此**不需要任何 rewrite 规则**

> **历史方案已失效**：Gitee Pages（`jiang-ling1023.gitee.io/ai-drama-studio/`）2026-11-08 实测返回 **404**，已不再提供服务。旧文档中凡出现该地址，均按历史记录保留，不作为可用入口。

## 二、部署配置

### 2.1 已验证的行为（通过线上实测反推）

| 项 | 实测结论 |
|---|---|
| 站点根 | `source/ai-drama-studio/web-app` —— 请求 `/css/style.css` 能拿到 CSS，说明该目录就是发布根 |
| 构建命令 | 无（站点零构建，直接发布源码目录） |
| 仓库根文件 | **不对外暴露** —— 请求 `/README.md` 返回的是 7,216 B 首页 HTML 而非 Markdown，说明 `README.md`、`docs/`、`tools/` 等仓库根内容不在发布范围内 |
| 未知路径 | 返回首页（SPA 兜底已开启）—— 请求 `/tools/ocr.py` 同样返回 7,216 B 的首页 |

### 2.2 需要你在 Cloudflare 面板确认的项

以下无法从外部探测，请自行核对（位置：Cloudflare Dashboard → Workers & Pages → 该项目 → Settings）：

- **Git 集成**：是否绑定 GitHub 仓库 `jiangling1023/ai-drama-studio`、分支 `main`。若已绑定，则每次 push 自动构建；若未绑定，则需手动上传，**push 后线上不会自动更新**。
- **Build output directory**：应为 `source/ai-drama-studio/web-app`（对应 2.1 反推结果）。
- **Build command**：应为空。
- **SPA 兜底**：若面板里有「Single Page Application」相关开关，保持开启（与 2.1 实测行为一致）。

> 这四项对不上，就会出现「改了代码线上没变」或「首页 404」。它们是排查部署问题的第一站。

## 三、每次 push 后

| 场景 | 需要做什么 |
|---|---|
| 已绑定 Git 集成 | 无需操作，Cloudflare 自动构建发布（通常 1–2 分钟）。可在面板 Deployments 里看这次提交的部署状态 |
| 未绑定 Git 集成 | 需手动上传新版本，否则线上仍是旧文件 |

验证是否真的更新：强刷（Ctrl/Cmd + Shift + R），或直接比对线上文件与本地文件的大小/哈希。

## 四、常见问题

| 现象 | 原因与处理 |
| --- | --- |
| 页面样式全部丢失、只剩纯文本 | 检查 CSS 是否为相对路径（本仓库 `index.html` 用 `href="css/style.css"`）；再排查浏览器缓存，强刷一次 |
| 直接访问 `/p001` 这类路径拿到的是首页 | 应用是 hash 路由，正确地址形如 `#/p001`；这是 SPA 兜底的正常表现，不是故障 |
| 图片不显示 | 本项目图片全部为内联 SVG（`data:` / inline），不应出现外链被拦；若出现，说明混入了外部地址，按 `scripts/check-static.sh` 扫描结果清理 |
| 页面白屏且顶部出现红色「应用加载失败」块 | 该块为加载失败兜底提示，按提示刷新；数据未改动，可在控制台看具体缺失文件 |
| 改了代码线上没变 | 见第三节：确认 Git 集成是否生效、这次提交有没有对应部署记录 |
| 首页 404 | 部署目录被填成了仓库根（根下**没有** `index.html`）。改回 `source/ai-drama-studio/web-app` |

## 五、零构建说明

本站不需要任何构建步骤：

- Build command：**留空**；
- 无 `package.json` 依赖安装、无 bundler、无 CI 产物目录；
- 直接部署源码目录即可，浏览器原生 ES module 加载 `js/app.js`。

因此本地与线上的文件完全一致，不存在「本地能跑线上不能跑」的构建差异。

## 六、附：Gitee Pages 历史配置（已停用，仅供追溯）

曾经使用 Gitee Pages 部署，配置如下，**现已失效**：

- 部署分支 `main`，部署目录 `source/ai-drama-studio/web-app`
- 免费版不自动重建，每次 push 后需在「服务 → Gitee Pages」手动点「更新」
- 当时访问地址 `https://jiang-ling1023.gitee.io/ai-drama-studio/`
- 2026-11-08 复测：`HTTP 404`（openresty 返回）

迁移到 Cloudflare Pages 后，原先「必须手动点更新」这个坑自动消失——这是换平台最实际的收益。
