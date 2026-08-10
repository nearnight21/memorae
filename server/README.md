# Memory Recall 本地密文服务器

这是一个只供本机开发验证使用的后端。它模拟未来的国内云服务器，让 Android 代码把密文
上传后，再由 Web 代码取回并解密。

它不是正式线上服务，不包含手机验证码、真实账号、PostgreSQL 或腾讯云 COS，也没有接入
现有 ThinkPad 数据。

## 本地运行

```powershell
cd memory-recall-server
npm.cmd ci
$env:MEMORY_RECALL_LOCAL_TOKEN = '请换成至少16个字符的本地测试令牌'
npm.cmd run dev
```

默认地址是 `http://127.0.0.1:8788`。服务只监听本机地址，其他设备无法直接访问。

密文默认保存在 `memory-recall-server/.local-data/store.json`。该目录已被 Git 忽略，不会提交。

可选环境变量见 [`.env.example`](.env.example)。程序不会自动读取 `.env`；PowerShell 运行前
需要像上面一样设置环境变量。

## 接口

- `GET /health`：检查服务是否启动，不需要令牌。
- `PUT /v1/vault`、`GET /v1/vault`：保存或读取加密后的钥匙信封。
- `PUT /v1/memories/:id`、`GET /v1/memories`：保存或列出记忆密文。
- `PUT /v1/photos/:id`、`GET /v1/photos/:id`：保存或读取照片密文。

除 `/health` 外，请求都必须携带：

```text
Authorization: Bearer <MEMORY_RECALL_LOCAL_TOKEN>
```

## 自动验证

```powershell
npm.cmd run verify
```

测试会真实启动一个临时 HTTP 服务，完成以下链路：

1. Android 加密并上传钥匙信封、记忆和照片。
2. Web 下载同一批密文。
3. Web 使用同一私密空间密码恢复全部字段和照片字节。
4. 检查服务端持久化文件中没有标题、正文、地点、照片文件名或原照片字节明文。
5. 检查错误令牌和夹带未定义明文字段的请求会被拒绝。

## 当前限制

- 只有一个固定本地测试用户和一个本地令牌。
- JSON 文件只是方便验证持久化，不代替正式数据库。
- 照片密文暂存在 JSON 中，不适合大文件或生产使用。
- Android 与 Web 的同步客户端尚未接入界面和离线上传队列。
- 不得暴露到公网或用于保存真实用户数据。
