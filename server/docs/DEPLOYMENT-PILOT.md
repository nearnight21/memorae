# Memory Recall 国内试运行部署设计

> 状态：PostgreSQL 迁移、受邀请账号、会话、账号隔离密文存储、COS 照片内容存储及 Docker/Caddy 配置已实现；尚未购买或部署云资源，未验证容器、真实数据库或 COS 桶
>
> 适用范围：仅限受邀请测试账号的 Android 与 Web 跨设备密文同步验收

> 服务器操作见 [`DEPLOYMENT-RUNBOOK.md`](DEPLOYMENT-RUNBOOK.md)。

## 目标和非目标

首轮公网试运行只验证以下闭环：测试账号可以登录，Android 和 Web 可以上传、下载并恢复钥匙信封、记忆密文和照片密文；服务端不能获得记忆明文、地点、照片文件名或原始照片字节。

本轮不做公开注册、手机验证码、密码找回、支付、复杂权限、自动冲突合并或高可用。登录密码仅用于获得服务端访问权限，绝不用于解开私密空间或派生 VMK。

## 最小架构

```text
Android / Web
  | HTTPS + Bearer access token
  v
Fastify API (Tencent Cloud Lighthouse, Docker)
  | PostgreSQL connection                 | COS SDK / signed server request
  v                                       v
PostgreSQL (same host, Docker volume)   Tencent Cloud COS private bucket
  account/session/cipher payloads         encrypted photo payloads only
```

首轮将 Fastify 和 PostgreSQL 放在同一台轻量云服务器上，目的是控制试运行成本和运维复杂度。COS 独立保存照片密文，避免将大文件放入 PostgreSQL。服务器只开放 HTTPS；PostgreSQL 不开放公网端口，COS 也不允许匿名读写。

正式产品前再将 PostgreSQL 迁移到腾讯云托管实例，增加自动备份、监控和故障隔离。该迁移只能改变连接配置和运维方式，不能改变现有密文协议、`MemoryV1` 或客户端恢复逻辑。

## 测试账号和会话

首轮仅允许管理员创建受邀请的测试账号，使用账号标识和密码登录：

1. 服务端只保存密码的 Argon2id 哈希和独立随机 salt，不保存密码明文。
2. 登录成功后签发高熵、短期的随机 access token；客户端以 `Authorization: Bearer <token>` 调用同步 API。
3. 服务端只保存 access token 经服务器密钥 HMAC-SHA-256 后的结果，API 从匹配的会话得到 `account_id`，不再接受客户端自报的用户 ID。
4. 登录密码与私密空间密码必须是两套独立输入和独立派生链；重置或修改登录密码不能恢复、替换或重加密任何 VMK。
5. 手机验证码是后续面向公开用户的注册方式，不是本轮前置条件。

首轮默认不做多设备管理界面。服务端可在会话表记录设备 ID、最后活动时间和撤销时间，但设备 ID 不得包含地点、设备名称或其他私人明文。

当前代码已提供 `POST /v1/auth/login`、Argon2id 密码校验、HMAC 保存会话令牌摘要和按账号隔离的 API 认证入口。`PostgresPasswordAuthStore` 将受邀请账号和会话持久化到 PostgreSQL，`create-invited-account` 命令仅供管理员创建测试账号；默认本地启动仍使用单一 `MEMORY_RECALL_LOCAL_TOKEN`，只供开发回归。PostgreSQL 集成测试覆盖账号隔离、session 过期和撤销、重复上传以及 409 冲突；它需要单独设置 `MEMORY_RECALL_TEST_DATABASE_URL`。

## PostgreSQL 数据模型

账号和会话使用随机 UUID；密文记录以账号 UUID 与客户端生成的记录 ID 共同标识。下面的字段是服务器同步所需的最小元数据；标题、正文、标签、日期、地点、文件名、MIME 类型和照片字节均不进入明文字段。

| 表 | 最小字段 | 用途 |
| --- | --- | --- |
| `accounts` | `id`, `login_name`, `password_hash`, `created_at`, `disabled_at` | 测试账号及其密码哈希 |
| `sessions` | `id`, `account_id`, `token_hash`, `device_id`, `expires_at`, `revoked_at`, `created_at` | 可撤销的登录会话；`token_hash` 是带服务器密钥的 HMAC 结果 |
| `vault_envelopes` | `account_id`, `crypto_version`, `payload_json`, `created_at`, `updated_at` | 单个加密钥匙信封 JSON |
| `memory_ciphers` | `account_id`, `memory_id`, `revision`, `crypto_version`, `deleted`, `payload_json`, `updated_at` | 加密记忆及最小同步版本信息 |
| `photo_ciphers` | `account_id`, `photo_id`, `crypto_version`, `payload_json` 或 `object_key`、`photo_kind`、`metadata_json` | 未配置 COS 时保存完整加密照片 JSON；COS 模式保存加密元数据和对象引用 |

`vault_envelopes.payload_json`、`memory_ciphers.payload_json` 和未配置 COS 时的 `photo_ciphers.payload_json` 只存现有 API 已验证的密文 JSON。`memory_id`、`photo_id`、修订号、大小和时间是允许的同步元数据。配置全部 COS 环境变量后，照片 `content` 密文会迁到 COS，数据库只保留加密元数据和服务端生成的随机对象引用；确认本次对象未被数据库引用时，服务端最多尝试三次删除它。连接结果不确定时保留密文对象，避免删除可能已提交的用户记录。

所有密文查询都必须以 `account_id` 过滤。数据库唯一约束至少包括：`vault_envelopes.account_id`、`memory_ciphers(account_id, memory_id)` 和 `photo_ciphers(account_id, photo_id)`。

## COS 对象规则

COS 桶必须为私有桶。对象路径只使用服务端生成或校验后的账号 UUID、照片 ID 和密文版本，例如：

```text
memory-recall/v1/{account-id}/photos/{photo-id}/{random-uuid}.json
```

客户端不得自行指定完整 COS 路径，也不得拿到长期 COS 密钥。为了保持现有 `/v1/photos/:id` 的请求和响应结构不变，服务将 `EncryptedPhotoV1.content` 原样序列化为 UTF-8 JSON 后存入 COS，并在读取时与数据库中的 `metadata_json` 重新组合。后续需要降低 Base64 开销时，再通过新的协议版本改为二进制直传。对象内容已被客户端加密，但仍按私有用户数据处理：禁止公共读、禁止 CDN 公共缓存、禁止在日志中写出对象内容。

## API 迁移边界

现有 `PUT/GET /v1/vault`、`PUT/GET /v1/memories` 和 `PUT/GET /v1/photos` 的密文请求和响应结构保持不变。迁移只替换两处服务端边界：

1. 将固定 `MEMORY_RECALL_LOCAL_TOKEN` 和 `local-user` 替换为会话校验后的 `account_id`。
2. 将 `JsonCipherStore` 替换为 `PostgresCipherStore`；配置完整 COS 环境变量时使用 `PostgresCosCipherStore`，将照片内容切换到 COS。

上线前必须保留并扩展现有双向加密回归测试：同一批 Android/Web 密文经过 PostgreSQL 和 COS 往返后，仍能在另一端恢复；服务端数据、数据库日志和 COS 对象中均不得出现测试明文。

## 环境变量和上线检查

部署机只通过受保护的环境变量或密钥管理保存以下值：

```text
MEMORY_RECALL_DATABASE_URL=
MEMORY_RECALL_SESSION_TOKEN_PEPPER=
MEMORY_RECALL_LISTEN_HOST=
MEMORY_RECALL_COS_BUCKET=
MEMORY_RECALL_COS_REGION=
MEMORY_RECALL_COS_SECRET_ID=
MEMORY_RECALL_COS_SECRET_KEY=
MEMORY_RECALL_ALLOWED_ORIGINS=
```

上线前检查：

1. 域名和 HTTPS 可用；若服务器部署在中国大陆，先完成所需的域名备案流程。
2. 防火墙仅开放 `80/443`，PostgreSQL 端口仅限 Docker 内网或本机访问。
3. 数据库卷和 COS 桶均有定期备份与恢复演练；备份按密文数据处理。
4. API 日志不得记录 `Authorization`、请求体、密码、密文全文或 COS 密钥。
5. 运行 Android 与 Web 双向恢复、错误密码、失效 token、跨账号访问、重复上传和 409 冲突回归。

## 实施顺序

1. 以已合入 `prototype` 的双端联调基线开始实现。
2. 已完成账号密码、会话校验和跨账号隔离的服务端回归测试。
3. 已完成 PostgreSQL 存储、受邀请账号持久化和迁移脚本，JSON 存储仅供本地测试。
4. 已实现照片密文字节迁移到私有 COS 的代码和失败清理；创建私有桶后运行真实 COS 验收。
5. 已添加 Docker Compose、Caddy 反向代理和部署运行手册；创建最小云资源后进行真实容器验收。
6. 进行 Android 真机、Web 和第二台真实设备的公网验收。
