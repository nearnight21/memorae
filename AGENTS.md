# Memorae 仓库工作约束

本仓库只承载 Memorae Web、App、Server、跨端协议和产品专属部署资料，已经脱离旧 Monorepo。

## 工作范围

- 先阅读仓库根目录 `DEVELOPMENT.md`、`TECHNICAL-BASELINE.md`、`docs/SYNC-CRYPTO-FREEZE.md`
  和 `docs/ENVIRONMENT-SECRETS.md`。
- 修改文件前按 `DEVELOPMENT.md` 记录的当前分支运行 `scripts/sync-canonical-worktree.ps1`，
  确认工作区干净且与 `origin` 同步。
- 默认只修改本仓库；不要执行历史过滤、重写历史或在归档仓上开发。
- Web、App、Server 是同一产品的三个独立运行面。业务实现不得跨运行面直接导入源码。
- 第一阶段保留既有跨端加密/同步兼容性测试；它们不是可供业务代码复用的 interface。
- 加密、Memory schema、同步、照片和坐标规则继续遵守仓库根目录 `docs/SYNC-CRYPTO-FREEZE.md` 与 `TECHNICAL-BASELINE.md`。新仓可开发化不得改变这些规则。
- App 的包名、签名、Keystore、EAS 配置和现有 Android 工程保持不变。
- 路径、部署和治理调整只修复 import、测试夹具、构建、部署、CI 和文档路径；保持生产 URL、API、数据库和密文行为不变。
- 三仓已完成独立同步、构建和交接基线；后续工作进入 Memorae Product Reset，常规文档治理随产品工作按需进行。

## 完成标准

- Web、App、Server 分别运行各自 `npm run verify`。
- App 移动后额外确认 Expo Doctor 通过，现有 `app.json` 与 `eas.json` 内容未变化。
- 运行 `git diff --check`，并在 CI 与边界脚本落地后运行仓库根目录的运行面边界检查。
- 环境变量只从本地忽略文件、部署机密钥管理或 CI Secret 注入，绝不提交真实值。
