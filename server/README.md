# Memory Recall 密文服务器

这是 Android 与 Web 的密文同步后端。它有两种启动模式：本地开发使用 JSON 文件和固定测试令牌；
试运行使用 PostgreSQL、受邀请账号和短期会话令牌。两种模式的密文 API 协议相同。

它不包含公开注册、手机验证码或密码找回。未配置 COS 时，照片密文临时保存在 PostgreSQL 的
JSONB 列中；配置私有腾讯云 COS 后，只有已加密的照片 `content` 进入 COS。登录密码只负责获得
同步 API 权限，不能解开或重置私密空间密码。

## 本地运行

```powershell
cd memory-recall-server
npm.cmd ci
$env:MEMORY_RECALL_LOCAL_TOKEN = '请换成至少16个字符的本地测试令牌'
npm.cmd run dev
```

默认地址是 `http://127.0.0.1:8788`。服务只监听本机地址，其他设备无法直接访问。

密文默认保存在 `memory-recall-server/.local-data/store.json`。该目录已被 Git 忽略，不会提交。

还可设置 `MEMORY_RECALL_PORT`、`MEMORY_RECALL_DATA_FILE`。如果网页临时运行在 3000 以外
的端口，可用英文逗号分隔 `MEMORY_RECALL_ALLOWED_ORIGINS`。程序不会自动读取 `.env`；
PowerShell 运行前需要像上面一样设置环境变量。

地图地点功能使用服务端代理的高德 Web 服务，不把 Key 发送给浏览器。要启用地点搜索、地图落点
反查和照片 GPS 转换，设置：

```powershell
$env:MEMORY_RECALL_AMAP_WEB_SERVICE_KEY = '部署机密钥管理中的高德 Web 服务 Key'
```

未设置该变量时，`/v1/location/*` 会明确返回“地点服务尚未配置”，网页不会回退到 OSM/Nominatim。

## PostgreSQL 试运行模式

先创建空 PostgreSQL 数据库并应用迁移。迁移不会自动在服务器启动时执行，避免应用进程意外
改变生产数据库结构：

```powershell
cd memory-recall-server
npm.cmd ci
$env:MEMORY_RECALL_DATABASE_URL = 'postgresql://memory_recall:请替换密码@127.0.0.1:5432/memory_recall'
npm.cmd run migrate
```

然后由管理员创建受邀请测试账号。密码只从环境变量读取，不能放在命令行参数中：

```powershell
$env:MEMORY_RECALL_INVITED_LOGIN = 'tester01'
$env:MEMORY_RECALL_INVITED_PASSWORD = '请设置独立且至少8字符的登录密码'
npm.cmd run create-invited-account
Remove-Item Env:MEMORY_RECALL_INVITED_PASSWORD
```

启动试运行服务还需要一个至少 32 字符、随机生成且只保存在部署机密钥管理中的 token pepper，及
实际 Web 客户端域名。数据库模式默认监听 `0.0.0.0`，应只通过反向代理的 HTTPS 入口公开：

```powershell
$env:MEMORY_RECALL_SESSION_TOKEN_PEPPER = '请替换为至少32字符的随机服务端密钥'
$env:MEMORY_RECALL_ALLOWED_ORIGINS = 'https://你的Web域名'
$env:MEMORY_RECALL_LISTEN_HOST = '0.0.0.0'
npm.cmd start
```

设置 `MEMORY_RECALL_DATABASE_URL` 后，程序不会读取 `MEMORY_RECALL_LOCAL_TOKEN`。未设置数据库
地址时，仍按上节的 JSON 本地模式启动。数据库迁移保存在 `migrations/`；账号、会话、钥匙信封、
记忆密文和照片密文都按 `account_id` 隔离。`POST /v1/auth/login` 接受 `loginName`、`password` 和可选
`deviceId`，成功后返回 `accessToken` 与 `expiresAt`。

要把照片 `content` 迁到私有腾讯云 COS，必须同时配置以下四项；少任何一项服务都会拒绝启动。
API 生成随机对象路径并保留三次失败清理尝试，客户端不接触长期 COS 密钥：

```powershell
$env:MEMORY_RECALL_COS_BUCKET = '你的私有桶-APPID'
$env:MEMORY_RECALL_COS_REGION = 'ap-shanghai'
$env:MEMORY_RECALL_COS_SECRET_ID = '部署机密钥管理中的SecretId'
$env:MEMORY_RECALL_COS_SECRET_KEY = '部署机密钥管理中的SecretKey'
npm.cmd run migrate
npm.cmd start
```

桶必须关闭匿名读写和公共 CDN 缓存，部署账号还必须拥有目标前缀的 `GetObject`、`HeadObject`、
`PutObject` 和 `DeleteObject` 最小权限。没有 COS 配置时，服务仍使用 PostgreSQL 临时照片 JSON 存储并
注册旧 `PUT/GET /v1/photos/:id`，只供本地回归；配置 COS 后旧中转接口不会注册，Android/Web 只能使用
账号鉴权后的五分钟短期签名直传直下。真实私有 COS 已完成一份 4 KiB 随机测试密文的 PUT、完成确认、
GET 和 SHA-256 校验，照片字节没有经过 API；Android/Web 三档真实照片与公网环境仍需继续验收。

## 接口

- `GET /health`：检查服务是否启动，不需要令牌。
- `POST /v1/auth/login`、`POST /v1/auth/logout`：PostgreSQL 模式登录及撤销当前短期会话。
- `PUT /v1/vault`、`GET /v1/vault`：保存或读取加密后的钥匙信封。
- `PUT /v1/memories/:id`、`GET /v1/memories`：保存或列出记忆密文。
- `PUT /v1/photos/:id`、`GET /v1/photos/:id`：仅在未配置 COS 时注册，供本地回归保存或读取原图密文。
- `GET /v1/location/suggest`、`GET /v1/location/reverse`、`POST /v1/location/convert-gps`：高德地点提示、
  反向地理编码和照片 WGS-84 GPS 到 GCJ-02 转换；均要求账号令牌，服务端保管高德 Key。
- `POST /v1/photos/:id/:kind/upload`：为 `thumbnail`、`preview` 或 `original` 申请短期 COS PUT 地址。
- `POST /v1/photos/:id/:kind/complete`：直传完成后检查对象长度并提交密文索引。
- `GET /v1/photos/:id/:kind/download`：校验账号归属后返回短期 COS GET 地址和加密元数据。

除 `/health` 和 PostgreSQL 模式下的 `POST /v1/auth/login` 外，请求都必须携带：

```text
Authorization: Bearer <本地测试令牌或登录返回的 accessToken>
```

部署试运行的安全边界、数据模型和上线顺序见
[`docs/DEPLOYMENT-PILOT.md`](docs/DEPLOYMENT-PILOT.md)。

## 自动验证

```powershell
npm.cmd run verify
```

如果本机或 CI 配置了临时 PostgreSQL 数据库，可额外运行实际数据库集成测试。测试会创建并删除
自己的随机 schema，不会修改既有表：

```powershell
$env:MEMORY_RECALL_TEST_DATABASE_URL = 'postgresql://.../memory_recall_test'
npm.cmd run test:postgres
```

测试会真实启动一个临时 HTTP 服务，完成以下链路：

1. Android 加密并上传钥匙信封、记忆和照片，Web 下载并解密。
2. Web 使用同一钥匙信封加密并上传另一组记忆和照片。
3. Android 下载后使用同一私密空间密码恢复全部字段和照片字节。
4. 检查服务端持久化文件中没有标题、正文、地点、照片文件名或原照片字节明文。
5. 检查错误令牌和夹带未定义明文字段的请求会被拒绝。
6. PostgreSQL 集成测试会验证账号隔离、token 过期、HTTP logout 撤销、重复上传和 409 冲突。

## 当前限制

- 本地 JSON 模式只有一个固定测试用户和令牌；它只供开发回归。
- PostgreSQL 模式只允许管理员创建受邀请账号，尚无公开注册或账号管理界面。
- 未配置 COS 时照片密文暂存在 PostgreSQL JSONB 中；该回退路径不适合大文件或生产使用。
- 服务端和 Android/Web 的三档短期签名直传直下、复合唯一键、幂等上传、摘要校验和过期清理已实现；
  真实 COS 最小单档链路已通过，三档真实照片和双端公网恢复尚未验收。配置 COS 后旧中转接口关闭。
- 客户端已经生成 `thumbnail`、`preview`、`original` 并让验证页普通查看优先使用 `preview`；Web 已有
  96 MiB 有界加密小图缓存。正式地图尚未接入私密数据，因此地图气泡使用缩略图仍待正式界面阶段完成。
- Android 与 Web 验证界面已支持人工同步，但尚无离线上传队列、删除同步和冲突处理界面。
- Docker Compose、PostgreSQL 迁移、邀请账号、登录和退出已完成本机容器验收；私有 COS 最小链路已验证；
  Caddy 公网 HTTPS、三档双端恢复、备份和监控仍未验证，因此不得开放给受邀测试用户。详见
  [`docs/DEPLOYMENT-RUNBOOK.md`](docs/DEPLOYMENT-RUNBOOK.md)。
