# Android Native AMap Renderer - Phase 3 验收记录

> 验收日期：2026-09-02
>
> 前期基线：`76b970e`（Native Demo validation）
>
> 分支：`codex/phase-2-native-amap-renderer`

## 结论

**A. Native Renderer 已完成 Android 默认切换和全部正式产品验收，Phase 3 条件已关闭。**

Android 现在默认使用 Native AMap，显式配置 `webview` 时才回滚到 WebView；WebView 不再是
主路径，非 Android 仍使用 WebView。正式 App 入口已用真实解密 Memory 数据验证 Home、Marker、
Detail、创建、LocationPicker、Native clustering，以及查看、编辑、删除和同步闭环。

年份筛选、地区筛选后的 Marker 集合、完整前后台/Activity recreation、锁定后敏感资源清理和
恢复、Native/WebView 同一数据集 parity、完整手势矩阵和长时间性能趋势均已取得通过证据。
WebView key/security code 继续遵守本地忽略配置和密钥边界，不读取、不输出真实 Key。

## Git 状态

当前分支提交为 `a17ef861539997e315b8d7f8906f22f168bbfe4b`，与
`origin/codex/phase-2-native-amap-renderer` 一致。本次只提交文档更新，未执行 reset、
rebase、gc、prune、历史重写或 force push。

## Renderer 切换与 rollback

唯一选择入口为 `app/src/map/mapRendererSelection.ts`。Android 在配置缺失、空值、`native`
或 `native-amap` 时选择 `native-amap`；Android 只有显式配置 `webview` 时才回滚 WebView；
WebView 不再是 Android 主路径，非 Android 始终选择 WebView。默认示例值为：

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
| 地区筛选后的完整 Marker 集合 | PASS | 真机前后状态与 Marker 集合验证通过 |
| 年份筛选与恢复 | PASS | 真机筛选、恢复与 Marker 集合验证通过 |
| Camera preserve | PASS | Detail 关闭后保留已调整 Camera；LocationPicker 复用唯一地图实例 |
| 前台/后台 | PASS | 真机无黑屏，Marker/Camera 保持且监听未重复 |
| Activity recreation | PASS | Native View 和 Camera 生命周期恢复通过 |
| pinch / rotate / tilt | PASS | 正式 Home 完整手势矩阵通过 |

## 锁定、照片缓存与 parity

- 锁定/解锁会清空 session、Memory、thumbnail sources 和 Native thumbnail cache；真机清理、
  恢复和无旧 thumbnail 闪现均通过。
- WebView fallback 代码和 rollback 路径保留；Native/WebView 使用同一真实数据集的 parity
  验证通过，凭据继续只从本地忽略配置或受控 Secret 注入。

## 性能与自动门禁

已有 Native Demo 真机短时基线：聚合展开约 110.8 fps、单点详情约 115.5 fps，slow 0。
正式 Home 的连续拖动/缩放和长时间 heap/native/graphics 趋势验收通过，未发现阻断性性能问题。

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

## Phase 3 结论

Phase 3 / A 验收已完成，无剩余 Phase 3 阻断项。Android Native AMap 是正式主路径，WebView
仅作为显式 rollback fallback；Android 高德 Key 继续只通过本地忽略文件、部署密钥或 CI Secret
注入。
