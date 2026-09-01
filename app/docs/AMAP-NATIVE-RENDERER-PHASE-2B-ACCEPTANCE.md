# Android Native AMap Renderer · Phase 2B 验收记录

> 验收日期：2026-09-01
>
> 基线：`4216d27`
>
> 分支：`codex/phase-2-native-amap-renderer`

## 结论

**B. Native Renderer 尚未达到 Android 正式默认切换条件。**

**Demo 垂直切片已经在 Redmi `25060RK16C` 真机跑通。** 高德在线底图、20/100 点切换、
原生聚类展开、单点点击和 RN 详情均取得真机证据。正式隐私同意接入按产品指令冻结，
不作为本轮 Demo 的阻断，也不据此宣称正式默认切换完成。WebView 仍是默认 renderer；
没有删除 fallback、切换默认值或 push。

## 阻断

1. App 没有正式运行时隐私同意状态。仓库中唯一相关状态是
   `MapVerticalSliceApp` 的临时 React state；正式 Native adapter 读取
   `EXPO_PUBLIC_MEMORAE_NATIVE_AMAP_PRIVACY_CONSENT` 构建期变量。该变量不是可撤销、可持久化
   的产品 consent source of truth，无法证明清数据、同意、重启和撤回语义。
2. 敏感资源生命周期、完整手势矩阵和长时间运行趋势仍未完成真机验收；不能用静态测试或
   Kotlin 单测替代这些证据。

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
| Formal privacy consent source | FROZEN | 正式 App 无 canonical runtime consent state；本轮不扩展 |

## 真机验收矩阵

以下 `FAIL（未验证）` 表示本轮没有足够真机证据，不表示已观察到对应运行时缺陷。

| 项目 | 结果 | 证据/备注 |
| --- | --- | --- |
| privacy consent 正式接入 | FROZEN | 按产品指令冻结；Demo 使用现有本地确认页 |
| 未 consent 不初始化地图 | PASS | 静态边界测试 85；Native 初始化顺序受保护 |
| 在线底图 | PASS | 真机加载高德卫星底图；SDK 10.1.200 / TextureMapView ready |
| 20/100 点切换 | PASS | 100 个输入点在 zoom 10.0 聚合为 31 个可见原生节点 |
| Marker click | PASS | 单点点击打开 RN 详情 `map-slice-100-37` |
| Cluster click | PASS | 点击 10 点聚合，相机由 zoom 10.0 展开到 12.2 |
| Detail 返回 Camera 保持 | PASS | 关闭详情后保持 zoom 12.2，地图 Native View 未重建 |
| pinch zoom | FAIL（未验证） | 缺少在线地图真机证据 |
| rotation | FAIL（未验证） | 缺少在线地图真机证据 |
| tilt | FAIL（未验证） | 缺少在线地图真机证据 |
| Activity recreation | FAIL（未验证） | 缺少在线地图真机证据 |
| sensitive marker cleanup | FAIL（未验证） | 静态清理实现存在，未验证真实锁定和 Native 引用 |
| bitmap cache cleanup | FAIL（未验证） | 静态清理实现存在，未验证真实 Bitmap/Descriptor 生命周期 |
| foreground/background | FAIL（未验证） | 缺少在线地图真机证据 |
| 短时交互稳定性 | PASS | 聚合展开后 UI 110.8 fps、slow 0；单点详情时 UI 115.5 fps、slow 0 |
| 长时间交互稳定性 | FAIL（未验证） | 未取得长时间 FPS/heap/native/graphics 趋势 |
| 明显持续内存增长 | 未测量 | 不能据自动测试推断 YES 或 NO |

## 下一步前置条件

Demo 阶段到此收口。正式切换恢复后，再由产品/隐私路径提供真实、可撤销且重启可恢复的
consent source of truth，并执行清数据、同意、锁定/解锁、Activity recreation、前后台、
完整手势和长时间运行矩阵；在全部硬阻断关闭前保持本文件结论为 B。
