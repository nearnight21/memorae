# 高德 Native Map 垂直切片

> 目标：验证 Expo SDK 57 + React Native New Architecture + Expo Modules Native View + 高德 Android Native SDK 是否能支撑所忆主地图。此入口不替换正式 App UI。

## 当前实现

- Expo SDK `57.0.15`、React Native `0.86.2`，New Architecture。
- 本地 Expo Module：`expo-amap-map`。
- 高德组合包：`com.amap.api:3dmap-location-search:10.1.200_loc6.4.9_sea9.7.4`。
- Android 正式包名：`com.memorae.cn`。
- ABI 仅 `armeabi-v7a`、`arm64-v8a`；高德 10.x 不能用 x86 模拟器替代 ARM 真机验收。
- 地图只向 JS 发送 `camera idle` 最终状态，不发送逐帧 Camera 事件。
- Marker、选中态、屏幕网格聚类、聚类点击放大、经纬度/屏幕投影和 Bitmap 缓存均在原生层。
- RN 只承载测试筛选、时间轴、详情卡和测试控制；详情开关不卸载地图。
- 照片选择只生成 256px `thumbnail`。此入口不导入同步下载/解密代码，也不生成或读取 `preview`、`original`。
- 只有用户在测试壳确认隐私提示后才调用高德隐私合规 API 并创建 `MapView`。

## 启动方式

高德 Android Key 不写入仓库。Key 必须绑定正式包名以及当前调试/发布证书 SHA-1。

- 包名：`com.memorae.cn`
- Debug SHA-1：`5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`
- Release SHA-1：`4C:F4:E0:74:E4:BC:79:38:D8:E9:87:B7:01:D8:15:31:C7:1C:74:85`

```powershell
$env:MEMORY_RECALL_AMAP_ANDROID_KEY = '<高德 Android Key>'
$env:EXPO_PUBLIC_AMAP_VERTICAL_SLICE = '1'
npx expo prebuild --platform android --clean
npx expo run:android --device
```

本机 Release 构建必须从仓库外或 Git 忽略目录注入唯一正式签名，缺少任意变量时构建会主动失败：

```powershell
$env:MEMORY_RECALL_ANDROID_KEYSTORE_PATH = '<PKCS#12 绝对路径>'
$env:MEMORY_RECALL_ANDROID_STORE_PASSWORD = '<仅在本机设置>'
$env:MEMORY_RECALL_ANDROID_KEY_ALIAS = 'memory-recall-release'
$env:MEMORY_RECALL_ANDROID_KEY_PASSWORD = '<仅在本机设置>'
```

没有设置 `EXPO_PUBLIC_AMAP_VERTICAL_SLICE=1` 时仍进入现有加密/同步验证 App，不改变既有正式能力。

## 真机验收记录表

每次测试填写设备型号、Android 版本、CPU ABI、构建类型、Key 对应 SHA-1 和提交号。不要把 Key、签名密码或用户照片写进文档。

| 场景 | Development Build | Release Build | 记录 |
| --- | --- | --- | --- |
| 20 Marker 静止/平移/缩放 | 待 ARM 真机 | 待 ARM 真机 | FPS、UI/JS、总内存、图片内存 |
| 100 Marker 静止/平移/缩放 | 待 ARM 真机 | 待 ARM 真机 | 同上；观察漂移与抖动 |
| 聚类展开/收拢 | 待 ARM 真机 | 待 ARM 真机 | 记录资源释放 |
| Marker → RN 详情 → 关闭 | 待 ARM 真机 | 待 ARM 真机 | Camera 必须保持 |
| RN 时间轴横拖/按钮点击 | 待 ARM 真机 | 待 ARM 真机 | 不带动/穿透地图 |
| 前后台、锁屏、销毁重建 | 待 ARM 真机 | 待 ARM 真机 | 记录 heap、decode 计数 |
| 北京 | 待 ARM 真机 | 待 ARM 真机 | 境内落点与反查 |
| 东京/巴黎/纽约城市级 | 待 ARM 真机 | 待 ARM 真机 | 普通 SDK 是否缺图/空白 |
| 海外 `/reverse` | 待云端真实账号 | 待云端真实账号 | 高德 + BigDataCloud 城市结果 |
| 海外 EXIF `/convert-gps` | 待云端真实账号 | 待云端真实账号 | 对照原始 WGS-84 偏差 |

## 诊断口径

测试壳显示：输入/实际 Marker 数、Bitmap 解码次数、Bitmap 缓存估算、Native heap、Runtime used memory、Camera idle 次数，以及每段 Camera 动作的 UI FPS/慢帧数。Android Studio Profiler 和 Perfetto 仍是最终性能证据；壳内数字只用于快速发现持续增长和重复解码。

预期守卫：

- 同一 thumbnail 在前后台恢复后不应再次批量解码。
- 切换 20/100 点时，未再使用的图片描述符应被回收，缓存估算不持续单向增长。
- Camera 移动时 JS 事件不随帧数增长，只在 idle 增加一次。
- 打开/关闭详情时 MapView 实例保持不变。
- 页面销毁时 Marker、BitmapDescriptor 和 MapView 全部释放。

## 当前验证状态（2026-08-21）

### 已通过

- TypeScript 类型检查、Expo Doctor 与 19 项自动测试（含地图入口、Android 布局和 Release 签名插件回归）。
- Expo Android clean prebuild、本地模块自动链接和 `expo-amap-map` Kotlin 编译。
- Development APK 构建：`com.memorae.cn`，仅包含 `arm64-v8a`、`armeabi-v7a`，带 `debuggable`，证书 SHA-1 为
  `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`。
- 正式 Release APK 构建：`com.memorae.cn`，仅包含 `arm64-v8a`、`armeabi-v7a`，未带 `debuggable`。
- Release APK 使用 APK Signature Scheme v2，包内证书 SHA-1 为
  `4C:F4:E0:74:E4:BC:79:38:D8:E9:87:B7:01:D8:15:31:C7:1C:74:85`，已确认不是 debug 证书。
- Release 签名配置 fail-closed：构建 Release 时缺少任一签名环境变量都会失败；debug build type 仍固定使用 debug 证书。
- New Architecture 下 ARM64/ARMv7 的 Expo Modules Core C++、本地 Native View Kotlin、应用 Kotlin、Dex、Lint 与 APK 封装均通过。因此目前没有发现需要直接改写 Fabric + Codegen 的**构建层阻断**。
- ARM64 Android 真机已配置正式高德 Android Key；同意隐私后，北京瓦片、Camera idle、经纬度/屏幕投影、原生 Marker/聚类和前后台恢复正常。
- Fabric 下动态加入的 `MapView` 必须启用 `ExpoView.shouldUseAndroidLayout`；否则子 View 保持 `0×0`，表现为高德 SDK 已加载但地图空白、投影 `(0, 0)` 且没有 loaded/idle 回调。该缺陷已修复并由结构回归测试锁定。
- 用户手动确认 20 点与 100 点两档渲染、聚类与切换结果一致。100 点在北京 zoom 约 9.7 时聚合为 19 个原生 Marker，Camera idle 采样约 120 fps、slow 0；这些数据是单台真机的当前测试值，不代表完整性能基准。
- 东京、巴黎、纽约能够完成 Camera 移动、发送 idle 并渲染聚类 Marker，但普通高德海外矢量底图区域为空白，仅显示高德水印。海外 fallback 风险确认存在，尚未选定方案。

本机生成的忽略产物为 `android/app/build/outputs/apk/release/app-release.apk`（99,718,868 字节）。它只用于本轮构建验收，未上传、未发布；Manifest 中仍是 `AMAP_KEY_NOT_CONFIGURED`，不能用于地图运行验收。

### 尚未验证，不能标记路线通过

- 持续拖动/缩放下 20/100 Marker 的长时间 FPS、UI/JS thread、内存峰值和泄漏趋势。
- 自选真实 thumbnail 的 Bitmap 解码/缓存上限与释放；当前未选择照片，因此 `bitmap decode` 仍为 0。
- RN Overlay 手势、详情开关保持 Camera、锁屏、销毁重建和资源释放的完整矩阵；当前只验证了前后台恢复。
- 东京、巴黎、纽约的海外矢量底图为空白，需要决定并验证海外地图 fallback。
- 真实云端账号的海外 `/v1/location/reverse` 与 `/v1/location/convert-gps`。
- 因此当前可确认 Expo Modules Native View + Fabric 的地图布局、境内瓦片、Marker/聚类与基础生命周期链路可行；尚不能把完整路线标记通过，海外 fallback 仍需决策。

### Windows 构建环境记录

本机 NDK 构建需要可执行 Android SDK/NDK，并需把 `GRADLE_USER_HOME` 放在足够短的路径，避免 Ninja 触发 Windows 260 字符限制。这是本机构建环境约束，不属于地图架构缺陷，临时缓存不提交仓库。

完成本页真机矩阵并满足用户定义的 12 条通过标准后停止；不要从此测试壳继续扩展正式 UI。
