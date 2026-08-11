# Memory Recall 国内试运行部署设计

> 状态：PostgreSQL、三档照片、五分钟短期签名直传直下、Android/Web 三档生成与直传客户端、Web 有界加密小图缓存及 Docker/Caddy 配置已实现；本机容器、真实 PostgreSQL、双端本地对象服务及真实私有 COS 最小单档链路已通过。正式地图尚未接入私密数据，也尚未购买国内云服务器或验证公网 HTTPS 与三档真实照片
>
> 适用范围：仅限受邀请测试账号的 Android 与 Web 跨设备密文同步验收

> 服务器操作见 [`DEPLOYMENT-RUNBOOK.md`](DEPLOYMENT-RUNBOOK.md)。

## 目标和非目标

首轮公网试运行只验证以下闭环：测试账号可以登录，Android 和 Web 可以上传、下载并恢复钥匙信封、记忆密文和照片密文；服务端不能获得记忆明文、地点、照片文件名或原始照片字节。正式向受邀请用户开放前，照片字节必须通过私有 COS 短期签名直传直下，不得继续由 Lighthouse 中转。

本轮不做公开注册、手机验证码、密码找回、支付、复杂权限、自动冲突合并或高可用。登录密码仅用于获得服务端访问权限，绝不用于解开私密空间或派生 VMK。

## 最小架构

```text
Android / Web
  | HTTPS + Bearer access token                | short-lived signed GET/PUT
  v                                            v
Fastify API (Tencent Cloud Lighthouse)      Tencent Cloud COS private bucket
  | auth, metadata, signing, commit             encrypted photo variants only
  v
PostgreSQL (same host, Docker volume)
  account/session/cipher metadata/object references
```

首轮将 Fastify 和 PostgreSQL 放在同一台轻量云服务器上，目的是控制试运行成本和运维复杂度。COS 独立保存照片密文，避免将大文件放入 PostgreSQL。Fastify 是控制面，只处理账号鉴权、密文元数据、对象授权、短期签名和上传完成确认；Android/Web 是数据面，通过签名地址与 COS 直接传输照片密文。服务器只开放 HTTPS；PostgreSQL 不开放公网端口，COS 也不允许匿名读写。

正式产品前再将 PostgreSQL 迁移到腾讯云托管实例，增加自动备份、监控和故障隔离。该迁移只能改变连接配置和运维方式，不能改变现有密文协议、`MemoryV1` 或客户端恢复逻辑。

## 测试账号和会话

首轮仅允许管理员创建受邀请的测试账号，使用账号标识和密码登录：

1. 服务端只保存密码的 Argon2id 哈希和独立随机 salt，不保存密码明文。
2. 登录成功后签发高熵、短期的随机 access token；客户端以 `Authorization: Bearer <token>` 调用同步 API。
3. 服务端只保存 access token 经服务器密钥 HMAC-SHA-256 后的结果，API 从匹配的会话得到 `account_id`，不再接受客户端自报的用户 ID。
4. 登录密码与私密空间密码必须是两套独立输入和独立派生链；重置或修改登录密码不能恢复、替换或重加密任何 VMK。
5. 手机验证码是后续面向公开用户的注册方式，不是本轮前置条件。

首轮默认不做多设备管理界面。服务端可在会话表记录设备 ID、最后活动时间和撤销时间，但设备 ID 不得包含地点、设备名称或其他私人明文。

当前代码已提供 `POST /v1/auth/login`、`POST /v1/auth/logout`、Argon2id 密码校验、HMAC 保存会话令牌摘要和按账号隔离的 API 认证入口。`PostgresPasswordAuthStore` 将受邀请账号和可撤销会话持久化到 PostgreSQL，`create-invited-account` 命令仅供管理员创建测试账号；Android 与 Web 验证界面均能使用账号密码换取短期令牌并主动退出。默认本地启动仍使用单一 `MEMORY_RECALL_LOCAL_TOKEN`，只供开发回归。PostgreSQL 集成测试覆盖账号隔离、session 过期和撤销、重复上传以及 409 冲突；它需要单独设置 `MEMORY_RECALL_TEST_DATABASE_URL`。

## PostgreSQL 数据模型

账号和会话使用随机 UUID；密文记录以账号 UUID 与客户端生成的记录 ID 共同标识。下面的字段是服务器同步所需的最小元数据；标题、正文、标签、日期、地点、文件名、MIME 类型和照片字节均不进入明文字段。

| 表 | 最小字段 | 用途 |
| --- | --- | --- |
| `accounts` | `id`, `login_name`, `password_hash`, `created_at`, `disabled_at` | 测试账号及其密码哈希 |
| `sessions` | `id`, `account_id`, `token_hash`, `device_id`, `expires_at`, `revoked_at`, `created_at` | 可撤销的登录会话；`token_hash` 是带服务器密钥的 HMAC 结果 |
| `vault_envelopes` | `account_id`, `crypto_version`, `payload_json`, `created_at`, `updated_at` | 单个加密钥匙信封 JSON |
| `memory_ciphers` | `account_id`, `memory_id`, `revision`, `crypto_version`, `deleted`, `payload_json`, `updated_at` | 加密记忆及最小同步版本信息 |
| `photo_ciphers` | `account_id`, `photo_id`, `photo_kind`, `crypto_version`, `payload_json` 或 `object_key`、`metadata_json` | 未配置 COS 时保存完整加密照片 JSON；COS 模式按图片档位保存加密元数据和对象引用 |

`vault_envelopes.payload_json`、`memory_ciphers.payload_json` 和未配置 COS 时的 `photo_ciphers.payload_json` 只存现有 API 已验证的密文 JSON。`memory_id`、`photo_id`、修订号、大小和时间是允许的同步元数据。配置全部 COS 环境变量后，照片 `content` 密文会迁到 COS，数据库只保留加密元数据和服务端生成的随机对象引用。未完成上传过期时，服务端先原子删除仍为 `pending` 的数据库记录，再尽力删除对应 COS 密文对象，避免与完成操作并发时误删已提交照片；删除失败只会留下无法再获得签名地址的加密孤儿对象，运维应定期按数据库引用核对并清理。

所有密文查询都必须以 `account_id` 过滤。数据库唯一约束包括：`vault_envelopes.account_id`、`memory_ciphers(account_id, memory_id)` 和 `photo_ciphers(account_id, photo_id, photo_kind)`。三档照片复合唯一键迁移已经实现，且没有改变 `MemoryV1.photos[].id` 的含义。

## COS 对象规则

COS 桶必须为私有桶。对象路径只使用服务端生成或校验后的账号 UUID、照片 ID 和密文版本，例如：

```text
memory-recall/v1/{account-id}/photos/{photo-id}/{photo-kind}/{random-uuid}.json
```

客户端不得自行指定完整 COS 路径，也不得拿到长期 COS 密钥。当前实现为了保持 `/v1/photos/:id` 的请求和响应结构不变，由 Fastify 将 `EncryptedPhotoV1.content` 原样序列化为 UTF-8 JSON 后写入 COS，并在读取时与数据库中的 `metadata_json` 重新组合；该中转路径只保留给协议回归和迁移兼容，不作为正式图片数据通道。

目标路径由 API 在完成账号和对象归属校验后签发五分钟、单对象、单操作的 GET/PUT 地址。Web 端只允许来自已配置正式来源的 CORS 请求；签名不得授予列桶、访问其他前缀或长期读写能力。部署账号必须具有目标前缀的 `GetObject`、`HeadObject`、`PutObject`、`DeleteObject` 最小权限。上传采用“申请地址 → 客户端直传密文 → 服务端检查对象并提交索引”的流程，失败或未完成对象要有过期清理规则。当前受邀试运行接受 PUT 签名不能强制实际上传大小的边界，并通过短签名、删除权限和费用告警控制风险；公开注册前再增加配额、限流或可强制大小的上传策略。后续需要降低 Base64 开销时，再通过新的照片传输协议版本改为二进制密文。对象内容已被客户端加密，但仍按私有用户数据处理：禁止公共读、禁止公共 CDN 缓存、禁止在日志中写出对象内容或签名 URL。

## 图片分级与 Web 缓存边界

客户端必须在加密前生成适合实际界面的图片档位；服务端和 COS 不接触可解密的原图，也不承担明文裁剪：

| 档位 | 主要用途 | 目标尺寸与体积 |
| --- | --- | --- |
| `thumbnail` | 地图气泡 | 约 128～256 px、10～40 KB |
| `preview` | 用户逐层进入后的最后一级大图 | 约 1280～1600 px、150～400 KB |
| `original` | 用户明确高清放大、导出或完整恢复 | 保留原始字节 |

尺寸和体积是编码目标而不是明文服务端字段；客户端生成后分别加密，COS 只看到密文对象。服务端照片传输层与 Android/Web 客户端已支持 `thumbnail`、`preview`、`original`，数据库通过 `(account_id, photo_id, photo_kind)` 隔离三档对象，并保持已冻结的 `MemoryV1` 不变；Android 与 Web 都拒绝超过 30 MiB 的原始照片。

Web 默认允许对加密的 `thumbnail` 和 `preview` 做容量受限、按最近使用淘汰的 IndexedDB 缓存，避免每次打开重复下载。锁定、退出私密空间或页面销毁时必须清除 VMK、派生钥匙、明文状态和临时 `blob:` URL；正常锁定不删除加密小图缓存。登录 access token 仍只保存在页面内存，`original` 不由应用默认持久化。退出界面提供显式的“退出并清除本机缓存”，供公共或不可信设备使用，不在正常登录流程中增加强制的设备信任询问。

## API 迁移边界

现有 `PUT/GET /v1/vault`、`PUT/GET /v1/memories` 的密文请求和响应结构保持不变。现有 `PUT/GET /v1/photos` 保留给回归与迁移兼容，但正式图片传输增加经过账号鉴权的短期签名和上传完成确认接口。迁移替换以下服务端边界：

1. 将固定 `MEMORY_RECALL_LOCAL_TOKEN` 和 `local-user` 替换为会话校验后的 `account_id`。
2. 将 `JsonCipherStore` 替换为 `PostgresCipherStore`；配置完整 COS 环境变量时使用 `PostgresCosCipherStore`，将照片内容切换到 COS。
3. 已增加 `POST /v1/photos/:id/:kind/upload`、`POST /v1/photos/:id/:kind/complete` 和 `GET /v1/photos/:id/:kind/download`；客户端使用短期签名地址与私有 COS 直传直下，Fastify 只返回加密元数据、签名结果和提交状态。配置 COS 后不注册旧照片中转接口。
4. 已将单一照片记录扩展为 `thumbnail`、`preview`、`original` 三档密文对象，维持账号隔离、待上传过期清理和幂等完成确认。

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
6. COS CORS 只允许正式 Web 来源和必需方法；匿名请求、过期签名及跨账号签名申请必须失败。
7. 用 Android/Web 分别直传直下三档照片，确认照片字节不经过 Lighthouse，并验证地图气泡、最后一级展示图和原图恢复。
8. 验证锁定会清除钥匙与明文但保留有界加密小图缓存，“退出并清除本机缓存”会删除该账号的本机密文。

## 实施顺序

1. 以已合入 `prototype` 的双端联调基线开始实现。
2. 已完成账号密码、会话校验和跨账号隔离的服务端回归测试。
3. 已完成 PostgreSQL 存储、受邀请账号持久化和迁移脚本，JSON 存储仅供本地测试。
4. 已实现照片密文字节迁移到私有 COS 的服务器中转代码和失败清理；该路径只用于回归和迁移兼容。
5. 服务端与 Android/Web 已实现三档照片、私有 COS 短期签名直传直下、上传完成确认、长度与摘要校验、
   幂等上传和过期待上传清理；Web 已实现 96 MiB 有界加密小图缓存。真实 COS 最小单档链路已通过，
   三档真实照片、双端公网恢复与正式地图气泡仍待验收。
6. 已添加 Docker Compose、Caddy 反向代理和部署运行手册；本机 Docker/PostgreSQL 迁移、账号登录和 HTTP logout 验收已通过，创建最小云资源后再验收公网 HTTPS、真实 COS、备份和监控。
7. 进行 Android 真机、Web 和第二台真实设备的公网验收；完成直传直下与缓存安全检查前不得向受邀请用户开放。
