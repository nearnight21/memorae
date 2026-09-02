# Memorae Mobile Phase 4：Android Native AMap 加载性能

状态：A（性能可接受，停止专项优化）

基线：`c565a1a`（Phase 3 / A）
范围：Android 默认 Renderer 为 Native AMap；WebView 继续仅作 fallback。本阶段未改地图架构、`MemoraeMap` 接口、Renderer 选择或配置。

## 测量方法

- 真机：Redmi 25060RK16C，Android API 36，Debug Development Build。
- 使用现有 Native AMap 垂直切片；初始 Camera 固定为北京，使测试 Marker 处于可视区域。
- 记录 Kotlin 单调时钟：`TextureMapView` 创建、`onCreate`、AMap 可用、`OnMapLoaded`、首个可见帧、首个 Native Marker 渲染。
- 垂直切片的隐私确认由测试页显式触发；该人为等待不计入地图加载时间。生产 Home 的同意状态由既有开发环境控制，本阶段未修改配置。

## 冷启动（0 Marker，强制停止后 3 次）

| 轮次 | TextureMapView onCreate | AMap 可用 | 在线底图 OnMapLoaded | 首个可见帧 |
| --- | ---: | ---: | ---: | ---: |
| 1 | 21ms | 23ms | 204ms | 218ms |
| 2 | 16ms | 18ms | 155ms | 173ms |
| 3 | 22ms | 24ms | 219ms | 237ms |

Native Map View 在 RN 根视图之后约 0.1–0.2 秒创建；从开始创建地图计，稳定的冷启动首帧为约 0.17–0.24 秒。主要时间落在 `AMap 可用 → OnMapLoaded`（约 0.14–0.20 秒）；TextureMapView 与 Kotlin bridge 仅约 0.02 秒。

## Marker 对照

下表在相同真机、相同初始 Camera、已经启动的同一测试会话中，对每个数量重新创建测试地图。20/100 的“Marker 完成”是底图首帧后 Native 渲染完成的时间；源 Marker 数保持为 20/100，初始聚类节点数分别为 7/26。

| Marker | 在线底图 | 首个可见帧 | Marker 完成 |
| --- | ---: | ---: | ---: |
| 0 | 219ms | 227ms | — |
| 20（3 次均值） | 214ms | 224ms | 243ms |
| 100（3 次均值） | 216ms | 226ms | 251ms |

0 与 100 Marker 的底图时间相差约 3ms，属于正常波动。100 Marker 只使 Marker 完成比 20 Marker 晚约 8ms、比首帧晚约 25ms；不是首次在线底图慢的主因。因此未执行 thumbnail A/B，也未引入图片缓存或线程改造。

## 生命周期与 Camera

- 进入地图、打开详情、关闭详情：同一 Native Map 实例继续使用；详情关闭后 Camera 保持原视野，未出现新的 TextureMapView 创建或 destroy。
- 三轮前后台返回均记录 `creates=1, destroys=0`，只触发 `onHostPause/onHostResume`，不重建地图。
- 产品 Home 将 `HOME_CHINA_CAMERA` 作为 `initialCamera`，初始 `camera` 为 `null`；真机日志只出现一次 `initial_camera_move`，未出现 `requested_camera_move`。不存在先以默认 Camera 加载、再移动到最终 Camera 的双请求。

## 本阶段变更与结论

仅新增可审计的性能诊断（创建/销毁计数、地图阶段耗时、前后台日志）以及测试页的 0 Marker / 重测入口；未进行性能行为优化。

Before / After：没有证据指向可安全优化的问题，因此保持原实现；真机首帧仍为约 0.17–0.24 秒，功能与生命周期行为不变。

结论：Native AMap 的在线底图阶段是地图自身最大的单段耗时，但当前数值可接受；Marker、thumbnail、RN/Kotlin bridge、重复 MapView 和初始 Camera 均不是瓶颈。停止 Phase 4 专项优化。
