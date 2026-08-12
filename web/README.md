# Memory Recall

地点记忆产品的独立验证项目，只复用原 ThinkPad 仓库中的 `camp-memories` React 应用。

当前阶段验证 VMK V1 的本地体验和独立密文同步服务，不会改写现有线上记忆或照片。项目默认使用不可用的旧后端占位配置，避免误连接 ThinkPad 的 Supabase 和 R2。

## 本地运行

```powershell
npm.cmd install
npm.cmd run dev
```

默认页面是“所忆”正式 Web 前端，可以创建私密空间、加入真实文字与照片、锁定解锁，并在软木板、
时间线与足迹地图中阅读。所有数据先加密后保存在浏览器 IndexedDB。

照片会在浏览器内生成 `thumbnail`、`preview` 和 `original` 三档后分别加密；普通展示优先使用
`preview`，原始照片最大 30 MiB。远端下载的加密小图使用 96 MiB 有界 IndexedDB 缓存，锁定时保留，
只有显式“退出并清除下载缓存”才移除；即使服务器离线，本机锁定和缓存清除也会继续执行。手动完整恢复
仍可保存原图。

未配置 `VITE_MEMORY_RECALL_API_URL` 时，正式前端保持纯离线模式。部署构建配置该地址后，用户先登录
“所忆账号”，账号短期会话保存在本机；私密空间密码仍只在本机解锁 VMK，两种密码相互独立。新增、编辑、
删除、解锁与网络恢复都会在后台自动同步密文，不向用户暴露 API 地址、COS 或手动上传下载入口。

开发环境可通过 `http://127.0.0.1:3000/?dev-vault=1` 打开手动密文验证工具；生产构建不显示此入口。
验证工具仍可测试账号登录、固定令牌和手动双向密文传输，运行方法见
[`memory-recall-server/README.md`](../memory-recall-server/README.md)。

## 验证

```powershell
npm.cmd run verify
```

验证包括 TypeScript 检查、VMK、账号会话与静默队列自动测试，以及生产构建。

加密设计和当前边界见 [`docs/VMK-V1-PROTOTYPE.md`](docs/VMK-V1-PROTOTYPE.md)，
项目目标、开发进度、验证结论和下一步任务统一记录在根目录
[`DEVELOPMENT.md`](../DEVELOPMENT.md)。

正式记忆 JSON 字段、校验规则、旧原型迁移和双端兼容夹具见
[MemoryV1 数据契约](../MEMORY-V1.md)。
