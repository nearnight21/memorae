# Android Native AMap Renderer · Phase 2

> 基线：`ad065ea`
>
> 分支：`codex/phase-2-native-amap-renderer`
>
> 状态：实现与本地构建已完成；正式切换仍被真机在线地图验收和产品隐私同意状态阻断。

## 架构边界

```text
Home / LocationPicker / memoryMapAdapter
                  ↓
             MemoraeMap
             ├─ WebViewMemoraeMapAdapter（默认、回滚）
             └─ AndroidNativeMemoraeMapAdapter
                          ↓
                   Local Expo Module
                          ↓
                  ExpoView + TextureMapView
                          ↓
                  官方高德 Android SDK
```

Native adapter 只消费 Phase 1 的 `Coordinate`、`CameraState`、`MapBounds`、
`MemoryMapMarker` 和现有事件。公开接口没有加入 `AMap`、`LatLng`、`Marker`、
`Bundle`、Android View、完整 Memory、正文、密文、VMK 或 token。

## 生命周期与状态恢复

`ExpoAmapMapView` 使用 `NOT_CREATED → CREATED → RESUMED → PAUSED → DESTROYED`
状态机。View attach 只允许初始化，不调用 `onResume`；View detach 不调用
`onPause` 或 `onDestroy`。Activity foreground/background 是 resume/pause 的唯一权威，
Activity/View 真正销毁才释放地图。

初始化前通过 host 的 `SavedStateRegistryOwner` 消费专用 Bundle，并把它传给
`TextureMapView.onCreate(restoredBundle)`。注册的 provider 在 host 保存状态时调用
`TextureMapView.onSaveInstanceState(bundle)`。Native Bundle 是一级恢复，RN Camera 只在
没有 Native 恢复状态时作为二级初始值。

## Privacy 与凭据边界

`privacyConsentGranted=false` 时不创建 `TextureMapView`，也不调用高德初始化 API。
同意后严格执行：

```text
updatePrivacyShow
→ updatePrivacyAgree
→ loadWorldVectorMap
→ TextureMapView.onCreate
```

正式 App 当前没有可供 `MemoraeMap` 消费的运行时隐私同意状态，因此 Native renderer
仍为显式开发开关且默认关闭。Native Key 继续只由
`MEMORY_RECALL_AMAP_ANDROID_KEY` 在 prebuild 时通过 Config Plugin 写入 Manifest；源码、
测试、日志和本文都不包含真实值。

## Marker、缩略图与聚类

- RN Marker 只下发 `id`、坐标、必要的地区聚类标签和短生命周期 thumbnail 标识。
- Native 以稳定 ID 保存输入，以稳定 node key 对 AMap Marker 做 add/remove/position/icon
  就地更新，不执行全量 `map.clear()` 重建。
- 暂停更新期间保留当前 Marker，只覆盖 pending 最新值；恢复时只应用一次最新状态。
- RN 私有层把内存中的 thumbnail 解码为 app cache 下的短生命周期、不透明文件名；传给
  Kotlin 的只有 `file://` URI 和 `cacheKey`，没有 Data URI 或完整原图。
- Kotlin 只接受 canonical path 位于 `context.cacheDir` 内的文件。不存在、越界、损坏或
  decode 失败统一降级为安全占位 Marker，日志只记录失败类别。
- BitmapDescriptor 按 `cacheKey + URI + selected` 复用；源 URI 改变时回收旧版本，Marker
  删除、锁定卸载或 View 销毁时清理缓存。
- 聚类继续由 Kotlin 按屏幕网格计算；RN 只接收中立的 `markerIds/count/coordinate/label`。

## Camera 与事件

RN 请求 Camera 前，adapter 和 Kotlin 都以坐标 `1e-6`、zoom `1e-3` 比较 requested 与
actual Camera。用户手势进行到 camera idle 前不会被 RN Camera prop 抢回；实现没有 debounce、
timeout 或 `ignoreNextEvent`。内部诊断分别累计 user gesture 与 programmatic camera idle，
公开事件仍保持 Phase 1 的 `CameraState + MapBounds`。

`onMapReady` 对应高德 `OnMapLoadedListener`，不是 TextureMapView 对象创建。当前 Phase 1
公开契约没有 map ready、load error 或 map press，因此这些只保留在 Native Module 的内部诊断
入口，没有扩张业务接口。

## Renderer 开关

```dotenv
EXPO_PUBLIC_MEMORAE_MAP_RENDERER=native-amap
EXPO_PUBLIC_MEMORAE_NATIVE_AMAP_PRIVACY_CONSENT=1
```

只有 Android 且第一个值显式为 `native-amap` 才选择 Native；其他平台、缺值或其他值都回退
WebView。第二个值目前只用于已完成隐私确认的受控开发构建，不能代替未来产品运行时隐私状态。

## 行为对照

| 当前产品行为 | WebView | Native 实现 | 本次 Native 真机 |
| --- | --- | --- | --- |
| Marker press | 已用 | 已映射 `markerId` | Key 阻断 |
| Cluster | 已用 | Kotlin grid cluster | Key 阻断 |
| Camera idle / bounds | 已用 | 已映射并双层 epsilon | Key 阻断 |
| LocationPicker Camera | 已用 | 复用同一中立接口 | Key 阻断 |
| pause marker updates | 已用 | latest-pending gate | Key 阻断 |
| thumbnail fallback | 已用 | cache-only file + 占位图 | Key 阻断 |
| 前后台 | 已用 | Activity 权威状态机 | Key 阻断 |
| Saved state | WebView/RN Camera | Native Bundle 优先 | Key 阻断 |

## 验证记录

- 基线：TypeScript 通过；App tests `89/89`；Expo Doctor `21/21`。
- 当前：TypeScript 通过；App tests `99/99`。
- Kotlin：`NativeMapModelsTest` `4/4`；`:expo-amap-map:compileDebugKotlin` 通过。
- `npx expo prebuild --platform android --clean --no-install` 通过。
- `:app:assembleDebug` 通过，APK 可安装。
- 设备：Redmi `25060RK16C`，Android 16 / API 36；APK 覆盖安装和 RN Native
  测试入口启动成功。
- 本机 `MEMORY_RECALL_AMAP_ANDROID_KEY` 未配置，生成 Manifest 按设计使用
  `AMAP_KEY_NOT_CONFIGURED` 占位符。测试入口正确返回中立错误 `AMAP_KEY_MISSING`，没有
  初始化 SDK 或尝试绕过凭据边界。

由于正式包 `com.memorae.cn` 的 Native Key 在本机不可用，本次不能诚实完成瓦片、手势、
Marker/Cluster、详情返回、Activity recreation、锁定清理和真实性能矩阵。Prototype 的 Key
绑定 `com.memorae.prototype`，不得用于本包；也没有修改 package、签名或硬编码 Key。

实现已埋点 `mapViewCreateMs`、`mapReadyMs`、首个 loaded 后 View frame、
`firstMarkerRenderMs`、Camera 段 UI FPS 与 slow frame。缺少在线地图的本次运行数据不填零、
不引用旧 Module 数据冒充。

## Phase 2 判断

**B. Native Renderer 尚未达到正式切换条件。**

阻断项：

1. 需要从受控本地/EAS 环境注入与 `com.memorae.cn`、当前签名匹配的 Native Key，完成本页
   真机矩阵和性能采样。
2. 正式产品需要提供真实、可撤销的运行时隐私同意状态；开发环境变量不能成为永久方案。
3. 在上述验收完成前，WebView 必须保持默认 renderer 和低成本回滚路径。
