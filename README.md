# Memorae

Memorae 的三个运行面集中在本目录，并继续各自维护依赖与 lockfile：

- `web/`：React/Vite 正式 Web 客户端。
- `app/`：Expo/React Native App。
- `server/`：Fastify 密文同步服务、PostgreSQL 迁移与部署配置。

三端业务源码不能互相直接导入。当前少量跨目录引用只存在于兼容性测试，用于证明 Web、App 与 Server 仍能交换同一份密文；第二期再决定是否建立 `protocol` 和 `test-vectors` 包。

验证：

```powershell
cd projects/memorae/web
npm run verify

cd ../app
npm run verify

cd ../server
npm run verify
```
