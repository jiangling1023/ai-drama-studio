# 短剧工作台 · 一站式 AI 短剧创作

一站式 AI 短剧工作台——从一句话创意到分镜成品的全流程创作台（纯前端零构建，打开即用）。

## 一、在线访问

**https://jiang-ling1023.gitee.io/ai-drama-studio/**

Gitee Pages 部署，push 后需在仓库「服务 → Gitee Pages」手动点「更新」才会重建（免费版不自动重建）。部署细节见 [DEPLOY.md](DEPLOY.md)。

## 二、零密钥体验

不填任何 API Key 也能走通全部 **13 个模块**：仓库内置示例工程与固定演示数据，未配置模型、配置未启用或调用失败时自动降级演示数据，界面在任务卡片、来源标识条与状态栏三处显著标注「演示数据」，流程不中断。

## 三、12 步主链路

| 步骤 | 模块 | 模块ID | 产出 |
| --- | --- | --- | --- |
| 1 | 剧本 | F-001 | 剧本原文 + 诊断结论（旁白占比 / 台词覆盖率 / 动作描述密度） |
| 2 | 拆分 | F-002 | 集（episodes）+ 场次（scenes） |
| 3 | 资产 | F-003 | 人物 / 场景 / 道具（assets） |
| 4 | 锚点 | F-004 | 人物外观锚点（ANC-*）与锁定状态 |
| 5 | 分镜脚本 | F-005 | 分镜（shots）六要素校验 |
| 6 | 图片 | F-006 | 资产参考图 |
| 7 | 关键帧 | F-007 | 首帧 / 尾帧（keyFrames） |
| 8 | 提示词 | F-008 | 全局正向 / 负面词 + 锁定快照（NEG-*） |
| 9 | 画布 | F-009 | 画布节点（canvasNodes，CNV-* 三指令） |
| 10 | 分镜成品 | F-010 | 成品条目（storyboardItems） |
| 11 | 视频整合 | F-011 | 片段清单 + 导出配置 + 顺序预览（VID-* 边界） |
| 12 | 导演复核 | F-012 | 导演规划书 / 任务清单 / 复核报告 |

另有横切入口「短剧规则库」（F-013）：18 条内置规则 + 5 套模板 + 24 个构图预设，可从任一步骤直接进入，不占主链路步骤号。

## 四、AI 短剧导演（F-012 四段）

- **规划（Plan）**：由一句话创意生成导演规划书，7 项字段齐全（创意文本、目标集数、目标单集时长、角色表、视觉基调、表演密度目标、规划依据）。
- **执行（Execute）**：拆成 11 条模块任务清单，每条状态按真实工程数据重算，缺失前置即回落「未开始 / 受阻」并给出原因。
- **复核（Review）**：15 项检查 = 7 项基础检查（锚点携带完整性、锁定负面词出现率、旁白占比、台词覆盖率、表演密度、场次可执行性、缺失帧与缺失资产）+ R-01~R-08 规则库注入检查；总判定 通过 / 不通过，不通过只给结论与建议，不阻断任何模块与导出。
- **提示词架构（Prompt Architect）**：镜头时间轴 23 维度（景别 / 机位 / 焦段 / 构图 / 景深 / 运镜 / 速度 / 光线 / 色温 / 材质 / 节奏 / 转场 / 特效 / 环境声 / 衔接标注等）→ 适配目标视频模型的成品提示词，并叠加 6 类防漂移一致性约束（人物变脸 / 服装脱落 / 肢体错位 / 背景闪烁 / 动作断裂 / 物理关系失真）。

## 五、模型配置

- 三组来源：**agnes-ai 文本**、**agnes-ai 媒体**、**自定义**（Base URL + API Key + 用途 = 文本 / 媒体 / 视频）。
- 密钥只写入浏览器本地密钥通道（localStorage `ai-drama:secrets:v1`），界面永不回显；导出工程与工程包在序列化阶段剥离 `API Key` / `Authorization` 字段，导出前再做一次「无密钥」校验。
- 未配置、未启用、强制演示或调用失败（401 / 429 / 5xx / 超时 / 网络中断 / 响应非法）时自动降级演示数据并标注九类降级原因之一。

## 六、交付边界

本工作台只做结构化编排，视频整合产出片段清单 / 导出配置 / 顺序预览 / 结构化文件，**不生成 mp4 / webm 视频文件**。导出物可被第三方剪辑工具读取，不含 API Key。

## 七、目录结构

```
ai-drama-studio/
├── README.md / DEPLOY.md / GITEE_SETUP_GUIDE.md
├── docs/                     功能说明、验收报告（可判定清单）
├── scripts/                  check-static.sh（静态检查）、check-contract.mjs（契约断言）
└── source/ai-drama-studio/web-app/
    ├── index.html            唯一入口（零外链、零 CDN、零字体、零图标库）
    ├── css/style.css         design token + 组件样式（单一变量文件）
    └── js/
        ├── app.js            装配：唯一 Project 引用、ctx、首屏示例工程装载
        ├── schema.js         数据契约唯一真源（createEmptyProject / migrate / validate）
        ├── constants.js      枚举、诊断口径、W-* 文案（唯一来源）
        ├── storage.js        本地存储与密钥剥离、双槽备份
        ├── store.js          commit / 防抖落盘
        ├── io.js             导入导出与无密钥校验
        ├── shell/            top-bar / step-nav / status-area / model-drawer / workspace
        ├── core/             derive、diagnosis、gen-task、model-adapter、prompt-builder、canvas-command、video-assembly、director、rules-library
        ├── components/       C-01~C-19 组件（全应用唯一 import 来源）
        ├── demo/             示例工程与固定演示数据（零随机 / 零时间 / 零网络）
        └── pages/            p001~p013 页面 + 13 项懒加载注册表
```

## 八、本地预览

```bash
cd source/ai-drama-studio/web-app
python3 -m http.server 8080
# 打开 http://127.0.0.1:8080/
```

ES module 需经 HTTP 访问（不能用 `file://` 直接打开）。本地预览仅用于开发自查，线上统一走 Gitee Pages。

## 九、数据与隐私

工程数据只存于当前浏览器的 localStorage（主槽 + 备份槽 + 密钥槽 + UI 态），不上传任何服务器；清浏览器数据即清空。对外请求只有一处出口：用户显式配置并启用模型后的模型调用，强制演示数据开关打开时零外部请求。

## 十、自检

```bash
bash scripts/check-static.sh     # 外链 / 密钥 / 裸 onclick / import 后缀 / 语法
node scripts/check-contract.mjs  # 数据契约与核心函数断言
```

两项必须全 PASS 才可提交。详细功能见 [docs/功能说明-短剧工作台.md](docs/功能说明-短剧工作台.md)，逐条可判定断言见 [docs/验收报告-可判定清单.md](docs/验收报告-可判定清单.md)。
