# AI 短剧工作台 1.2.7 · 发布说明（Release Notes）

- 版本号：1.2.7
- 发布日期：2026-11-08
- 对客产品名：AI 短剧工作台
- 代码签名状态：self-signed，验签 通过，时间戳 http://timestamp.digicert.com

## 附件清单

| 文件 | 字节数 | SHA256 |
| --- | --- | --- |
| AI-Drama-Studio-1.2.7-Setup-x64.exe | 113571912 | 7e952c3a812d0c0b5875157814005d73a1c2ed086c1bc95196f09bafb33abe80 |
| AI-Drama-Studio-1.2.7-Portable-x64.exe | 113343680 | 30628aa2863edd400622e5f8e51c3af21187fb00e4d687716261de4b9a33f42c |
| AI-Drama-Studio-1.2.7-linux-x86_64.deb | 165013858 | 763545951888c180a66f659c886b079954f6a015a661409c809ab6ad903b796c |
| AI-Drama-Studio-1.2.7-linux-x86_64.AppImage | 250215695 | 92572dc0ba8b363f83612d4e2ddd548fc2ca1834e89f64c65c194338e2bc2e8c |
| AI-Drama-Studio-1.2.7-SHA256SUMS.txt | 422 | 8dd879cf9ae018ca4594aa7494a8cf044f825f904ec484685fea41434e020577 |
| AI-Drama-Studio-1.2.7-RELEASE.md | （发布清单） | — |
| manifest.json | （唯一权威下载信息） | — |

## 安全提示

已使用自签名证书签名，仅用于内测 / 内部分发。Windows 可能提示『未知发布者』或由 SmartScreen 拦截，属自签名证书预期行为，并不代表文件存在问题；请先按 SHA256 校验值核对文件。正式对外发布需更换 OV 代码签名证书后重新签名。

**同名文件已重新签名、SHA256 已变化，请重新下载并重新校验；旧链接 / 旧缓存不得复用。**

## 上传与外链替换（维护者，团队不代做）

1. 在 Gitee / GitHub Release 或自建对象存储 / Nginx 创建 Release 并上传本清单全部附件；
2. 113 MB 级附件不得 push 到 Gitee / GitHub 仓库或 Pages（≈100 MB）与 CF Pages（≈25 MB）；
3. 按 49 号 §6.2 的四行 jq 改 artifacts[i].url、置 linkSource=release、重刷两份派生副本；
4. 页面代码零改动，两处入口 no-store 重载即生效；随后由用户自行 push 站点。

## 已知限制

- 仅 Windows x64 与 deepin / UOS（x86_64 / amd64）；不含 arm64 / loongarch64 / macOS；
- 真机安装与 SmartScreen 表现由用户验证；不承诺消除任何安全软件误报；
- 页脚保留「基于 LocalMiniDrama 二次开发 · MIT License」标注。

