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
- 海外底图缺少城市细节时，技术原型使用独立城市标签层和构建时裁剪的 GeoNames `cities15000` 数据：排除中国大陆，保留人口不少于 10 万的聚居地和首都；相机停稳后按视野、缩放阈值和屏幕碰撞过滤渲染。该链路已在真机证明可行，但当前英文气泡样式和世界级全局显示策略未通过产品验收，不能作为正式 fallback 交付。
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

无需 Metro 的真机验收包使用 `standalone` 构建类型。它内嵌地图入口 JS、沿用 debug 签名以便覆盖本机开发安装，不清除测试数据；正式 `release` 的签名约束不变：

```powershell
$env:ANDROID_HOME = '<Android SDK 绝对路径>'
$env:EXPO_PUBLIC_AMAP_VERTICAL_SLICE = '1'
cd .\android
.\gradlew.bat app:assembleStandalone -PreactNativeArchitectures=arm64-v8a
```

输出为 `android/app/build/outputs/apk/standalone/app-standalone.apk`。安装后直接打开应用即可，不需要 Metro、8082 或 `adb reverse`。

如需更新海外城市数据，在联网环境执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\prepare-overseas-city-data.ps1
```

脚本下载 GeoNames 官方 `cities15000.zip`，运行时不会联网；生成数据须保留文件顶部的 GeoNames CC BY 4.0 attribution。当前筛选结果约 5,642 个海外城市，生成 TypeScript 文件约 330 KB。

本机 Release 构建必须从仓库外或 Git 忽略目录注入唯一正式签名，缺少任意变量时构建会主动失败：

```powershell
$env:MEMORY_RECALL_ANDROID_KEYSTORE_PATH = '<PKCS#12 绝对路径>'
$env:MEMORY_RECALL_ANDROID_STORE_PASSWORD = '<仅在本机设置>'
$env:MEMORY_RECALL_ANDROID_KEY_ALIAS = 'memory-recall-release'
$env:MEMORY_RECALL_ANDROID_KEY_PASSWORD = '<仅在本机设置>'
```

没有设置 `EXPO_PUBLIC_AMAP_VERTICAL_SLICE=1` 时仍进入现有加密/同步验证 App，不改变既有正式能力。

### RN WebView + AMap JS API 2.0

新的隔离入口使用 `EXPO_PUBLIC_AMAP_WEBVIEW_SLICE=1`。它加载 Web 端专用
`?amap-runtime=1` 页面，而不是整个 `memorae.cn` 产品页。RN → WebView 仅发送 `setMarkers` / `setSelected`；
WebView → RN 仅发送 `ready`、`markerPressed`、`mapPressed`、`cameraIdle` 和 `error`。没有 `move`/逐帧桥接。
当前壳生成 100 或 1000 个跨北京、东京、巴黎、纽约的确定性测试点，使用高德 JS API 2.0 MarkerCluster 插件。
它是 Prototype，尚未接入正式 MemoryV2 解密会话；高德 JS API 在原生 WebView 内的授权/商业条款仍需单独确认。

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

## 海外城市标签产品约束（首轮已实现，待真机验收）

GeoNames 标签层已从全局英文气泡原型收敛为显式场景开启的中文纯文字层：

1. 面向中文界面的海外城市统一显示中文译名；GeoNames 原始英文名只作为数据匹配和缺失回退字段，不直接作为默认展示名。
2. 城市名是底图语义，不是业务对象；使用无边框、无底色、不可点击的纯文字标签，不使用 Marker 气泡外观，也不参与记忆聚类或抢占记忆 Marker 点击。
3. 世界/国家层级不铺开普通城市。标签随 zoom 分级出现：低 zoom 至多保留必要的国家级锚点或完全隐藏，进入区域/城市层级后再按首都、人口与上下文逐级增加。
4. 普通浏览时不持续开启全局海外城市层。主要触发场景是点击海外记忆后 Camera 下钻到其所在城市，以及新建/编辑海外地点时进入地点选择上下文；离开上下文或回到国家层级后清除普通城市标签。
5. 标签候选必须以当前目标城市或当前视野为中心做密度控制和屏幕避让；不为证明数据存在而填满屏幕。切换境内/海外和开关标签时不得重建 `MapView`。

中文译名使用以 GeoNames id 为键的受控离线映射，不在运行时调用在线翻译。5,642 条 GeoNames 原始数据全部进入候选数据集；已有受控中文译名的城市显示中文，未覆盖城市暂显示 GeoNames 原名，后续可独立扩充中文译名而不改变筛选链路。城市标签在 `zoom >= 8` 的海外目标上下文中开始显示，较原先提前两个地图层级；普通世界视图没有目标上下文时仍为空，北京等境内目标同样清空标签。海外记忆和地点选取分别使用更克制与更完整的阈值，并按目标距离、视野、首都和人口排序；JS 候选和原生绘制都限制在 120 个以内，屏幕碰撞继续生效，不会全量铺屏。测试壳中点击海外记忆 Marker 或海外照片聚类会下钻并自动开启记忆上下文，点击东京/巴黎/纽约入口会自动开启地点选取上下文，切换城市或关闭详情会清除相应标签且不重建 `MapView`。

## 当前验证状态（2026-08-21）

### 已通过

- TypeScript 类型检查与 24 项自动测试已通过；Expo Doctor 和 Android Kotlin 编译结果以本次交接最新记录为准。
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
- 无需 Metro 的 standalone APK 已构建并覆盖安装，关闭 Metro/8082 后可独立启动地图测试入口，不再依赖开发服务器。
- GeoNames 标签层已在 ARM64 真机实际渲染：世界级 `zoom 3.5` 时显示 35 个城市标签、4 个原生 Marker，Camera idle 与约 116 fps 均正常。该结果证明渲染链路可用，同时暴露英文气泡、国家级标签过密和底图遮挡问题，因此产品验收未通过，后续按本页“海外城市标签产品约束”重做。

本机生成的忽略产物为 `android/app/build/outputs/apk/release/app-release.apk`（99,718,868 字节）。它只用于本轮构建验收，未上传、未发布；Manifest 中仍是 `AMAP_KEY_NOT_CONFIGURED`，不能用于地图运行验收。

### 尚未验证，不能标记路线通过

- 持续拖动/缩放下 20/100 Marker 的长时间 FPS、UI/JS thread、内存峰值和泄漏趋势。
- 自选真实 thumbnail 的 Bitmap 解码/缓存上限与释放；当前未选择照片，因此 `bitmap decode` 仍为 0。
- RN Overlay 手势、详情开关保持 Camera、锁屏、销毁重建和资源释放的完整矩阵；当前只验证了前后台恢复。
- 海外城市标签的中文译名、透明纯文字 Bitmap、语义场景开关和 zoom/目标距离分级密度已经实现；仍需在 standalone APK 上重新验证东京、巴黎、纽约及真实海外记忆的点击穿透、中文字体、视觉密度与性能。
- 真实云端账号的海外 `/v1/location/reverse` 与 `/v1/location/convert-gps`。
- 因此当前可确认 Expo Modules Native View + Fabric 的地图布局、境内瓦片、Marker/聚类、基础生命周期和离线城市标签渲染链路可行；尚不能把完整路线标记通过，海外城市标签仍需按已确认的产品规则重做并实机验收。

### Windows 构建环境记录

本机 NDK 构建需要可执行 Android SDK/NDK，并需把 `GRADLE_USER_HOME` 放在足够短的路径，避免 Ninja 触发 Windows 260 字符限制。这是本机构建环境约束，不属于地图架构缺陷，临时缓存不提交仓库。

完成本页真机矩阵并满足用户定义的 12 条通过标准后停止；不要从此测试壳继续扩展正式 UI。
