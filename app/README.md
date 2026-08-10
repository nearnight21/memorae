# Memory Recall Mobile · VMK V1 Prototype

这是独立的 React Native / Expo Android 加密验证项目。当前前端只是测试壳，正式界面与交互明确安排在加密协议和真机验证之后重写。

> 开始开发或评估前，请先阅读
> [根目录开发交接文档](../DEVELOPMENT.md)。该文档是跨设备、跨 Agent 交接时的唯一事实来源。

## 当前验证范围

- Android 原生 Argon2id（64 MiB、3 次迭代、并行度 1）。
- AES-256-GCM 文字和真实照片加解密。
- 解开网页端生成的固定 VMK、记忆与照片密文。
- SQLite 只保存密文；照片内容以二进制密文文件保存。
- Android Keystore 保存随机设备钥匙，VMK 不直接写入 SecureStore。
- 密码解锁、指纹解锁、手动锁定和内存钥匙清零。
- 网页/移动端共用的加密 JSON 导入导出。

截至 2026-08-10，兼容性、密码、真实照片、指纹解锁和换机恢复五项 Android
真机测试均已通过；现有自动协议测试为 11/11 通过。

`src/sync/` 已提供连接本地密文测试服务的最小请求客户端，但尚未接入验证界面。它只用于
自动验证 Android 与 Web 可以双向上传、下载并解密，不会读取 ThinkPad 数据，也没有连接任何
正式云服务。运行方法见 [`memory-recall-server/README.md`](../memory-recall-server/README.md)。

## 本地检查

```powershell
npm install
npm run verify
```

由于 Argon2id 使用原生模块，不能用 Expo Go。Android 真机需要 development build 或 preview APK。

## Android 包

```powershell
npx eas-cli login
npx eas-cli build --platform android --profile preview
```

`preview` 生成可直接安装的 APK；`production` 用于未来商店 AAB，不是当前目标。

完整真机步骤见 [docs/ANDROID-TESTING.md](docs/ANDROID-TESTING.md)。

正式记忆 JSON 字段、校验规则、旧原型迁移和双端兼容夹具见
[MemoryV1 数据契约](../MEMORY-V1.md)。
