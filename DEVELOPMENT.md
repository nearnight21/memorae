# Memorae 开发交接

> 最后更新：2026-09-01
>
> 当前阶段：Memorae Mobile 跨平台迁移 Phase 2。Android Native Renderer 已实现并保留 WebView 回滚，正式默认切换仍待真机在线地图与隐私状态验收。

## 当前状态

- 规范分支：`main`；`origin` 为 `https://github.com/nearnight21/memorae.git`。
- 源码与 Git 历史拆分已完成，独立仓及产品专属归档 Tag 已推送到新的 GitHub 远端。
- 独立交付基线已完成：三端环境契约、单仓 CI、运行面边界检查和 fresh-clone 验收均已通过。
- 环境变量清单见 `docs/ENVIRONMENT-SECRETS.md`；边界与 fresh-clone 检查由 `.github/workflows/ci.yml`、
  `scripts/check-runtime-boundaries.ps1` 和 `scripts/verify-fresh-clone.ps1` 维护。
- Memorae 保持现有 Web、App、Server 部署体系，不引入 ThinkPad/Camp 的 Vercel 或 Worker 配置。
- Mobile 的 Home、LocationPicker 和业务编排只依赖中立 `MemoraeMap`；WebView/高德专有 DTO
  已收口到 Renderer adapter。Android 新增 Local Expo Module + Kotlin `TextureMapView` 路径，
  但默认仍使用 WebView；Phase 2 状态见 `app/docs/AMAP-NATIVE-RENDERER-PHASE-2.md`。

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

## 独立交付基线（已完成）

1. Web、App、Server 的 `verify` 门禁在单仓 CI 中分别执行。
2. `scripts/verify-fresh-clone.ps1` 检查新 clone 的模板、部署配置和仓外凭据边界。
3. 正式 Android 凭据继续只从 `D:\hermes\secure\memorae\` 或受控 EAS credential store 注入，
   不进入仓库、普通 CI job 或 fresh clone。
4. Product Reset 已恢复；后续按 `PRODUCT-BASELINE`、V1 当前状态、Android 全链验收、
   历史冲突、导出/恢复、发布准备和 Polish 顺序推进。

## Mobile 跨平台地图边界

Phase 1 已完成以下边界收口：

1. `app/src/map/MemoraeMap.types.ts` 定义中立 Coordinate、Camera、Bounds、Marker 和事件类型；
   不包含 WebView、Android Bundle、AMap SDK 对象、Memory 正文、密文、VMK 或 token。
2. `app/src/map/MemoraeMap.tsx` 是 Home 与 LocationPicker 的唯一地图组件入口；当前只选择
   `WebViewMemoraeMapAdapter`，现有 AMap JS Runtime、地图样式和交互没有重写。
3. `memoryMapAdapter` 输出 `MemoryMapMarker`。缩略图公开为 `uri + cacheKey`，解密图片只在
   当前进程的可清理内存缓存中保留；WebView 所需 Data URI 只存在于 Renderer 私有兼容层。
4. Camera idle 使用中立 Camera/Bounds，WebView Adapter 通过坐标 `1e-6`、zoom `1e-3` 的
   epsilon 判断阻断 RN Camera 回写形成的重复移动命令。
5. 当前产品没有消费者的 imperative map commands、selected marker、map ready/error 和屏幕投影
   未进入 Phase 1 接口；现有聚类、地区筛选、中心点选址和暂停 Marker 更新行为继续保留。

Phase 2 已在 `MemoraeMap` 内部加入显式 Android Native renderer 开关，并补齐 `TextureMapView`
生命周期、Native saved state、Marker diff、Native 聚类、Camera epsilon 和短生命周期 thumbnail 文件边界；
没有扩张 Phase 1 公开接口。正式切换前仍须注入与 `com.memorae.cn`/当前签名匹配的高德 Native Key，
完成本次新路径真机矩阵，并接入真实运行时隐私同意状态。iOS 仍只冻结同一 TypeScript 业务接口，
本阶段没有 Swift/Objective-C 地图实现。
