# Memorae 开发交接

> 最后更新：2026-09-05
>
> 当前阶段：Android 默认使用 WebView + 高德 JS API 2.0，并加载高德自定义样式 ID；Native AMap Renderer 保留为显式配置路径。

## 当前状态

- 规范分支：`main`；`origin` 为 `https://github.com/nearnight21/memorae.git`。
- 源码与 Git 历史拆分已完成，独立仓及产品专属归档 Tag 已推送到新的 GitHub 远端。
- 独立交付基线已完成：三端环境契约、单仓 CI、运行面边界检查和 fresh-clone 验收均已通过。
- 环境变量清单见 `docs/ENVIRONMENT-SECRETS.md`；边界与 fresh-clone 检查由 `.github/workflows/ci.yml`、
  `scripts/check-runtime-boundaries.ps1` 和 `scripts/verify-fresh-clone.ps1` 维护。
- Memorae 保持现有 Web、App、Server 部署体系，不引入 ThinkPad/Camp 的 Vercel 或 Worker 配置。
- Mobile 的 Home、LocationPicker 和业务编排只依赖中立 `MemoraeMap`；WebView/高德专有 DTO
  已收口到 Renderer adapter。Android 缺省使用 Local Expo Module + Kotlin `TextureMapView`
  的 Native AMap Renderer 作为显式配置路径；默认使用 WebView + 高德 JS API 2.0，加载自定义样式 ID。
  Native Phase 3 / A 验收见
  `app/docs/AMAP-NATIVE-RENDERER-PHASE-3-ACCEPTANCE.md`。
- Home 默认地图 Camera 使用中国全景视图 `zoom=3.5`；正式时间轴继续使用单一 Pan 手势，
  横向浏览年份、上拉新建记忆、下拉回到全景，并通过 `homeCameraTarget` 重置 Camera，
  不改变年份、地区筛选或 Marker 数据。下拉动作的 60dp 激活阈值与 0.24 最大遮罩透明度
  已有自动化测试覆盖，Android 真机连续手势验收仍需另行执行。
- App 首页右上角提供 `•••` 更多入口，包含设置、帮助和关于。设置支持在地图上保存本机默认
  Camera、恢复中国全景默认视图；时间轴下拉复位使用该默认 Camera。帮助可重播首次启动引导，
  不会清除账号、记忆或其他设置；关于显示原生版本/构建号，支持 GitHub Release 检查更新和
  项目主页入口。相关偏好仅保存在设备 SecureStore，未改变加密、Memory schema 或同步协议。

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
2. `app/src/map/MemoraeMap.tsx` 是 Home 与 LocationPicker 的唯一地图组件入口；Android
   默认选择 `WebViewMemoraeMapAdapter`，显式 `native` 或 `native-amap` 才选择
   `AndroidNativeMemoraeMapAdapter`；非 Android 继续使用 WebView。
3. `memoryMapAdapter` 输出 `MemoryMapMarker`。缩略图公开为 `uri + cacheKey`，解密图片只在
   当前进程的可清理内存缓存中保留；WebView 所需 Data URI 只存在于 Renderer 私有兼容层。
4. Camera idle 使用中立 Camera/Bounds，Native 与 WebView Adapter 均通过坐标 `1e-6`、
   zoom `1e-3` 的 epsilon 判断阻断 RN Camera 回写形成的重复移动命令。
5. 当前产品没有消费者的 imperative map commands、selected marker、map ready/error 和屏幕投影
   未进入 Phase 1 接口；现有聚类、地区筛选、中心点选址和暂停 Marker 更新行为继续保留。

Phase 3 已完成 Android Native AMap Renderer 的能力、兼容性和性能验收；2026-09-04 根据
产品决定，Android 默认切回 WebView + 高德 JS API 2.0，并加载在线自定义样式 ID。
Native AMap 保留为显式配置路径，并已适配同一在线自定义样式 ID。
`TextureMapView` 生命周期、Native saved state、Marker diff、Native 聚类、Camera epsilon 和
短生命周期 thumbnail 文件边界均已通过验收，没有扩张 Phase 1 公开接口。99/99 测试、Expo
Doctor 21/21、Native 编译与 Debug APK、真机正式 Home/Create/Edit/Delete/LocationPicker、
年份与地区筛选、Activity recreation、前后台恢复、锁定/解锁与敏感资源清理、Native/WebView
parity，以及连续操作和长时间性能验收均通过。iOS 仍只冻结同一 TypeScript 业务接口，
本阶段没有 Swift/Objective-C 地图实现。
