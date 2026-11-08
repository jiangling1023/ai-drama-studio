# WorkBuddy_files.zip 扫描报告

> 扫描对象：`/home/jiangl1023/Downloads/WorkBuddy_files.zip`（约 12 MB）
> 解压位置：`downloads/workbuddy_files/WorkBuddy_files/`
> 扫描时间：2026-11-08

## 一、结论（先说结果）

**该压缩包不是 AI Drama Studio 的工程包，不含短剧项目的源码、文档或发布产物。**

它是 **WorkBuddy 网页应用自身的前端构建产物**（即 `WorkBuddy.html` 打开时加载的那些 JS / CSS / 图片资源），
本质上是网页的“资源附件”，与网页正文里描述的那套 `/workspace` 工程无关。

因此：
- 不能从该 zip 恢复短剧工作台的源代码
- 不能从该 zip 恢复 47～53 号交付文档
- 不能从该 zip 恢复 Windows / Linux 发布包与签名文件

## 二、基础统计

| 项目 | 数值 |
| --- | --- |
| 文件总数 | 45 |
| 总大小 | 29.7 MB（解压后） |
| 目录层级 | 单层，无子目录 |

### 按类型分布

| 扩展名 | 数量 | 体积 |
| --- | --- | --- |
| `.js` | 20 | 22.3 MB |
| `.css` | 20 | 6.2 MB |
| `.png` | 2 | 0.8 MB |
| `.txt` | 2 | 约 0.0 MB（各 43 B） |
| 无扩展名 | 1 | 0.4 MB |

### 体积 Top 15

| 文件 | 大小 |
| --- | --- |
| `main-D4DaPwsz.js` | 13,695,699 B（13.0 MB） |
| `genie-chat-ui-BZOVkzRI.js` | 4,992,356 B |
| `main-C3E2M8Nu.css` | 3,075,854 B |
| `genie-chat-ui-CPTeFKcA.css` | 1,430,048 B |
| `vendor-oneid-CIPTEhtR.css` | 1,279,335 B |
| `vendor-hljs-Dxy23WFe.js` | 1,118,211 B |
| `vendor-markdown-DgQBWTyQ.js` | 671,177 B |
| `vendor-ui-shared-Dja0J8HG.js` | 593,381 B |
| `vendor-katex-CmE3DlAf.js` | 560,023 B |
| `qcloudStatApi.js` | 475,623 B |
| `team.png` | 459,848 B |
| `gtm.js` | 438,095 B |
| `destination`（无扩展名） | 435,176 B |
| `lead.png` | 429,748 B |
| `deeplink-D_YOrN9W.css` | 251,524 B |

## 三、判定依据

### 1. 文件名符合 Vite 构建指纹规范

所有资源都带 8 位随机 hash 后缀，是典型的前端打包产物：

```
main-D4DaPwsz.js
genie-chat-ui-BZOVkzRI.js
vendor-react-wzHj1HtF.js
modulepreload-polyfill-B5Qt9EMX.js
vite-preload-helper-PPVm8Dsz.js
```

`modulepreload-polyfill`、`vite-preload-helper`、`vendor-*` 分包，都是 Vite 打包器的固定产物特征，
工程源码里不会出现这类命名。

### 2. 命名空间全部指向 WorkBuddy 自身功能

出现的模块名：`genie-chat-ui`（聊天界面）、`shared-account-http`（账号）、`AccountPanel`、
`ExtensionsSettingsPanel`、`DataManagementPanel`、`shared-i18n`、`genie-monitor`（监控）、
`deeplink`、`storage-quota-exceeded-dialog-host`、`mac-dmg-prompt-services`。

这些都是 WorkBuddy 客户端/网页的功能模块，没有一个与“短剧”“分镜”“视频生成”相关。

### 3. 关键词全文检索结果

| 关键词 | 命中文件 | 说明 |
| --- | --- | --- |
| `drama` | `vendor-ui-shared-Dja0J8HG.js` | 仅 UI 组件库里的普通字符串，非项目代码 |
| `短剧` | 无 | — |
| `AppImage` | 无 | — |
| `RELEASE-NOTES` | `main-D4DaPwsz.js` | 聊天界面渲染产物文件名用的字符串，非真实文件 |

关键证据：**`短剧` 和 `AppImage` 在全量 29.7 MB 里零命中**。
如果这是短剧项目的构建产物，Linux 打包必然出现 `AppImage`，项目名也必然出现“短剧”。

### 4. 存在网页埋点脚本

`gtm.js`（Google Tag Manager，438 KB）、`qcloudStatApi.js`（腾讯云统计，475 KB）、
`analytics.js`、`genie-monitor-BVZQFfk9.js` —— 这是网站分析/监控脚本，
桌面应用或离线工程不会打包这些东西。

### 5. 两个 txt 文件为无意义占位

```
f.txt   43 B
f(1).txt 43 B
内容：window['google_noFurtherRedirects'] = true;
```

这是 Google 相关的页面跳转控制脚本，与项目无关。

### 6. `destination`（无扩展名，435 KB）

经体积与命名比对，为网页快照保存时丢失扩展名的静态资源，非可执行文件、非数据文件。

## 四、与真正工程包的差别

| 期望内容 | 该 zip 是否具备 |
| --- | --- |
| 源码目录（组件、页面、逻辑） | ✗ 全部为压缩混淆后的 bundle |
| `package.json` / 构建配置 | ✗ 不存在 |
| 47～53 号交付文档 | ✗ 不存在 |
| Windows 安装包 / 便携版 | ✗ 不存在 |
| Linux `.deb` / `.AppImage` | ✗ 不存在 |
| 代码签名证书 / 签名记录 | ✗ 不存在 |
| RELEASE NOTES 正文 | ✗ 不存在（仅 bundle 里有字符串） |

## 五、可回收价值

**基本为零。** 唯一能做的只是：
- 确认快照页面由哪个前端版本渲染（据此推断抓取时间点）
- 从 bundle 里读出一些界面文案

但都无助于在本机恢复短剧工程。该目录可保留作为存档，不需要进一步分析。

## 六、下一步真正该找的东西

网页正文里列出的、可下载的对象才是正确入口：

| 对象 | 类型 | 价值 |
| --- | --- | --- |
| `LocalMiniDrama-Studio` | 应用/项目 | ★★★ 最可能的真实工程 |
| `短剧工作台-二次开发版-v1.0.zip` | 源码包 | ★★★ 直接可迁入 `src/` |
| `短剧工作台-静态站点包.zip` | 前端产物 | ★★ 可运行的前端 |
| `短剧样片-工作台自产-中国场景锚定-5s.mp4` | 视频产物 | ★ 验收物 |
| `短剧样片-雨夜外卖-5s.mp4` | 视频产物 | ★ 验收物 |

拿不到上述任何一个，就只能停在“项目结构 + 进度基线 + 交付物索引”这一层。
