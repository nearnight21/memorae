# Memorae Environment / Secrets Inventory

> 盘点日期：2026-08-27
>
> 范围：本仓当前 `main` 的 Web、App、Server、Compose、Caddy 与 EAS 配置。
>
> 本文件只记录变量名、来源和用途，不记录真实值。

## 结论

- Web、App、Server 都只使用 Memorae 自己的变量前缀；业务源码没有读取 ThinkPad 或 Camp 的环境文件。
- Web 与 Server 已有脱敏模板；App 模板补充在 [`app/.env.example`](../app/.env.example)。
- Android release 的唯一正式凭据继续只保存在 `D:\hermes\secure\memorae\`，仓库只保存变量名和插件接线。
- 本仓已建立单仓 GitHub Actions workflow；CI 只运行 Web、App、Server 各自的无生产凭据门禁。
- EAS/生产发布仍由平台凭据管理；正式 Android 凭据只允许来自 `D:\hermes\secure\memorae\` 或受控 EAS credential store。

## Web

模板：[`web/.env.example`](../web/.env.example)。所有 `VITE_*` 值都会进入浏览器构建产物，不得放入服务端 Secret。

| 变量 | 必需性 / 默认值 | 敏感级别 | Local 来源 | CI 来源 | Production 来源 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| `VITE_MEMORY_RECALL_API_URL` | 可选；留空为纯离线 | 公开配置 | `web/.env.local` | GitHub Variable | Web 部署构建变量 | 密文同步 API 根地址。 |
| `VITE_MEMORY_RECALL_AMAP_JS_API_KEY` | 仅 JS API 测试页需要 | 客户端凭据 | `web/.env.local` | 需要该测试时的受限 Variable/Secret | Web 构建变量 | 高德 Web JS API Key，会进入产物。 |
| `VITE_MEMORY_RECALL_AMAP_JS_SECURITY_CODE` | 与上项成对 | 客户端凭据 | `web/.env.local` | 同上 | Web 构建变量 | 高德 securityJsCode，会进入产物。 |
| `DISABLE_HMR` | 可选，默认不关闭 | 本地配置 | 启动 Vite 前的 shell 环境 | 不需要 | 不需要 | 关闭 HMR 和文件监听；不是浏览器变量。 |

`import.meta.env.DEV` 是 Vite 内建构建标志，不是需要注入的产品变量。Web CI 使用空值模板，
不会把服务端密钥或 Android 凭据注入构建。

## App / Android / EAS

模板：[`app/.env.example`](../app/.env.example)。`EXPO_PUBLIC_*` 值会进入客户端 bundle；即使按敏感凭据管理，也不能视为服务端 Secret。

| 变量 | 必需性 / 默认值 | 敏感级别 | Local 来源 | CI / EAS 来源 | Production 来源 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| `EXPO_PUBLIC_MEMORY_RECALL_API_URL` | 可选，当前默认 `https://memorae.cn` | 公开配置 | `app/.env.local` 或进程环境 | EAS Environment / CI Variable | 正式 App 构建环境 | App 密文同步 API 根地址。 |
| `MEMORY_RECALL_AMAP_ANDROID_KEY` | Native 地图必需 | 客户端凭据 | 构建进程环境 | EAS Secret / 受控 Runner Secret | 正式 Android 构建环境 | prebuild 时写入 Manifest；必须匹配包名与签名 SHA-1。 |
| `EXPO_PUBLIC_AMAP_WEB_KEY` | WebView 地图必需 | 客户端凭据 | `app/.env.local` | EAS Environment/Secret | 正式 App 构建环境 | WebView Runtime 高德 JS Key。 |
| `EXPO_PUBLIC_AMAP_WEB_SECURITY_CODE` | 与上项成对 | 客户端凭据 | `app/.env.local` | 同上 | 正式 App 构建环境 | WebView securityJsCode。 |
| `EXPO_PUBLIC_AMAP_WEBVIEW_SLICE` | 可选，`1` 开启 | 开发开关 | 本地开发进程 | 不需要 | 禁止开启 | 进入 WebView 地图隔离入口。 |
| `EXPO_PUBLIC_AMAP_VERTICAL_SLICE` | 可选，`1` 开启 | 开发开关 | 本地开发进程 | 不需要 | 禁止开启 | 进入 Native 地图隔离入口。 |
| `EXPO_PUBLIC_AMAP_WEBVIEW_DEBUG` | 可选，`1` 开启 | 开发开关 | 本地开发进程 | 不需要 | 禁止开启 | 开启 WebView 调试。 |
| `EXPO_PUBLIC_MEMORAE_MAP_RENDERER` | 可选，默认 `webview` | 客户端配置 | `app/.env.local` | EAS Environment / CI Variable | 正式 App 构建环境 | Android 地图 Renderer；缺省使用高德 JS API 2.0 WebView，显式配置 `native` 或 `native-amap` 才启用 Native AMap。 |
| `MEMORY_RECALL_ANDROID_KEYSTORE_PATH` | Release 必需 | Secret 路径 | 指向 `D:\hermes\secure\memorae\` 中正式证书 | 受控 Runner 或 EAS credential store | 正式构建机仓库外路径 | 唯一正式 keystore。 |
| `MEMORY_RECALL_ANDROID_STORE_PASSWORD` | Release 必需 | Secret | 安全目录加载到进程环境 | EAS/CI Secret | 正式构建 Secret | keystore 密码。 |
| `MEMORY_RECALL_ANDROID_KEY_ALIAS` | Release 必需 | Secret 元数据 | 安全目录加载到进程环境 | EAS/CI Secret | 正式构建 Secret | 正式签名 alias。 |
| `MEMORY_RECALL_ANDROID_KEY_PASSWORD` | Release 必需 | Secret | 安全目录加载到进程环境 | EAS/CI Secret | 正式构建 Secret | key 密码。 |
| `EXPO_TOKEN` | 仅非交互 EAS 操作需要 | Secret | 不长期保存于仓库工作区 | CI Secret（发布 job，不参与普通 verify） | EAS/发布会话 | EAS CLI 认证。 |

发布规则：四项 `MEMORY_RECALL_ANDROID_*` 只在明确的 Release 构建中同时注入；普通 typecheck、测试、Expo Doctor 和 debug 构建不应读取正式签名密码。不得生成第二份“临时正式证书”绕过缺失配置。

## Server 本地模式

Server 不会自动读取 `.env`；本地值必须在启动它的 PowerShell 进程中显式设置。模板见
[`server/.env.example`](../server/.env.example)，JSON 本地模式与 PostgreSQL 模式二选一。

| 变量 | 必需性 / 默认值 | 敏感级别 | 来源 | 用途 |
| --- | --- | --- | --- | --- |
| `MEMORY_RECALL_LOCAL_TOKEN` | JSON 模式必需 | Secret | 本地进程环境 | 固定开发令牌；不得用于生产。 |
| `MEMORY_RECALL_DATA_FILE` | 可选，`.local-data/store.json` | 本地配置 | 本地进程环境 | JSON 密文文件路径。 |
| `MEMORY_RECALL_ALLOWED_ORIGINS` | JSON 模式可选 | 配置 | 本地进程环境 | 额外允许的 Web origins。 |
| `MEMORY_RECALL_PORT` | 可选，`8788` | 配置 | 本地进程环境 | API 端口。 |
| `MEMORY_RECALL_AMAP_WEB_SERVICE_KEY` | 地点 API 必需 | Secret | 本地进程环境或密码管理器 | 服务端高德 Web 服务 Key。 |
| `MEMORY_RECALL_TEST_DATABASE_URL` | PostgreSQL 集成测试可选 | Secret | 临时本地测试库或 CI service | 测试创建随机 schema；禁止指向生产。 |

JSON 模式固定监听 `127.0.0.1`；`MEMORY_RECALL_LISTEN_HOST` 只影响 PostgreSQL 模式。

## Server PostgreSQL / Production

部署模板：[`server/deploy/.env.example`](../server/deploy/.env.example)。

| 变量 | 必需性 / 默认值 | 敏感级别 | Local 来源 | CI 来源 | Production 来源 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| `MEMORY_RECALL_DATABASE_URL` | PostgreSQL 模式必需 | Secret | 临时本地数据库凭据 | 临时 service Secret | 生产密钥管理 | PostgreSQL 连接串。 |
| `MEMORY_RECALL_SESSION_TOKEN_PEPPER` | PostgreSQL 模式必需，至少 32 字符 | Secret | 仓库外本地环境 | 测试 Secret | 生产密钥管理 | 会话令牌摘要 pepper。 |
| `MEMORY_RECALL_ALLOWED_ORIGINS` | PostgreSQL 模式必需 | 配置 | 本地测试 origins | job env | 部署环境变量 | 允许的 Web 来源列表。 |
| `MEMORY_RECALL_LISTEN_HOST` | 可选，数据库模式默认 `0.0.0.0` | 配置 | 进程环境 | job env | Compose 固定值/服务环境 | 容器内监听地址。 |
| `MEMORY_RECALL_PORT` | 可选，`8788` | 配置 | 进程环境 | job env | Compose 固定值/服务环境 | 容器内 API 端口。 |
| `MEMORY_RECALL_AMAP_WEB_SERVICE_KEY` | 地点 API 必需 | Secret | 仓库外本地环境 | 仅地点集成测试时注入 | 生产密钥管理 | 服务端高德 Web 服务 Key。 |
| `MEMORY_RECALL_COS_BUCKET` | COS 模式四项成组 | 敏感配置 | 仓库外本地环境 | 集成测试专用值 | 生产密钥管理 | 私有 COS 桶。 |
| `MEMORY_RECALL_COS_REGION` | COS 模式四项成组 | 配置 | 同上 | 同上 | 部署环境变量 | COS 区域。 |
| `MEMORY_RECALL_COS_SECRET_ID` | COS 模式四项成组 | Secret | 同上 | CI Secret | 生产密钥管理 | COS 最小权限身份。 |
| `MEMORY_RECALL_COS_SECRET_KEY` | COS 模式四项成组 | Secret | 同上 | CI Secret | 生产密钥管理 | COS 最小权限密钥。 |
| `MEMORY_RECALL_POSTGRES_PASSWORD` | Compose 必需 | Secret | `server/deploy/.env` | 临时 service Secret | 生产密钥管理 | Compose PostgreSQL 账号密码。 |
| `MEMORY_RECALL_API_BIND_HOST` | 可选，`127.0.0.1` | 配置 | Compose `.env` | 不需要 | 部署环境变量 | API 暴露到宿主机的地址。 |
| `MEMORY_RECALL_API_PORT` | 可选，`8788` | 配置 | Compose `.env` | 不需要 | 部署环境变量 | API 暴露到宿主机的端口。 |
| `MEMORY_RECALL_PUBLIC_DOMAIN` | Caddy public profile 必需 | 配置 | 本地公网验收环境 | 不需要 | 部署环境变量 | Caddy 公开域名。 |
| `CADDY_EMAIL` | Caddy public profile 必需 | 运维配置 | 本地公网验收环境 | 不需要 | 部署环境变量 | TLS 联系邮箱。 |

四项 COS 配置必须全部存在或全部不存在；生产不得使用数据库 JSONB 照片回退作为长期对象存储。

## 一次性账号管理

| 变量 | 敏感级别 | 唯一允许来源 | 生命周期 |
| --- | --- | --- | --- |
| `MEMORY_RECALL_INVITED_LOGIN` | 临时敏感值 | 管理员当前进程环境 | 创建账号后清除。 |
| `MEMORY_RECALL_INVITED_PASSWORD` | Secret | 管理员当前进程环境 | 创建账号后立即清除，禁止落盘或进入 shell history。 |

## 环境来源规则

| 环境 | 允许来源 | 禁止项 | 当前状态 |
| --- | --- | --- | --- |
| Local | Web/App 的未跟踪 `.env.local`；Server 启动进程环境；Android 正式凭据只从 `D:\hermes\secure\memorae\` 加载 | 把安全目录复制回仓库；使用 ThinkPad/Camp env | 模板已覆盖三端；加载流程尚未统一。 |
| CI | GitHub Actions workflow；Web/App 使用空值公开配置，Server 使用本地 JSON 门禁；PostgreSQL 集成测试需单独临时 Secret | 生产数据库、生产 COS、正式签名密码参与普通验证 | 三端 verify 已接线；发布 Secret 不参与普通 CI。 |
| Production | Web/App 构建平台公开变量、EAS credentials、Server 密钥管理或权限受限 `server/deploy/.env` | 客户端持有 Server Secret；复用其他产品数据库/COS/地图身份；签名材料进入 Git | Memorae Compose/Caddy/EAS 配置已在本仓，真实平台凭据仍由平台管理。 |

## 多设备快速恢复

仓库提供 [`scripts/restore-local-config.ps1`](../scripts/restore-local-config.ps1)，用于从仓库外的加密配置包恢复本机配置。配置包解密后应使用以下结构：

```text
memorae-secrets/
├─ config/
│  ├─ web.env.local
│  ├─ app.env.local
│  └─ server.deploy.env
└─ ssh/
   ├─ id_ed25519
   └─ id_ed25519.pub
```

完整恢复并验证生产 SSH：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\restore-local-config.ps1 `
  -SecretRoot 'D:\secure\memorae-secrets' -Profile Full -TestSsh
```

只恢复日常 Web/App 开发配置：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\restore-local-config.ps1 `
  -SecretRoot 'D:\secure\memorae-secrets' -Profile Client
```

支持的配置档为 `Full`、`Client`、`Web`、`App` 和 `Server`。`Full` 与 `Server` 默认安装 SSH；其他配置档可显式传入 `-InstallSsh`。脚本将 SSH 私钥安装为用户目录下的专用 `memorae_ed25519`，并维护 `memorae-prod` 别名，不覆盖默认 `id_ed25519`。

目标文件已有不同内容时脚本默认停止；显式传入 `-Force` 才会先创建带时间戳的备份再替换。使用 `-WhatIf` 可以只检查来源、变量完整性、Git 忽略规则和计划操作。配置包必须位于仓库外，并应通过密码管理器附件或带文件名加密的加密包传递，不能以明文进入普通网盘或 Git。

## 独立交付验收

1. `.github/workflows/ci.yml` 在 Web、App、Server 三个 job 中分别执行现有 `npm run verify`。
2. `scripts/verify-fresh-clone.ps1` 从当前 `main` 创建临时 clone，注入模板值后验证三端安装/构建、Server `/health` 和 Compose 解析。
3. `D:\hermes\secure\memorae\` 只作为正式 Android 凭据的仓外来源；本仓不跟踪证书、密码或 EAS token。
4. `server/deploy/compose.yaml`、`server/deploy/Caddyfile`、`app/app.json` 与 `app/eas.json` 都只描述 Memorae 自己的 API、PostgreSQL、COS、地图和 Android 构建边界。

隔离完成的验收标准是：fresh clone 分别注入 Web、App、Server 的本仓变量即可构建并启动；三端只访问 Memorae 的数据库、COS、地点服务和域名；任何进程都不读取另外两个仓的文件或变量。

## 凭据处理规则

- 私密空间密码、VMK、账号 bearer token 和用户明文从不属于环境配置，也不得进入日志或交接文档。
- `EXPO_PUBLIC_*`、`VITE_*` 与 Android Manifest Key 都会进入客户端产物；只能授予客户端可承受的权限。
- Server Secret 只由进程环境、CI Secret、EAS credential store 或生产密钥管理注入。
- `.env.example` 只能使用空值或明显无效的示例值。
- 任何轮换只记录变量名、完成时间、证书指纹或资源标识，不记录凭据值。
