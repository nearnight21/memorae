# Memorae Mobile Phase 3 交接

> 更新日期：2026-09-01
>
> 当前分支：`codex/phase-2-native-amap-renderer`
>
> 当前提交：`81718cf4e935bd9aee2494d7c27b908c28a04962`

## 当前结论

Phase 3 已完成 Android Native AMap 默认 Renderer 的代码切换，并保留 WebView fallback。
当前结论为 **B**：核心正式产品链路已验证，但尚未关闭全部发布前真机证据项，不应据此宣称
Native 已无条件正式发布。

## 已完成

- `app/src/map/mapRendererSelection.ts`：Android 缺省选择 `native-amap`；显式 `webview`
  可快速回滚；非 Android 保持 WebView。
- `app/.env.example`：默认示例值为
  `EXPO_PUBLIC_MEMORAE_MAP_RENDERER=native`。
- WebView adapter、AMap JS runtime 和公开地图接口均保留，业务层仍只依赖 `MemoraeMap`。
- 正式 App Home 真机验证：真实解密 Memory、坐标 Marker、thumbnail、Native clustering、
  多 Marker Detail、Detail 返回 Camera 保持。
- 正式 Create 和 LocationPicker 真机验证通过。
- 用户已确认新建记忆的查看、编辑和删除闭环通过；新建数据已加密保存并同步。
- 验收详情见 `app/docs/AMAP-NATIVE-RENDERER-PHASE-3-ACCEPTANCE.md`。

## 自动验证

以下命令在本机通过：

```powershell
. D:\DevTools\Use-DevEnvironment.ps1
npm.cmd run verify --prefix app
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-runtime-boundaries.ps1
git diff --check
```

结果：TypeScript PASS；App tests 99/99；Expo Doctor 21/21；runtime boundary PASS；credential
scan PASS；`git diff --check` PASS。Android Native compile、unit test、assembleDebug、fresh
Expo prebuild 和 Debug APK 安装已在本阶段完成并记录。

## 尚未关闭的验收项

1. 重新连接 Redmi `25060RK16C`，完成年份筛选、地区筛选后的 Marker 集合、前后台和 Activity
   recreation 的真机证据。
2. 正式 Home 当前没有可操作锁定入口；补齐产品入口后再验收锁定时敏感 Marker/thumbnail
   清除、解锁恢复和无旧 thumbnail 闪现。
3. 在本地忽略配置中补齐 WebView fallback 所需变量后，用同一真实数据集完成 Native/WebView
   parity。不要把任何真实 Key 写入源码、Git、Metro 日志或交接文档。
4. 发布前轮换 Android 高德 Key；继续只从本地忽略文件、部署密钥管理或 CI Secret 注入。
5. 补充正式 Home 连续拖动/缩放和长时间 heap/native/graphics 趋势；现有 110.8/115.5 fps
   数据仅是短时 Demo 基线。

## Git 健康

`git fsck --full` 仍报告缺失 commit `ad065ea8b5c0c18797ce76c5c305f71673fdefaf`，它是
`4216d27` 的父提交。`git fetch origin` 因 GitHub TLS/SSL 失败未恢复对象。不要执行 reset、
rebase、gc、prune、历史重写或 force push；本阶段只提交当前分支的新 commit。

## 接手步骤

1. 确认设备重新出现在 `adb devices`，不要清除应用数据。
2. 从正式 App 入口继续真机验收，并把结果追加到 Phase 3 acceptance 文档。
3. 只在门禁和真机证据完整后，再评估是否把结论从 B 改为 A。

