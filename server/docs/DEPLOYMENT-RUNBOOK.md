# Memory Recall 试运行部署手册

本手册只覆盖受邀请测试账号的最小试运行环境。部署前先阅读
[`DEPLOYMENT-PILOT.md`](DEPLOYMENT-PILOT.md) 的数据和隐私边界。不要把本项目的本地 JSON
模式、未验证 COS 桶或开发测试密码暴露到公网。

## 前置条件

1. 一台位于中国大陆的腾讯云 Lighthouse 主机，已完成操作系统安全更新，并只开放 `80`、`443` 和
   运维所需的受限 SSH 入口。若域名指向中国大陆主机，先完成所需备案流程。
2. 一个解析到该主机公网 IP 的 API 子域名，例如 `sync.example.cn`。Caddy 将使用该域名自动申请和续期
   HTTPS 证书；`MEMORY_RECALL_ALLOWED_ORIGINS` 应填写实际 Web 应用的不同来源，例如 `https://app.example.cn`。
3. Docker Engine 与 Docker Compose Plugin。数据库不会安装在主机系统中，而是由 Compose 在私有网络中运行。
4. 可选但在第一次有真实照片前必须完成：创建与服务器同地域的腾讯云 COS 私有桶，关闭匿名读写和公共 CDN
   缓存，为部署账号授予该桶 `memory-recall/v1/` 前缀的最小读、写、检查和删除权限。所需 CAM action 为
   `name/cos:GetObject`、`name/cos:HeadObject`、`name/cos:PutObject`、`name/cos:DeleteObject`；缺少
   `DeleteObject` 会让过期待上传残留为无法清理的 COS 孤儿对象。正式 Web 直传直下时，
   COS CORS 只允许实际 Web 来源及必需的 `GET`、`PUT`、`HEAD`，不得使用 `*` 来源。
5. 在腾讯云费用中心为 COS 设置余额和费用告警。五分钟 PUT 签名只限制对象和有效期，不强制实际上传大小；
   当前受邀试运行接受这一边界，公开注册前必须增加上传配额、限流或可强制大小的上传策略。

## 首次启动

以下命令在 Linux 云主机的项目目录执行。示例假设仓库位于 `/srv/thinkpad`：

```bash
cd /srv/thinkpad/projects/memorae/server/deploy
cp .env.example .env
chmod 600 .env
```

编辑 `.env`。`MEMORY_RECALL_POSTGRES_PASSWORD` 与数据库 URL 中的密码必须是同一个值；若密码中含
`@`、`:`、`/` 等 URL 保留字符，必须在 `MEMORY_RECALL_DATABASE_URL` 中做 URL 编码。token pepper 至少 32
个随机字符，不能复用数据库密码或任何私密空间密码。

首次构建并启动完整服务：

```bash
docker compose --profile public up --build -d
docker compose ps
curl --fail http://127.0.0.1:8788/health
```

Compose 会依次等待 PostgreSQL 健康、执行数据库迁移、启动 API，再启动 Caddy。PostgreSQL 没有主机端口映射；
API 只映射到 `127.0.0.1:8788`，公网流量只能经过 Caddy 的 `80/443`。

创建首个受邀请账号时，不要将密码写入 shell 历史、命令参数或文件：

```bash
read -r -p 'Login name: ' MEMORY_RECALL_INVITED_LOGIN
read -r -s -p 'Login password: ' MEMORY_RECALL_INVITED_PASSWORD
echo
export MEMORY_RECALL_INVITED_LOGIN MEMORY_RECALL_INVITED_PASSWORD
docker compose run --rm --no-deps api npm run create-invited-account
unset MEMORY_RECALL_INVITED_LOGIN MEMORY_RECALL_INVITED_PASSWORD
```

之后以该账号通过 `POST /v1/auth/login` 登录，再从 Android 和 Web 分别执行上传、下载和恢复验收。

## COS 启用与验收

只有在 `.env` 中同时填写以下四项时，API 才使用 COS；任一项缺失会让 API 拒绝启动，避免半配置状态：

```text
MEMORY_RECALL_COS_BUCKET=
MEMORY_RECALL_COS_REGION=
MEMORY_RECALL_COS_SECRET_ID=
MEMORY_RECALL_COS_SECRET_KEY=
```

启用后，数据库保存照片的加密元数据及随机对象引用，COS 保存客户端加密后的照片内容；旧
`PUT/GET /v1/photos/:id` 不再注册，照片字节不能经由 Fastify 中转。服务端已经按
[`DEPLOYMENT-PILOT.md`](DEPLOYMENT-PILOT.md) 提供三档照片五分钟短期签名直传直下接口；Android/Web
客户端已接入并通过本地对象服务自动往返测试。真实私有 COS 已使用 4 KiB 随机测试密文完成 PUT、完成确认、
GET 和 SHA-256 校验；完成以下真实照片验收后才可用于受邀测试：

1. Android 上传照片，确认数据库记录不含该照片 `content` 密文。
2. Web 下载并恢复照片；再由 Web 上传另一张，Android 下载并恢复。
3. 使用另一测试账号读取同一 `photo_id`，结果必须为 `404`。
4. 检查 COS 桶为私有，匿名请求不能读取对象，应用日志没有记录令牌、密码、密文全文或 COS 密钥。
5. 直传直下实现后，分别上传和下载 `thumbnail`、`preview`、`original`，确认数据库唯一键包含图片档位，
   过期签名、跨账号签名申请和未授权 CORS 请求均失败。
6. 监控 Lighthouse 公网流量，确认照片内容由 Android/Web 与 COS 直接传输，API 只处理鉴权、签名、
   加密元数据和提交状态。
7. 验证地图气泡使用 `thumbnail`，最后一级默认使用 `preview`，只有明确高清查看、导出或完整恢复才获取 `original`。
8. Web 锁定后不得残留钥匙、明文和 `blob:` URL；有界 IndexedDB 只保存加密小图，“退出并清除下载缓存”
   必须删除远端下载的可淘汰小图，但不得误删本机创建或手动完整恢复的数据。

## 更新、备份与恢复

更新镜像前先拉取已审核的提交，运行迁移，再重建 API 与 Caddy：

```bash
git pull --ff-only
cd /srv/thinkpad/projects/memorae/server/deploy
docker compose build
docker compose run --rm --no-deps migrate
docker compose --profile public up -d --no-deps api caddy
```

至少每天导出一次 PostgreSQL 密文数据，并定期验证可恢复。以下示例将备份写到主机受保护目录；实际环境还应把
加密后的备份送往独立位置，并配合 COS 版本控制或同等的恢复策略：

```bash
mkdir -p /srv/memory-recall-backups
docker compose exec -T postgres pg_dump -U memory_recall memory_recall \
  > /srv/memory-recall-backups/memory-recall-$(date +%F).sql
```

恢复演练必须在隔离的临时数据库进行，恢复后运行 Android/Web 双向恢复、错误密码、失效 token、跨账号访问和
409 冲突回归。不得在生产数据库直接试恢复。

## 当前部署门槛

当前开发机已通过 Docker Compose 启动 PostgreSQL 17.6、执行四项迁移、创建邀请账号，并完成登录、鉴权读取、
HTTP logout 撤销以及随机 schema 的真实数据库集成测试。真实 COS 最小单档链路已经通过；Caddy 公网 HTTPS、
三档真实照片、备份与监控仍未验收；
短期签名直传直下、三档图片生成、Android/Web 客户端和 96 MiB Web 加密小图缓存已通过自动测试；
正式地图接入与公网双端恢复仍未完成。完成这些项目和双端公网恢复前，不得把试运行环境标记为可对受邀请测试账号开放。
