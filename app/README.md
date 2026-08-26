# Memory Recall Mobile · VMK V1 Prototype

这是独立的 React Native / Expo Android 加密验证项目。当前前端只是测试壳，正式界面与交互明确安排在加密协议和真机验证之后重写。

> 开始开发或评估前，请先阅读
> [根目录开发交接文档](../DEVELOPMENT.md)。该文档是跨设备、跨 Agent 交接时的唯一事实来源。

如果不清楚当前 App 做到了哪一步，先看
[功能状态与验收](docs/APP-STATUS-AND-ACCEPTANCE.md)。它把“代码已实现”和“真机已验收”分开记录。

## 当前验证范围

- Android 原生 Argon2id（64 MiB、3 次迭代、并行度 1）。
- AES-256-GCM 文字和真实照片加解密。
- 解开网页端生成的固定 VMK、记忆与照片密文。
- SQLite 只保存密文；照片内容以二进制密文文件保存。
- Android Keystore 保存随机设备钥匙，VMK 不直接写入 SecureStore。
- 密码解锁、指纹解锁、手动锁定和内存钥匙清零。
- 网页/移动端共用的加密 JSON 导入导出。
- 验证界面使用受邀请账号或本地固定令牌，手动上传、下载密文服务中的钥匙信封、MemoryV1 和照片密文。

截至 2026-08-10，兼容性、密码、真实照片、指纹解锁和换机恢复五项 Android
真机测试均已通过；现有自动协议测试为 12/12、TypeScript 检查和 Expo Doctor 20/20 均通过。

验证页选择照片后会通过 Expo SDK 57 `expo-image-manipulator` 生成 `thumbnail`、`preview` 和
`original` 三档，分别加密并保存；Android 与 Web 都拒绝超过 30 MiB 的原始照片，普通查看优先使用
`preview`。同步客户端已经接入 COS 五分钟短期签名直传直下、密文摘要校验和重复上传幂等处理；包含
ImageManipulator 的 APK 已重建并通过模拟器加密/解锁冒烟测试，真实 COS 三档照片仍需真机验收。

`src/sync/` 已接入验证界面。试运行模式使用独立的登录账号与登录密码换取短期访问令牌；本地开发
仍可切换到固定令牌。登录密码和令牌只保存在当前进程内存，HTTP logout 会撤销服务端会话；它们与私密
空间密码、VMK 完全分离。应用不会读取 ThinkPad 数据。运行方法见
[`projects/memorae/server/README.md`](../projects/memorae/server/README.md)。

Android release 仅允许 `127.0.0.1`、`localhost` 和模拟器宿主地址 `10.0.2.2` 使用明文 HTTP；
其他同步地址仍须使用 HTTPS。

## 本地检查

```powershell
npm install
npm run verify
```

## 高德 Native Map 垂直切片

地图架构测试使用 Expo Modules Native View 直接承载高德 Android `MapView`，并通过独立环境变量入口运行，不会替换现有加密/同步验证页。所需 Key、ARM 真机步骤、20/100 点测试矩阵和当前验证状态见
[高德 Native Map 垂直切片](docs/AMAP-VERTICAL-SLICE.md)。坐标来源、境内 GCJ-02/海外 WGS-84 边界及未关闭风险见
[地图坐标工程约定](docs/COORDINATE-CONTRACT.md)。

由于 Argon2id 使用原生模块，不能用 Expo Go。Android 真机需要 development build 或 preview APK。
本地模拟器同样需要 development build；使用 `adb reverse tcp:8788 tcp:8788` 后可访问只监听
电脑本机的密文服务。

## AMap JS API 2.0 WebView 垂直切片

设置 `EXPO_PUBLIC_AMAP_WEBVIEW_SLICE=1` 后，入口会使用独立的 RN + WebView 地图壳。地图 Runtime 的
HTML/JS 随 Mobile bundle 编译进 APK，不再从 `memorae.cn` 动态加载；Runtime 只从高德域名加载 JS API
和地图服务。通过 `EXPO_PUBLIC_AMAP_WEB_KEY`、`EXPO_PUBLIC_AMAP_WEB_SECURITY_CODE` 注入高德 JS API
凭据，凭据不得写入 Git。WebView 只负责地图、Marker/Cluster、点击和 `cameraIdle`；RN 通过 JSON 消息
发送地点数组，拖动期间不发送逐帧消息。

正式 App 解锁后把有效 `MemoryV2.location.lat/lng` 映射为 `{id,lat,lng}`，不把正文、密文、VMK、Token
或照片传入 Runtime；锁定/销毁时发送 `clearSensitiveData`。当前测试壳仍提供 100/1000 点切换，用于
性能基线；真实 Marker → RN 详情和 thumbnail 链路尚未接入。该测试不依赖高德 Android Native MapView。

## Android 包

```powershell
npx eas-cli login
npx eas-cli build --platform android --profile preview
```

`preview` 生成可直接安装的 APK；`production` 用于未来商店 AAB，不是当前目标。
本机 Release 构建通过 `MEMORY_RECALL_ANDROID_KEYSTORE_PATH`、
`MEMORY_RECALL_ANDROID_STORE_PASSWORD`、`MEMORY_RECALL_ANDROID_KEY_ALIAS` 和
`MEMORY_RECALL_ANDROID_KEY_PASSWORD` 显式接入仓库外保存的唯一正式证书；缺少任一变量会主动失败。
不得生成第二套签名，不得把证书、密码或高德 Key 提交到 Git。正式高德 Android Key 必须同时绑定
包名 `com.memorae.cn` 和实际构建证书 SHA-1；垂直切片的 debug/release 指纹见地图测试文档。

完整真机步骤见 [docs/ANDROID-TESTING.md](docs/ANDROID-TESTING.md)。

正式记忆 JSON 字段、校验规则、旧原型迁移和双端兼容夹具见
[MemoryV1 数据契约](../MEMORY-V1.md)。
