# Android Native AMap Renderer · Phase 2B 验收记录

> 验收日期：2026-09-01
>
> 基线：`4216d27`
>
> 分支：`codex/phase-2-native-amap-renderer`

## 结论

**B. Native Renderer 尚未达到 Android 正式默认切换条件。**

本轮完成了本地自动验证和 Native 构建，但没有把缺失的正式隐私同意源或高德 Native Key
伪造成已完成。WebView 仍是默认 renderer；没有删除 fallback、切换默认值或 push。

## 阻断

1. App 没有正式运行时隐私同意状态。仓库中唯一相关状态是
   `MapVerticalSliceApp` 的临时 React state；正式 Native adapter 读取
   `EXPO_PUBLIC_MEMORAE_NATIVE_AMAP_PRIVACY_CONSENT` 构建期变量。该变量不是可撤销、可持久化
   的产品 consent source of truth，无法证明清数据、同意、重启和撤回语义。
2. 当前进程没有 `MEMORY_RECALL_AMAP_ANDROID_KEY`。Debug APK 的 Manifest 使用
   `AMAP_KEY_NOT_CONFIGURED` 占位符，因此不能进行在线瓦片、Marker/Cluster、手势、生命周期
   或真实性能验收。连接的 ADB 设备不能弥补凭据缺失。
3. 上述两项使真机矩阵、敏感资源生命周期和长时间运行趋势均保持未验证；不能用静态测试或
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
| Native key injection | FAIL | Manifest 为 `AMAP_KEY_NOT_CONFIGURED` |
| Formal privacy consent source | FAIL | 正式 App 无 canonical runtime consent state |

## 真机验收矩阵

以下 `FAIL（未验证）` 表示本轮没有足够真机证据，不表示已观察到对应运行时缺陷。

| 项目 | 结果 | 证据/备注 |
| --- | --- | --- |
| privacy consent 正式接入 | FAIL | 仍依赖构建期开发开关 |
| 未 consent 不初始化地图 | PASS | 静态边界测试 85；Native 初始化顺序受保护 |
| Marker click | FAIL（未验证） | 缺少正式 Key/在线地图 |
| Cluster click | FAIL（未验证） | 缺少正式 Key/在线地图 |
| Detail 返回 Camera 保持 | FAIL（未验证） | 缺少产品链路真机证据 |
| pinch zoom | FAIL（未验证） | 缺少在线地图真机证据 |
| rotation | FAIL（未验证） | 缺少在线地图真机证据 |
| tilt | FAIL（未验证） | 缺少在线地图真机证据 |
| Activity recreation | FAIL（未验证） | 缺少在线地图真机证据 |
| sensitive marker cleanup | FAIL（未验证） | 静态清理实现存在，未验证真实锁定和 Native 引用 |
| bitmap cache cleanup | FAIL（未验证） | 静态清理实现存在，未验证真实 Bitmap/Descriptor 生命周期 |
| foreground/background | FAIL（未验证） | 缺少在线地图真机证据 |
| 长时间交互稳定性 | FAIL（未验证） | 未取得可复核的 FPS/heap/native/graphics 趋势 |
| 明显持续内存增长 | 未测量 | 不能据自动测试推断 YES 或 NO |

## 下一步前置条件

需要先由产品/隐私路径提供真实、可撤销且重启可恢复的 consent source of truth，并由受控
本地或 EAS 环境注入与 `com.memorae.cn` 及正式签名匹配的 Native Key。完成后重新执行清数据、
同意、锁定/解锁、Activity recreation、前后台、手势、Marker/Cluster/Detail 和长时间运行
矩阵；在全部硬阻断关闭前保持本文件结论为 B。
