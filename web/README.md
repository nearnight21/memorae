# Memory Recall

地点记忆产品的独立验证项目，只复用原 ThinkPad 仓库中的 `camp-memories` React 应用。

当前阶段验证 VMK V1 的完整本地体验，不连接新的国内服务器，也不会改写现有线上记忆或照片。项目默认使用不可用的后端占位配置，避免误连接 ThinkPad 的 Supabase 和 R2。

## 本地运行

```powershell
npm.cmd install
npm.cmd run dev
```

默认页面是离线 VMK 原型，可以创建私密空间、加入真实文字与照片、锁定解锁，以及导入导出密文包。所有密文保存在浏览器 IndexedDB。

原 `memories` 界面仍作为后续集成基础，可以通过 `http://127.0.0.1:3000/?legacy=1` 查看；未配置独立测试后端时，登录和上传不会连接线上服务。

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
