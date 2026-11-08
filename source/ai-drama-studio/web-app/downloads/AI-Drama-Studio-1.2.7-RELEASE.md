# AI 短剧工作台 1.2.7 · 发布清单（RELEASE.md）

- 版本号：1.2.7
- 对客产品名：AI 短剧工作台
- 发布日期：2026-11-08
- 系统要求：Windows 10 1809 及以上 / Windows 11，64 位；deepin / 统信 UOS（x86_64 / amd64）
- 最小可用磁盘空间：1024 MB
- 代码签名：self-signed / 验签状态 通过
- 签名者：CN=AI Drama Studio (Self-Signed Code Signing),O=AI Drama Studio Internal,C=CN
- 证书 SHA256 指纹：ed8f2289fa9f433e72423ac3b928a1cc03ab58c6ab47c2d9d3e6966297c55c70
- 签名时间 / RFC3161 时间戳：2026-11-08T11:18:07Z / http://timestamp.digicert.com
- 链接来源：repo
- 签名提示：已使用自签名证书签名，仅用于内测 / 内部分发。Windows 可能提示『未知发布者』或由 SmartScreen 拦截，属自签名证书预期行为，并不代表文件存在问题；请先按 SHA256 校验值核对文件。正式对外发布需更换 OV 代码签名证书后重新签名。

## 产物与校验值（与目录一一对应）

| 文件 | 字节数 | SHA256 |
| --- | --- | --- |
| AI-Drama-Studio-1.2.7-Setup-x64.exe | 113571912 | 7e952c3a812d0c0b5875157814005d73a1c2ed086c1bc95196f09bafb33abe80 |
| AI-Drama-Studio-1.2.7-Portable-x64.exe | 113343680 | 30628aa2863edd400622e5f8e51c3af21187fb00e4d687716261de4b9a33f42c |
| AI-Drama-Studio-1.2.7-linux-x86_64.deb | 165013858 | 763545951888c180a66f659c886b079954f6a015a661409c809ab6ad903b796c |
| AI-Drama-Studio-1.2.7-linux-x86_64.AppImage | 250215695 | 92572dc0ba8b363f83612d4e2ddd548fc2ca1834e89f64c65c194338e2bc2e8c |
| AI-Drama-Studio-1.2.7-SHA256SUMS.txt | 422 | 8dd879cf9ae018ca4594aa7494a8cf044f825f904ec484685fea41434e020577 |
| manifest.json | 4837 | e8485eea16c68c07500e7482ae4cdce6fb2b7232170886f4f847044afa9e531f |
| AI-Drama-Studio-1.2.7-RELEASE-NOTES.md | （发布说明） | — |
| AI-Drama-Studio-1.2.7-BUILD.log / -linux-BUILD.log | （构建留痕） | — |

## SHA256 校验方法

```
sha256sum -c AI-Drama-Studio-1.2.7-SHA256SUMS.txt
certutil -hashfile <文件名> SHA256   （Windows）
在文件所在目录执行 certutil -hashfile <文件名> SHA256（Windows）或 sha256sum -c AI-Drama-Studio-1.2.7-SHA256SUMS.txt（deepin / UOS），与下方 64 位值逐字比对；不一致即文件不完整，请勿运行
```

## SHA256SUMS.txt 原始内容

```
7e952c3a812d0c0b5875157814005d73a1c2ed086c1bc95196f09bafb33abe80  AI-Drama-Studio-1.2.7-Setup-x64.exe
30628aa2863edd400622e5f8e51c3af21187fb00e4d687716261de4b9a33f42c  AI-Drama-Studio-1.2.7-Portable-x64.exe
763545951888c180a66f659c886b079954f6a015a661409c809ab6ad903b796c  AI-Drama-Studio-1.2.7-linux-x86_64.deb
92572dc0ba8b363f83612d4e2ddd548fc2ca1834e89f64c65c194338e2bc2e8c  AI-Drama-Studio-1.2.7-linux-x86_64.AppImage
```

## 已知限制

- 同名文件已重新签名、SHA256 已变化，请重新下载并重新校验（EX-24）
- 自签名证书不在 Windows 信任链，仍可能提示未知发布者；正式对外需 OV 证书重签
- 仅支持 Windows x64 与 deepin / UOS x86_64；不含 arm64 / loongarch64 / macOS
- 真机安装验证由用户在 Windows / deepin / UOS 完成

