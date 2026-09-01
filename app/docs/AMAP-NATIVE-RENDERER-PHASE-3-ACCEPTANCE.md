# Android Native AMap Renderer - Phase 3 验收记录

> 验收日期：2026-09-01
>
> 基线：`76b970e`（Phase 2 Demo validation）
>
> 分支：`codex/phase-2-native-amap-renderer`

## 结论

**B. Native Renderer 已完成 Android 默认切换代码和主要正式产品回归，但本阶段不能宣称
所有正式切换条件已关闭。**

Android 现在默认使用 Native AMap，显式配置 `webview` 时保留 WebView rollback，非 Android
仍使用 WebView。正式 App 入口已用真实解密 Memory 数据验证 Home、Marker、Detail、创建、
LocationPicker 和 Native clustering。用户已在真机完成新建记忆的查看、编辑和删除闭环，结果
记为通过。

以下项目因真机 ADB 会话在本轮后段断开，或当前正式 Home 没有可操作的锁定入口，仍未取得
足够证据：年份筛选实际 Marker 集合变化、完整前后台/Activity recreation、锁定后敏感资源
清理和恢复、Native/WebView 同一数据集 parity、长时间性能趋势。WebView parity 还缺少本地
WebView key/security code 配置；不读取、不输出真实 Key。

## Git 缺失对象调查

`git fsck --full` 结果：

- 缺失对象类型：commit `ad065ea8b5c0c18797ce76c5c305f71673fdefaf`
- 引用关系：`4216d277d151a8122cef8f1ef2d73e063caec05c` 将其作为父提交
- 当前分支 checkout、TypeScript、测试和 Android 构建均可用；提交对象本身可继续创建
- `origin/codex/phase-2-native-amap-renderer` 仍指向 `4216d27`，两次 `git fetch origin` 均因
  GitHub TLS/SSL 失败，未恢复该对象
- 未执行 reset、rebase、gc、prune、历史重写或 push

## Renderer 切换与 rollback

唯一选择入口为 `app/src/map/mapRendererSelection.ts`。Android 在配置缺失、空值、`native`
或 `native-amap` 时选择 `native-amap`；Android 显式配置 `webview` 时回滚 WebView；非 Android
始终选择 WebView。默认示例值为：

```text
EXPO_PUBLIC_MEMORAE_MAP_RENDERER=native
```

业务层继续只依赖 `MemoraeMap`，公开 Props、Camera、Marker、Cluster 接口未改动。
`WebViewMemoraeMapAdapter`、`AmapJsWebViewMap` 和 WebView runtime 均保留。

## 正式产品链路

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 正式 App 入口启动并进入 Home | PASS | Redmi `25060RK16C` 真机 |
| Native Map 初始化 | PASS | Home 显示“原生地图已就绪” |
| 真实解密数据 | PASS | 本机解密 31 条，29 条有效坐标，地图 DTO 29 个 |
| 无坐标 Memory 不生成 Marker | PASS | 代码边界测试 + 真实 DTO 计数 |
| thumbnail 与 Native clustering | PASS | 真实缩略图显示，Native 节点正常聚类 |
| 不同 Marker 打开不同 Detail | PASS | 两个真实 Marker 已逐个打开 |
| Detail 照片与关闭返回 | PASS | 照片显示，地图和 Camera 保持 |
| Create -> 加密保存 -> Home Marker | PASS | 同步 1 条记忆密文、3 份照片密文 |
| Edit location / Delete | PASS | 用户在真机完成本轮闭环并确认结果 |
| LocationPicker | PASS | 正式 Create/Edit 入口，Native 地图、拖动、确认、返回更新地点 |

## 筛选、Camera 与生命周期

| 项目 | 结果 | 备注 |
| --- | --- | --- |
| 地区菜单 | PASS | 已显示 18 个真实地区选项；选项结构和计数来自真实数据 |
| 地区筛选后的完整 Marker 集合 | 未完成 | ADB 会话断开前未取得稳定前后截图证据 |
| 年份筛选与恢复 | 未完成 | 需要重新连接真机后操作时间轴并记录 Marker 集合 |
| Camera preserve | PASS | Detail 关闭后保留已调整 Camera；LocationPicker 复用唯一地图实例 |
| 前台/后台 | 未完成 | 需要在线真机复验无黑屏、Marker/Camera 保持和监听不重复 |
| Activity recreation | 未完成 | 需要在线真机复验 Native View 和 Camera 生命周期 |
| pinch / rotate / tilt | 未完成 | 本阶段未取得正式 Home 的完整手势证据 |

## 锁定、照片缓存与 parity

- 锁定实现会清空 session、Memory、thumbnail sources 和 Native thumbnail cache；自动测试覆盖
  加密、锁定和重新解锁闭环。
- 正式 Home 当前没有可操作的锁定按钮，因此本阶段没有真实“地图 -> 锁定 -> 解锁”证据；不
  把静态实现当作真机 PASS。
- WebView fallback 代码和 rollback 路径保留，但本机忽略环境文件没有 WebView key/security
  code，无法在本轮启动同一真实数据集做 parity；不索要、不读取、不记录 Key。

## 性能与自动门禁

已有 Native Demo 真机短时基线：聚合展开约 110.8 fps、单点详情约 115.5 fps，slow 0。
正式 Home 的连续拖动/缩放和长时间 heap/native/graphics 趋势未测量，不据此推断无内存增长。

| 检查 | 结果 |
| --- | --- |
| App TypeScript | PASS |
| App tests | PASS（99/99） |
| Expo Doctor | PASS（21/21） |
| Android Native compile/unit test/assembleDebug | PASS（既有本阶段构建记录） |
| fresh Expo prebuild | PASS（既有本阶段构建记录） |
| Runtime boundary / protected config / credential scan | PASS |
| `git diff --check` | PASS |
| Debug APK 安装 | PASS（保留应用数据） |

## 发布前剩余问题

1. 重新连接 Redmi 真机，完成年份筛选、地区筛选结果、前后台、Activity recreation 和完整
   Camera/手势矩阵。
2. 提供产品可操作的锁定入口后，完成真实锁定/解锁及 thumbnail 清除/恢复证据；这不是本轮
   新增地图能力。
3. 在不暴露凭据的前提下配置 WebView fallback 所需本地变量，完成同一真实数据集 parity。
4. 发布前轮换 Android 高德 Key，并继续只通过本地忽略文件、部署机密或 CI Secret 注入。
