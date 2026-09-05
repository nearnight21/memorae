# Memorae 仓库工作约束

本仓库只承载 Memorae Web、App、Server、跨端协议和产品专属部署资料，已经脱离旧 Monorepo。

## 工作范围

- 先阅读仓库根目录 `DEVELOPMENT.md`、`TECHNICAL-BASELINE.md`、`docs/SYNC-CRYPTO-FREEZE.md`
  和 `docs/ENVIRONMENT-SECRETS.md`。
- 修改文件前在当前分支运行 `scripts/sync-canonical-worktree.ps1`。脚本在 `main` 上执行安全的
  fast-forward；在功能分支上只更新远端引用并验证当前提交已包含最新 `origin/main`、且未落后
  其上游分支，不切换分支、不改写历史。检查通过后直接留在当前功能分支开发。
- 默认只修改本仓库；不要执行历史过滤、重写历史或在归档仓上开发。
- Web、App、Server 是同一产品的三个独立运行面。业务实现不得跨运行面直接导入源码。
- 每个开发任务开始前，先在进度说明中明确唯一目标运行面：`App`、`Web`、`Server`，或用户明确授权的跨端工作。
- 目标为 `App` 时，改动限于 `app/` 和该任务必需的根目录治理文件，禁止修改 `web/`；目标为 `Web` 时，改动限于 `web/` 和该任务必需的根目录治理文件，禁止修改 `app/`。保留工作区内已有的其他运行面改动，不代改、不清理。
- 跨运行面修改必须在编辑前取得用户明确授权；不得因功能名称相同、需要视觉一致或存在共享协议而自行扩大范围。
- 编辑前后都检查 `git diff --name-only`。若本次改动进入非目标运行面，停止后续工作并只撤回本次越界改动，直到差异范围符合目标运行面。
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
