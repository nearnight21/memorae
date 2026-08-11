# Memory Recall

地点记忆产品的独立验证项目，只复用原 ThinkPad 仓库中的 `camp-memories` React 应用。

当前阶段验证 VMK V1 的本地体验和独立密文同步服务，不会改写现有线上记忆或照片。项目默认使用不可用的旧后端占位配置，避免误连接 ThinkPad 的 Supabase 和 R2。

## 本地运行

```powershell
npm.cmd install
npm.cmd run dev
```

默认页面是离线 VMK 原型，可以创建私密空间、加入真实文字与照片、锁定解锁，以及导入导出密文包。所有密文保存在浏览器 IndexedDB。

照片会在浏览器内生成 `thumbnail`、`preview` 和 `original` 三档后分别加密；普通展示优先使用
`preview`，原始照片最大 30 MiB。远端下载的加密小图使用 96 MiB 有界 IndexedDB 缓存，锁定时保留，
只有显式“退出并清除下载缓存”才移除；即使服务器离线，本机锁定和缓存清除也会继续执行。手动完整恢复
仍可保存原图。

原 `memories` 界面仍作为后续集成基础，可以通过 `http://127.0.0.1:3000/?legacy=1` 查看；未配置独立测试后端时，登录和上传不会连接线上服务。

`src/sync/` 已接入默认 VMK 验证页面。试运行模式使用独立的登录账号与登录密码换取短期访问令牌；
本地开发仍可切换到固定令牌。登录密码和令牌只保存在页面内存，HTTP logout 会撤销服务端会话；它们与
私密空间密码、VMK 完全分离。自动测试也会让 Android 与 Web 登录并双向上传、下载、解密密文。运行方法见
[`memory-recall-server/README.md`](../memory-recall-server/README.md)。

## 验证

```powershell
npm.cmd run verify
```

验证包括 TypeScript 检查、VMK 自动测试和生产构建。

加密设计和当前边界见 [`docs/VMK-V1-PROTOTYPE.md`](docs/VMK-V1-PROTOTYPE.md)，
项目目标、开发进度、验证结论和下一步任务统一记录在根目录
[`DEVELOPMENT.md`](../DEVELOPMENT.md)。

正式记忆 JSON 字段、校验规则、旧原型迁移和双端兼容夹具见
[MemoryV1 数据契约](../MEMORY-V1.md)。
