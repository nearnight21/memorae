# Memorae Mobile Phase 3 交接

> 更新日期：2026-09-02
>
> 当前分支：`codex/phase-2-native-amap-renderer`
>
> 当前提交：`a17ef861539997e315b8d7f8906f22f168bbfe4b`

## 当前结论

Phase 3 已完成 Android Native AMap 默认 Renderer 的主路径切换，并保留 WebView fallback。
当前结论为 **A**：99/99 测试、正式 App 真机验收、Activity recreation、锁定/解锁、
Native/WebView parity 和性能验收均已通过，Phase 3 验收条件全部关闭。

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
- 年份筛选、地区筛选后的 Marker 集合、前后台恢复和 Activity recreation 真机验证通过。
- 锁定/解锁、敏感 Marker/thumbnail 清理与恢复验证通过，无旧 thumbnail 闪现。
- Native/WebView 同一真实数据集 parity 验证通过。
- 正式 Home 连续拖动/缩放与长时间 heap/native/graphics 性能验收通过。
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

## Phase 3 验收结果

以下 Phase 3 验收项均为 **PASS**：

1. 年份筛选、地区筛选后的 Marker 集合、前后台恢复和 Activity recreation。
2. 锁定/解锁、敏感 Marker/thumbnail 清理与恢复、无旧 thumbnail 闪现。
3. Native/WebView 同一真实数据集 parity。
4. 正式 Home 连续拖动/缩放和长时间 heap/native/graphics 性能趋势。

Android 高德 Key 仍只允许从本地忽略文件、部署密钥管理或 CI Secret 注入；这是发布运维规则，
不构成 Phase 3 验收阻断。

## Git 健康

当前分支提交为 `a17ef861539997e315b8d7f8906f22f168bbfe4b`，与
`origin/codex/phase-2-native-amap-renderer` 一致。本次只提交文档更新，不执行 reset、
rebase、gc、prune、历史重写或 force push。

## 接手步骤

1. 保持 Native AMap 为 Android 正式主路径，WebView 仅用于受控回滚。
2. 发布与后续维护继续使用现有密钥、边界和性能门禁，不改变跨端协议。

