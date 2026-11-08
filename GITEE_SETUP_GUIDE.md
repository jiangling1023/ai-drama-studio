# Gitee 提交与推送准备指南

> **安全提示：本仓库任何文件都不得提交 API Key / 令牌 / 第三方密钥。提交前请先运行 `bash scripts/check-static.sh`，命中疑似密钥会直接失败。**

本文件只说明流程与权限，**不包含任何真实令牌字符串**；文中一律使用「你的令牌」占位。令牌只允许存放在本地凭据管理器或本地环境变量中，绝不写进仓库文件、提交信息或脚本。

## 一、需要准备的凭据

- Gitee 私人令牌（Personal Access Token），创建路径：Gitee → 头像 → 设置 → 私人令牌 → 生成新令牌。
- 权限范围至少勾选 **`projects`**（仓库读写）；如仅需推送，不需要额外勾选管理类权限。
- 令牌只在生成时显示一次，请立刻保存到本地凭据或密码管理器。

## 二、配置身份（一次性）

```bash
git config --global user.name  "你的名字"
git config --global user.email "你的邮箱"
```

本仓库首次提交由本地临时身份完成（`-c user.name=... -c user.email=...`），不写入全局配置也不影响后续提交。

## 三、添加远程仓库

```bash
cd /workspace/ai-drama-studio
git remote add origin https://gitee.com/jiang-ling1023/ai-drama-studio.git
git remote -v
```

## 四、推送（由主理人执行）

首次推送使用显式 refspec，把本地 `main` 推到远端 `main`：

```bash
git push origin HEAD:main
```

若远端已有历史且允许覆盖，可使用 `git push -f origin HEAD:main`；**仅在确认远端内容可丢弃时使用**，默认不要加 `-f`。

令牌不要写在 URL 里（`https://用户名:令牌@gitee.com/...` 会留在 shell 历史与 `.git/config`）。推荐做法：

1. 交互式输入：push 时按提示输入用户名与令牌（令牌当密码）；
2. 凭据助手：`git config --global credential.helper store|osxkeychain|manager`，首次输入后由系统保管；
3. 环境变量 + 脚本读取：变量名自定义，值不入库，脚本中只用变量引用。

## 五、分支与权限

- 主干分支：`main`。线上站点（Cloudflare Pages）从该分支的 `source/ai-drama-studio/web-app` 目录发布，见 [DEPLOY.md](DEPLOY.md)。
- 若仓库开启分支保护，推送账号需具备该分支的写权限（仓库成员 / 管理员）。
- 多人协作请走 Pull Request，评议通过后再合入 `main`，避免直推覆盖。

## 六、提交前后自检清单

| 检查项 | 命令 | 期望 |
| --- | --- | --- |
| 静态检查（外链 / 密钥 / 裸 onclick / import 后缀 / 语法） | `bash scripts/check-static.sh` | 全部 PASS，退出码 0 |
| 数据契约断言 | `node scripts/check-contract.mjs` | 全部 PASS，退出码 0 |
| 暂存区是否混入敏感文件 | `git status --porcelain` | 无 `.env` / 令牌文件 / `deliverables/*.zip` |
| 提交内容复核 | `git show --stat HEAD` | 只有预期文件 |
| 远程配置是否含令牌 | `git remote -v` | URL 中不含任何令牌 |

## 七、常见问题

| 现象 | 处理 |
| --- | --- |
| `Authentication failed` | 令牌无效或过期；重新生成并确认勾选 `projects` 权限 |
| `remote: Permission denied` | 账号对该仓库无写权限，联系仓库管理员 |
| `non-fast-forward` | 远端有新提交，先 `git pull --rebase origin main` 再推送，不要直接强推 |
| 推送成功但线上没变 | 线上由 Cloudflare Pages 托管。若已绑定 GitHub Git 集成则自动发布（1–2 分钟）；未绑定需手动上传。排查步骤见 [DEPLOY.md](DEPLOY.md) 第三节 |
| 误提交了密钥 | 立即吊销该令牌并重新生成；用新提交移除文件，历史中的旧值视为已泄露 |
