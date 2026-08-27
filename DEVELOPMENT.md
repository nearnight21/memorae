# Memorae 开发交接

> 最后更新：2026-08-27
>
> 当前阶段：Phase 5「新仓可开发化」。Memorae Product Reset 和常规文档治理继续暂停，
> 直到 ThinkPad、Camp Memories、Memorae 三仓均能独立同步、构建和交接。

## 当前状态

- 规范分支：`main`；`origin` 为 `https://github.com/nearnight21/memorae.git`。
- 源码与 Git 历史拆分已完成，独立仓及产品专属归档 Tag 已推送到新的 GitHub 远端。
- 本阶段已建立仓库治理文件、环境变量清单、根忽略规则和同步脚本。
- 独立 CI 与运行面边界检查尚未完成，按 Phase 5 后续步骤处理。
- Memorae 保持现有 Web、App、Server 部署体系，不引入 ThinkPad/Camp 的 Vercel 或 Worker 配置。

## 必须保持

- Web、App、Server 是同一产品的三个运行面，业务实现不得跨目录直接导入源码。
- 既有跨端兼容性测试可以读取对端实现和夹具；此例外不得扩展到业务代码。
- 密文协议、Memory schema、同步、照片、坐标和生产数据边界以 `MEMORY-V1.md`、
  `TECHNICAL-BASELINE.md` 与 `docs/SYNC-CRYPTO-FREEZE.md` 为准。
- App Android 包名 `com.memorae.cn`、唯一正式签名、EAS 配置和现有 Android 工程语义不变。
- 不得把账号密码、私密空间密码、VMK、token、数据库连接串、COS 密钥、签名材料或高德 Key 写入 Git。

## 本地开发与验证

```powershell
npm.cmd ci --prefix web
npm.cmd ci --prefix app
npm.cmd ci --prefix server
npm.cmd run verify --prefix web
npm.cmd run verify --prefix app
npm.cmd run verify --prefix server
git diff --check
```

Server PostgreSQL 集成测试需要独立测试库，并通过 `MEMORY_RECALL_TEST_DATABASE_URL` 注入。
测试会使用随机 schema；禁止指向生产数据库。

## 跨电脑同步

工作区干净时运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sync-canonical-worktree.ps1
```

脚本只允许 `main` 快进到 `origin/main`；本地领先或分叉时停止，
不执行 stash、reset、rebase、cherry-pick 或 push。

## 环境与交接规则

环境变量清单见 [`docs/ENVIRONMENT-SECRETS.md`](docs/ENVIRONMENT-SECRETS.md)。真实值只能来自
本机忽略文件、部署机密钥管理、EAS Secret 或 CI Secret。跨电脑交接只记录变量是否配置、
来源类别和验证结果，不记录真实值或可恢复的凭据片段。

## Phase 5 后续

1. 建立单仓 CI 与 Web/App/Server 运行面边界检查。
2. 核对现有 Memorae Compose/Caddy/EAS 配置在独立路径下可运行。
3. 完成三端独立安装、验证和生产构建检查。
