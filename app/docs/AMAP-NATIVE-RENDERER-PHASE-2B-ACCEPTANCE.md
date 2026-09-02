# Android Native AMap Renderer · Phase 3 / A 补充验收记录

> 验收日期：2026-09-02
>
> 基线：`a17ef86`
>
> 分支：`codex/phase-2-native-amap-renderer`

## 结论

**A. Native Renderer 已达到 Android 正式默认切换条件。**

**正式产品链路已经在 Redmi `25060RK16C` 真机跑通。** 高德在线底图、20/100 点切换、
原生聚类展开、单点点击、RN 详情、筛选、Activity recreation、前后台、锁定/解锁、
Native/WebView parity 和性能矩阵均取得通过证据。Android 默认 renderer 是 Native AMap；
WebView 只保留为显式 fallback。

## 验收结果

隐私同意、敏感资源生命周期、完整手势矩阵、Activity recreation、前后台恢复和长时间运行
趋势均已完成真机验收并通过；Native Key 继续遵守受控注入边界。

## 自动验证

| 检查 | 结果 | 证据/备注 |
| --- | --- | --- |
| App TypeScript | PASS | `npm.cmd run verify --prefix app` |
| App tests | PASS | 99/99 |
| Expo Doctor | PASS | 21/21 |
| Native Kotlin compile | PASS | `:expo-amap-map:compileDebugKotlin` |
| Native unit tests | PASS | `:expo-amap-map:testDebugUnitTest` |
| Android Debug APK | PASS | `:app:assembleDebug`；applicationId `com.memorae.cn` |
| Runtime boundary check | PASS | `scripts/check-runtime-boundaries.ps1` |
| Credential file scan | PASS | 无 tracked `.env`/keystore/certificate 文件 |
| `git diff --check` | PASS | 本轮提交前通过 |
| Native key injection | PASS | 本地忽略文件注入；Manifest 已验证为非占位值，未记录真实 Key |
| Debug APK 安装 | PASS | `adb install -r` 成功，保留应用数据 |
| Formal privacy consent source | PASS | 正式 App runtime consent source 已接入并完成真机验收 |

## 真机验收矩阵

以下验收项均已取得真机通过证据；本文件当前结论以 Phase 3 / A 为准。

| 项目 | 结果 | 证据/备注 |
| --- | --- | --- |
| privacy consent 正式接入 | PASS | 正式 App runtime consent source 已接入，清数据、同意、撤回和重启恢复通过 |
| 未 consent 不初始化地图 | PASS | 静态边界测试 85；Native 初始化顺序受保护 |
| 在线底图 | PASS | 真机加载高德卫星底图；SDK 10.1.200 / TextureMapView ready |
| 20/100 点切换 | PASS | 100 个输入点在 zoom 10.0 聚合为 31 个可见原生节点 |
| Marker click | PASS | 单点点击打开 RN 详情 `map-slice-100-37` |
| Cluster click | PASS | 点击 10 点聚合，相机由 zoom 10.0 展开到 12.2 |
| Detail 返回 Camera 保持 | PASS | 关闭详情后保持 zoom 12.2，地图 Native View 未重建 |
| pinch zoom | PASS | 正式 Home 真机手势矩阵通过 |
| rotation | PASS | 正式 Home 真机手势矩阵通过 |
| tilt | PASS | 正式 Home 真机手势矩阵通过 |
| Activity recreation | PASS | Native View 与 Camera 生命周期恢复通过 |
| sensitive marker cleanup | PASS | 锁定后敏感 Marker 清理和解锁恢复通过 |
| bitmap cache cleanup | PASS | 锁定、前后台与销毁重建资源释放通过 |
| foreground/background | PASS | 前后台切换无黑屏，Marker/Camera 保持通过 |
| 短时交互稳定性 | PASS | 聚合展开后 UI 110.8 fps、slow 0；单点详情时 UI 115.5 fps、slow 0 |
| 长时间交互稳定性 | PASS | 正式 Home 长时间 FPS/heap/native/graphics 趋势通过 |
| 明显持续内存增长 | PASS | 长时间真机验收未发现阻断性持续增长 |

## Phase 3 结论

Phase 3 / A 验收已完成，无剩余 Phase 3 阻断项。Android Native AMap 是正式主路径，WebView
仅作为显式 rollback fallback；Android 高德 Key 继续只通过本地忽略文件、部署密钥或 CI Secret
注入。
