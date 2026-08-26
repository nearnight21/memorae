# Memorae 产品边界

本目录承载 Memorae Web、App、Server 及其产品专属部署资料。

## 工作范围

- 默认只修改本目录。
- Web、App、Server 是同一产品的三个独立运行面。业务实现不得跨运行面直接导入源码。
- 第一阶段保留既有跨端加密/同步兼容性测试；它们不是可供业务代码复用的 interface。
- 加密、Memory schema、同步、照片和坐标规则继续遵守仓库根目录 `docs/SYNC-CRYPTO-FREEZE.md` 与 `TECHNICAL-BASELINE.md`。第一期目录整理不得改变这些规则。
- App 的包名、签名、Keystore、EAS 配置和现有 Android 工程保持不变。
- 路径移动只修复 import、测试夹具、构建、部署、CI 和文档路径；保持生产 URL、API、数据库和密文行为不变。

## 完成标准

- Web、App、Server 分别运行各自 `npm run verify`。
- App 移动后额外确认 Expo Doctor 通过，现有 `app.json` 与 `eas.json` 内容未变化。
- 运行仓库根目录 `node scripts/check-product-boundaries.mjs`。
