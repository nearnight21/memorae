# Environment / Secrets Inventory

> 盘点日期：2026-08-27
>
> 本文件只记录变量名、来源和用途，不记录任何真实值。浏览器/客户端公开配置与服务端 Secret
> 必须分开管理。

## Web

| 变量 | 类型 | 来源 | 用途 |
| --- | --- | --- | --- |
| `VITE_MEMORY_RECALL_API_URL` | 公开配置 | `web/.env.local` 或 Web 构建环境 | 密文同步 API 根地址；留空时 Web 保持纯离线。 |
| `VITE_MEMORY_RECALL_AMAP_JS_API_KEY` | 客户端凭据 | `web/.env.local` 或 Web 构建环境 | 高德 Web JS API 测试页 Key，会进入浏览器产物。 |
| `VITE_MEMORY_RECALL_AMAP_JS_SECURITY_CODE` | 客户端凭据 | `web/.env.local` 或 Web 构建环境 | 上述 Key 对应的 securityJsCode，会进入浏览器产物。 |
| `DISABLE_HMR` | 本地配置 | Vite 进程环境 | 特定开发环境中关闭 HMR 和文件监听。 |

## App / Android / EAS

| 变量 | 类型 | 来源 | 用途 |
| --- | --- | --- | --- |
| `EXPO_PUBLIC_MEMORY_RECALL_API_URL` | 公开配置 | App 构建环境或 EAS Environment | App 同步 API 根地址，会进入客户端包。 |
| `MEMORY_RECALL_AMAP_ANDROID_KEY` | 客户端凭据 | 本机构建环境或 EAS Secret | prebuild 时注入 Android Manifest；必须匹配包名和签名 SHA-1。 |
| `EXPO_PUBLIC_AMAP_WEB_KEY` | 客户端凭据 | App 构建环境或 EAS Secret | WebView Runtime 的高德 Web JS Key。 |
| `EXPO_PUBLIC_AMAP_WEB_SECURITY_CODE` | 客户端凭据 | App 构建环境或 EAS Secret | WebView Runtime 的 securityJsCode。 |
| `EXPO_PUBLIC_AMAP_WEBVIEW_SLICE` | 开发开关 | 本机开发环境 | 进入 WebView 地图隔离测试入口。 |
| `EXPO_PUBLIC_AMAP_VERTICAL_SLICE` | 开发开关 | 本机开发环境 | 进入 Native 高德地图隔离测试入口。 |
| `EXPO_PUBLIC_AMAP_WEBVIEW_DEBUG` | 开发开关 | 本机开发环境 | 开启 WebView 调试；正式构建默认关闭。 |
| `MEMORY_RECALL_ANDROID_KEYSTORE_PATH` | Secret 路径 | 本机构建机或受控 CI Runner | 唯一正式 Android keystore 的仓库外路径。 |
| `MEMORY_RECALL_ANDROID_STORE_PASSWORD` | Secret | 本机构建机或 EAS/CI Secret | Android keystore 密码。 |
| `MEMORY_RECALL_ANDROID_KEY_ALIAS` | Secret 元数据 | 本机构建机或 EAS/CI Secret | 正式签名 alias。 |
| `MEMORY_RECALL_ANDROID_KEY_PASSWORD` | Secret | 本机构建机或 EAS/CI Secret | 正式签名 key 密码。 |
| `EXPO_TOKEN` | Secret | EAS/CI Secret | 非交互 EAS CLI 认证；新 CI 尚未配置。 |

## Server 本地与运行时

| 变量 | 类型 | 来源 | 用途 |
| --- | --- | --- | --- |
| `MEMORY_RECALL_LOCAL_TOKEN` | Secret | 本地开发进程环境 | JSON 本地模式的固定测试令牌。 |
| `MEMORY_RECALL_DATA_FILE` | 本地配置 | Server 进程环境 | JSON 本地模式数据文件路径。 |
| `MEMORY_RECALL_DATABASE_URL` | Secret | Server 部署环境 | PostgreSQL 连接串；设置后启用数据库模式。 |
| `MEMORY_RECALL_SESSION_TOKEN_PEPPER` | Secret | Server 部署机密钥管理 | 会话令牌摘要 pepper。 |
| `MEMORY_RECALL_ALLOWED_ORIGINS` | 配置 | Server 部署环境 | 允许的 Web 来源列表。 |
| `MEMORY_RECALL_LISTEN_HOST` | 配置 | Server 部署环境 | API 监听地址。 |
| `MEMORY_RECALL_PORT` | 配置 | Server 部署环境 | API 监听端口。 |
| `MEMORY_RECALL_AMAP_WEB_SERVICE_KEY` | Secret | Server 部署机密钥管理 | 高德 Web 服务地点搜索/反查/转换 Key，不进入客户端。 |
| `MEMORY_RECALL_COS_BUCKET` | 配置 | Server 部署环境 | 私有腾讯云 COS 桶。 |
| `MEMORY_RECALL_COS_REGION` | 配置 | Server 部署环境 | COS 区域。 |
| `MEMORY_RECALL_COS_SECRET_ID` | Secret | Server 部署机密钥管理 | COS 最小权限访问身份。 |
| `MEMORY_RECALL_COS_SECRET_KEY` | Secret | Server 部署机密钥管理 | COS 最小权限访问密钥。 |

## Server 运维、测试与账号管理

| 变量 | 类型 | 来源 | 用途 |
| --- | --- | --- | --- |
| `MEMORY_RECALL_POSTGRES_PASSWORD` | Secret | Compose 部署环境 | Compose 内 PostgreSQL 账号密码。 |
| `MEMORY_RECALL_TEST_DATABASE_URL` | Secret | CI service 或本地测试环境 | PostgreSQL 集成测试专用数据库，禁止指向生产。 |
| `MEMORY_RECALL_INVITED_LOGIN` | 临时敏感值 | 管理员一次性进程环境 | 创建受邀请账号的登录名。 |
| `MEMORY_RECALL_INVITED_PASSWORD` | Secret | 管理员一次性进程环境 | 创建受邀请账号的初始密码，用后立即清除。 |
| `MEMORY_RECALL_API_BIND_HOST` | 配置 | Compose 部署环境 | 宿主机 API 绑定地址。 |
| `MEMORY_RECALL_API_PORT` | 配置 | Compose 部署环境 | 宿主机 API 端口。 |
| `MEMORY_RECALL_PUBLIC_DOMAIN` | 配置 | Compose/Caddy 环境 | 可选公开域名。 |
| `CADDY_EMAIL` | 运维配置 | Compose/Caddy 环境 | TLS 证书联系邮箱。 |

## 注入规则

- Web：只在 `web/.env.local` 或部署平台构建变量中保存公开客户端配置。
- App：公开值进入客户端包；高德 Key、签名密码和 EAS token 仍按敏感凭据管理，禁止提交。
- Server：Secret 只由部署机密钥管理或权限受限的 `server/deploy/.env` 注入。
- CI：PostgreSQL 测试使用临时 service 数据库；生产 Secret 不参与普通验证 workflow。
- 私密空间密码、VMK、账号 bearer token 和用户明文从不属于环境配置，也不得进入日志或交接文档。
