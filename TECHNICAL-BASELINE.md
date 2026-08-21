# Memory Recall 技术基线

> 基线日期：2026-08-21
>
> 基线分支：`codex/cos-direct-transfer`
>
> 用途：架构决策、开发交接、风险排查和后续重大改动的事实底稿。
>
> 范围：`memory-recall-web`、`memory-recall-mobile`、`memory-recall-server` 及当前生产部署。仓库根目录的旧 ThinkPad / Camp Memories 产品不属于 Memory Recall 正式链路。

## 阅读规则

状态只使用以下六种：

| 状态 | 含义 |
| --- | --- |
| `已实现` | 代码存在，且已有测试、构建或实际环境证据支持当前描述。 |
| `部分实现` | 主链路存在，但产品闭环、客户端一致性或验收仍不完整。 |
| `Prototype` | 仅为验证入口、测试壳或技术试验，不是正式产品入口。 |
| `旧代码` | 仍在仓库中，但当前正式入口不使用。 |
| `未实现` | 代码中不存在相应产品能力。 |
| `待验证` | 代码或文档不足以确认，或必须依赖真实数据、真机、线上配置才能确认。 |

证据规则：路径与行号均指本基线日期的固定分支内容；部署事实以
`codex/deployment-pilot-design` 固定 worktree 为准。凡无法从代码、测试、部署记录或本次只读线上观察确认的内容，明确写“无法确认”。生产数据是端到端密文，本报告不记录真实记忆标题、精确地点、照片、账号、令牌或密钥。

# 当前系统真实状态一页摘要

| 范围 | 状态 | 当前真实状态 | 主要证据 |
| --- | --- | --- | --- |
| 生产 Web | `已实现` | `https://memorae.cn/` 已提供账号登录、私密空间解锁、真实记忆足迹地图、筛选、时间轴、详情、创建、编辑、删除和按需照片读取。本次只读观察确认正式页面可打开、解锁后由 Leaflet 渲染，`/health` 返回 `200 {"ok":true}`。 | `memory-recall-web/src/main.tsx:4-25`；`memory-recall-web/src/product/ProductGate.tsx:90-213`；`codex/deployment-pilot-design:DEVELOPMENT.md:63-68` |
| Mobile App | `部分实现` | Expo/RN 加密、SQLite、照片分级、设备解锁和手动同步链路可运行；正式首页、导航、详情、新建/编辑/选点尚未整合成产品 App。 | `memory-recall-mobile/App.tsx:18-58,90-180`；`memory-recall-mobile/app.json:2-49`；`DEVELOPMENT.md:67-102` |
| Mobile 地图 | `Prototype` | 高德 Native SDK 垂直切片和 A/B/C/D 裸图测试包存在；它与正式私密数据和产品 UI 尚未整合。 | `memory-recall-mobile/docs/AMAP-VERTICAL-SLICE.md:1-17`；`memory-recall-mobile/src/map/MapVerticalSliceApp.tsx:47-98`；`DEVELOPMENT.md:44-57` |
| API | `已实现` | Fastify 提供账号会话、钥匙信封、记忆密文、照片授权/直传、地点搜索/反查/转换；生产 API 与 Web 同源。 | `memory-recall-server/src/app.ts:189-311,313-408`；`codex/deployment-pilot-design:memory-recall-server/docs/DEPLOYMENT-RUNBOOK.md:59-71` |
| PostgreSQL | `已实现` | 保存账号、会话、钥匙信封、记忆密文和照片对象元数据；不保存明文 MemoryV2。 | `memory-recall-server/migrations/001_initial.sql:1-54`；`memory-recall-server/src/postgres.ts:243-309` |
| 腾讯云 COS | `已实现` | 私有桶保存三档客户端密文照片；客户端经五分钟签名 URL 直传直下，API 不中转照片字节。 | `memory-recall-server/src/postgres.ts:503-527,569-656`；`codex/deployment-pilot-design:memory-recall-server/docs/DEPLOYMENT-RUNBOOK.md:86-109` |
| 公网部署 | `已实现` | 阿里云轻量服务器运行 Compose PostgreSQL/API；API 仅绑定 `127.0.0.1:8788`；宿主机 Caddy 提供域名、HTTPS、静态 Web 和同源反代。 | `codex/deployment-pilot-design:DEVELOPMENT.md:15-28`；`codex/deployment-pilot-design:memory-recall-server/docs/DEPLOYMENT-RUNBOOK.md:59-71` |
| 备份与监控 | `部分实现` | 首份受保护 PostgreSQL 备份已验收；定时备份安装、加密异地备份、外部告警和隔离恢复演练尚未完整关闭。 | `codex/deployment-pilot-design:memory-recall-server/docs/DEPLOYMENT-RUNBOOK.md:192-247` |
| 坐标正确性 | `部分实现` | 2026-08-21 已从用户解锁后的生产 Web 运行时只读审计全部 17 条记忆：16 条中国地点均为 `provider=amap` 且有高德 `adcode`，按 GCJ-02 使用；1 条日本地点为 `provider=bigdatacloud` 且无 `adcode`，按 WGS-84 使用。当前数据没有发现坐标体系混杂。结构风险仍存在：MemoryV2 没有 `coordinateSystem` 或写入来源字段。 | 运行时审计；`memory-recall-mobile/docs/COORDINATE-CONTRACT.md:12-40`；`memory-recall-web/src/memory/memoryV2.ts:8-33,97-116` |
| 同步 | `部分实现` | Web 已后台自动同步；Mobile 是手动验证壳。协议使用全量密文列表与逐条 revision，不是 cursor 增量同步；删除使用 tombstone。 | `memory-recall-web/README.md:21-27`；`memory-recall-web/src/sync/syncActions.ts:59-172`；`memory-recall-mobile/src/sync/syncActions.ts:45-136` |
| 地图路线决策 | `待验证` | Web 继续使用 Leaflet；App 高德 Native 路线存在拖动卡顿和海外底图不足。MapLibre 仅是候选，尚未采用。是否保留高德为国内渲染、海外改用其他渲染器仍是开放决策。 | `memory-recall-web/src/components/MapView.tsx:445-476`；`DEVELOPMENT.md:44-57`；`memory-recall-mobile/docs/AMAP-VERTICAL-SLICE.md:118-122` |
| 当前首要阻塞 | `部分实现` | P0 是坐标来源可追溯性、生产恢复/备份闭环和同步删除残留；App 产品化及地图渲染路线是后续主要工程项。 | 本报告“风险”和“下一阶段建议”章节 |

## 1. 整体架构

`已实现`：当前生产主链路如下。

```text
Web (Leaflet) ----------------------+
                                     |
Mobile (Expo/RN + SQLite + Native Map) -- HTTPS/Bearer --> Fastify API
                                                        |-- PostgreSQL
                                                        |   账号/会话/钥匙信封/记忆密文/照片元数据
                                                        |-- 腾讯云 COS 私有桶
                                                        |   thumbnail/preview/original 密文字节
                                                        |-- 高德 Web Service
                                                        |   suggest/reverse/convert-gps
                                                        +-- BigDataCloud
                                                            海外 reverse fallback

浏览器/Android -- 五分钟签名 URL -----------------------> COS
公网用户 ------ HTTPS --> 宿主机 Caddy --> 静态 Web / 127.0.0.1:8788 API
```

| 组件 | 状态 | 职责和调用关系 | 证据 |
| --- | --- | --- | --- |
| `memory-recall-web` | `已实现` | 正式 Web、浏览器端解密、IndexedDB、地图和自动密文同步。 | `memory-recall-web/src/main.tsx:4-25`；`memory-recall-web/src/product/ProductGate.tsx:90-213` |
| `memory-recall-mobile` | `部分实现` | 本地加密/SQLite/照片/同步验证壳；Native AMap 是独立垂直切片。 | `memory-recall-mobile/App.tsx:18-58`；`memory-recall-mobile/docs/AMAP-VERTICAL-SLICE.md:1-17` |
| `memory-recall-server` | `已实现` | 鉴权、密文控制面、地点代理、COS 授权；不解密 Memory。 | `memory-recall-server/src/app.ts:189-408` |
| PostgreSQL | `已实现` | 按账号隔离保存认证材料、信封、密文和 COS 引用；不开放公网端口。 | `memory-recall-server/migrations/001_initial.sql:1-54`；部署 runbook `:68-71` |
| COS | `已实现` | 保存客户端加密后的三档照片对象；私有、无匿名读取。 | 部署 runbook `:86-109` |
| Caddy/域名/HTTPS | `已实现` | `memorae.cn` 静态文件与 `/v1/*`、`/health` 同源反代。 | 部署 runbook `:59-71,158-170` |
| 高德 | `部分实现` | Web 栅格瓦片；服务端搜索/反查/坐标转换；Android Native 地图试验。三者不是一个 SDK，也没有统一坐标适配层。 | `memory-recall-web/src/components/MapView.tsx:445-476`；`memory-recall-server/src/location.ts:121-213`；`memory-recall-mobile/docs/AMAP-VERTICAL-SLICE.md:3-17` |
| BigDataCloud | `已实现` | 仅在高德海外反查行政信息不足时由服务端 fallback。 | `memory-recall-server/src/location.ts:170-198,235-276` |

`旧代码`：根目录 `src/`、`camp-memories/`、Supabase/R2 与 ThinkPad 产品代码是另一套历史产品，不属于上述生产链路；不得据此推断 Memory Recall 的存储或部署。证据：`camp-memories/src/supabase.ts:1-31`、`camp-memories/src/App.tsx:1-40`。

`部分实现`：集成分支 `memory-recall-server/docs/DEPLOYMENT-RUNBOOK.md:7-24` 仍描述腾讯云 Lighthouse 和“公网待完成”，与部署分支的阿里云/Caddy生产事实冲突。这是明确的文档债务；生产操作必须以 `codex/deployment-pilot-design` 的 runbook 为准。

## 2. 项目当前状态

| 子系统 | 状态 | 已可用 | 尚缺少/阻塞 |
| --- | --- | --- | --- |
| Web | `已实现` | 账号登录、私密空间、足迹地图、地区/主题筛选、水晶时间轴、简单回忆、详情、新建、编辑、删除、搜索/地图选点、照片按需加载。 | PWA/原生离线体验不是当前目标；历史坐标无法静态审计；生产包仍有单包体积提示。证据：`DEVELOPMENT.md:58-65`、`memory-recall-web/src/App.tsx:907-957`。 |
| App 业务 UI | `部分实现` | 能创建/解锁私密空间、导入导出密文包、创建简单记忆、加密照片、设备解锁、手动同步。 | 正式导航、地图主屏、Memory Detail、Add/Edit、Location Picker 与真实数据联动未完成。证据：`memory-recall-mobile/App.tsx:90-180,245-391`；`DEVELOPMENT.md:67-102`。 |
| App 地图 | `Prototype` | Native MapView、Camera、Bounds、Marker、Cluster、投影、诊断、生命周期、A/B/C/D 基线包。 | 海外底图、持续拖动流畅度、资源释放、正式 UI/密文数据接入未验收。证据：`DEVELOPMENT.md:44-57`；`memory-recall-mobile/docs/AMAP-VERTICAL-SLICE.md:118-122`。 |
| Server | `已实现` | 生产鉴权、密文同步、地点代理、COS 三档直传直下、健康检查。 | 公开注册/账号管理未实现；生产恢复演练和外部告警未完成。证据：`memory-recall-server/README.md:99-152`；部署 runbook `:192-247`。 |

## 3. 数据模型与存储

### 3.1 MemoryV1 / MemoryV2

| 项目 | 状态 | 当前事实 | 证据 |
| --- | --- | --- | --- |
| MemoryV1 | `旧代码` | 旧格式仍可读取，用于历史兼容和跨端夹具。 | `memory-recall-web/src/memory/memoryV1.ts:1-122`；`memory-recall-web/tests/generate-memory-v1-fixture.ts:1-45` |
| MemoryV2 | `已实现` | 明文字段包括 id、title、date、category、tag、pastSelf、presentSelf、pinnedBy、board、location、photos、createdAt、updatedAt。 | `memory-recall-web/src/memory/memoryV2.ts:18-33` |
| 地点 | `部分实现` | location 可含 name/lat/lng/city/country/province/district/adcode/provider/providerId/detail 和版面坐标；没有 `coordinateSystem`。 | `memory-recall-web/src/memory/memoryV1.ts:9-18`；`memory-recall-web/src/memory/memoryV2.ts:8-17,97-116` |
| 版本升级 | `已实现` | 读取时识别 V2，否则按 V1 解析并迁移为 V2；客户端解锁后会用更高密文 version 重写迁移结果。 | `memory-recall-web/src/memory/memoryV2.ts:126-154`；`memory-recall-mobile/App.tsx:150-178` |
| 更高版本迁移框架 | `未实现` | 当前只有 V1→V2，没有通用 schema migration registry。 | `memory-recall-web/src/memory/memoryV2.ts:126-154` |

### 3.2 PostgreSQL

| 表 | 状态 | 服务端可见内容 | 服务端不可见内容 | 证据 |
| --- | --- | --- | --- | --- |
| `accounts` | `已实现` | login name、Argon2id password hash、禁用时间。 | 原始账号密码。 | `memory-recall-server/migrations/001_initial.sql:1-8` |
| `sessions` | `已实现` | token HMAC/hash、device id、到期/撤销时间。 | 原始 bearer token。 | `memory-recall-server/migrations/001_initial.sql:10-21`；`memory-recall-server/src/auth.ts:70-94,144-177` |
| `vault_envelopes` | `已实现` | 完整加密信封 JSON、crypto version。 | 私密空间密码、VMK、text key、photo key 明文。 | `memory-recall-server/migrations/001_initial.sql:23-29` |
| `memory_ciphers` | `已实现` | account id、memory id、revision、deleted、整份 `EncryptedMemoryV1` JSON。 | MemoryV2 标题、正文、地点、照片引用等明文。 | `memory-recall-server/migrations/001_initial.sql:31-43`；`memory-recall-server/src/postgres.ts:262-309` |
| `photo_ciphers` | `已实现` | photo id/kind、加密 metadata、对象 key、长度、SHA-256、ETag、传输状态。 | 图片像素和明文元数据。 | `memory-recall-server/migrations/003_direct_photo_variants.sql:1-68`；`memory-recall-server/migrations/004_photo_content_digest.sql:1-5` |

### 3.3 IndexedDB / SQLite

| 存储 | 状态 | 实际内容 | 证据 |
| --- | --- | --- | --- |
| Web IndexedDB | `已实现` | DB `memory-recall-vmk-prototype`；保存 vault envelope、memory cipher、photo cipher/cache、账号 session、同步队列。名称含 prototype 是历史命名，不代表当前正式 Web 只用原型数据。 | `memory-recall-web/src/prototype/storage.ts:21-61,99-170` |
| Web 账号 session | `已实现` | access token 和 expiresAt 持久化到 IndexedDB；这与部分旧文档中“token 仅内存”的说法不一致。 | `memory-recall-web/src/sync/accountSession.ts:1-22`；`memory-recall-web/src/prototype/storage.ts:26,292-315` |
| Mobile SQLite | `已实现` | DB `memory-recall-vmk.db`；metadata、memory ciphertext、photo encrypted metadata/IV/file reference。照片 ciphertext 字节单独保存在 `encrypted-photos-v1` 文件目录。 | `memory-recall-mobile/src/storage/database.ts:1-13,32-81,155-204` |
| 生产历史坐标内容 | `已实现` | 不能通过 PostgreSQL/IndexedDB 静态读取，但已从解锁后的生产 Web React 运行时取得 17 条显示模型的地点字段并完成只读审计：16 条中国 GCJ-02、1 条日本 WGS-84，未发现混杂。未读取正文、照片二进制或密钥。 | 2026-08-21 生产 Web 只读运行时审计；密文边界见 `memory-recall-web/src/crypto/memoryCipher.ts:36-107` |

## 4. 端到端加密与私密空间

| 环节 | 状态 | 实际链路 | 证据 |
| --- | --- | --- | --- |
| 账号密码 | `已实现` | 只负责服务端身份认证；服务端 Argon2id 校验后发七天 bearer session，可 logout 撤销。它不解密记忆。 | `memory-recall-server/src/auth.ts:70,104-169`；`memory-recall-server/src/app.ts:208-233` |
| 私密空间密码 | `已实现` | 只在客户端用 Argon2id 派生 unlock key；参数默认 64 MiB、3 iterations、parallelism 1。 | `memory-recall-web/src/crypto/vault.ts:153-171` |
| 主密钥链 | `已实现` | 随机 VMK 包装 text key/photo key；unlock key 包装 VMK；均使用 AES-256-GCM 和固定用途 AAD。 | `memory-recall-web/src/crypto/vault.ts:6-10,159-183` |
| 记忆加密 | `已实现` | 整份 Memory JSON 使用 text key 加密；服务端只收到 `EncryptedMemoryV1`。 | `memory-recall-web/src/crypto/memoryCipher.ts:36-107` |
| 照片加密 | `已实现` | metadata 使用 text key，内容使用 photo key；三档分别加密。 | `memory-recall-web/src/crypto/photoCipher.ts:36-89` |
| 本地密钥生命周期 | `已实现` | Web 解锁后的 VMK/text/photo key 只在 JS 内存；锁定时覆盖字节并标记 destroyed。 | `memory-recall-web/src/crypto/vault.ts:201-241` |
| Mobile 设备解锁 | `已实现` | SecureStore 保存随机设备钥匙；设备钥匙 AES-GCM 包装 VMK，VMK 不直接写 SecureStore。 | `memory-recall-mobile/src/services/deviceUnlock.ts:19-87`；`memory-recall-mobile/README.md:12-15` |
| 错误密码判断 | `已实现` | AES-GCM 打开 wrapped VMK 失败统一抛 `VaultUnlockError`；没有把私密空间密码发送给服务器。 | `memory-recall-web/src/crypto/vault.ts:201-227` |
| 新设备登录 | `部分实现` | 登录取得 token→下载 vault envelope→本地输入私密空间密码解锁→下载密文。Web 已形成正式流程；Mobile 仍在验证壳中手动触发。 | `memory-recall-web/src/product/ProductGate.tsx:181-213,337-472`；`memory-recall-mobile/App.tsx:394-572` |
| 多设备信封冲突 | `部分实现` | 客户端以完整 JSON 相等判断；远端与本地信封不同就停止同步。没有信封合并、rekey、密码变更或冲突恢复 UI。 | `memory-recall-web/src/sync/syncActions.ts:44-75,116-126`；Mobile 同逻辑 `:36-67,95-105` |
| 密钥恢复/重置 | `未实现` | 无恢复码、托管恢复密钥或“忘记私密空间密码”解密路径。 | 无对应 endpoint；`memory-recall-server/src/app.ts:208-408` |

## 5. 同步系统

```text
本地明文 MemoryV2
  -> 客户端 AES-GCM 加密并递增 version
  -> 本地保存 ciphertext
  -> PUT /v1/memories/:id
  -> PostgreSQL revision/version 冲突检查

新设备
  -> GET /v1/vault
  -> 本地解锁
  -> GET /v1/memories（全量 ciphertext list）
  -> 按 id/version 合并到本地
  -> 按需要下载照片 ciphertext
```

| 能力 | 状态 | 当前实现 | 证据 |
| --- | --- | --- | --- |
| Web 自动同步 | `已实现` | 创建、更新、删除、解锁和网络恢复触发后台同步；队列以 generation 记录脏状态，失败后约 15 秒重试。 | `memory-recall-web/README.md:21-27`；`memory-recall-web/src/sync/useSilentCipherSync.ts:1-111`；`memory-recall-web/src/sync/syncQueue.ts:1-49` |
| Mobile 同步 | `Prototype` | 同一协议客户端存在，但默认 UI 暴露 server URL/token/login 和手动上传/下载按钮。 | `memory-recall-mobile/App.tsx:68-113,394-572` |
| 增量方式 | `部分实现` | 单条写入，但拉取是 `GET /v1/memories` 全量列表；没有 server cursor、change feed 或分页。 | `memory-recall-server/src/app.ts:289-311`；`memory-recall-web/src/sync/syncClient.ts:126-151` |
| revision | `已实现` | 密文 `version` 映射数据库 `revision`；高 revision 覆盖，低 revision 或同 revision 不同 ciphertext 返回 409。 | `memory-recall-server/src/postgres.ts:262-309` |
| 创建/更新 | `已实现` | 客户端先保存新密文，再逐条幂等 PUT；同一 version 同一 payload 可重复。 | `memory-recall-web/src/sync/syncActions.ts:59-172`；`memory-recall-server/src/postgres.ts:276-309` |
| 删除 | `部分实现` | Memory 使用 `deleted:true` tombstone 并增加 version；照片对象没有与 tombstone 对应的自动回收，可能残留本地/COS 密文。 | `memory-recall-web/src/product/productStore.ts:289-292`；无照片删除 API：`memory-recall-server/src/app.ts:313-408` |
| 冲突处理 | `部分实现` | 同 revision 不同 ciphertext 明确报错，不自动选择时间较新者，也没有用户可视化冲突合并。 | `memory-recall-web/src/sync/syncActions.ts:128-146`；`memory-recall-server/src/postgres.ts:284-309` |
| 离线 | `部分实现` | Web 本地先写、在线后重试；Mobile 本地操作可用但同步需手动。离线队列长期压力和浏览器配额行为未完整验证。 | `memory-recall-web/src/sync/syncQueue.ts:1-49`；`memory-recall-mobile/src/storage/database.ts:92-252` |
| Memory/照片分离 | `已实现` | Memory metadata ciphertext 与三个照片 variant 使用独立 API/COS 对象。 | `memory-recall-server/src/app.ts:289-408` |
| Web/App 协议 | `部分实现` | 密文、vault 和 revision 结构兼容；Web 新设备只预取 thumbnail，Mobile 当前恢复会取 thumbnail/preview/original，导致流量行为不一致。 | `memory-recall-web/src/sync/syncActions.ts:148-172`；`memory-recall-mobile/src/sync/syncActions.ts:107-136` |

## 6. 照片与 COS 链路

| 项目 | 状态 | 当前实现 | 证据 |
| --- | --- | --- | --- |
| 原图 | `已实现` | 保留原始字节，输入限制 30 MiB；只在用户明确查看时下载，Web 默认不落入 96 MiB 小图 cache。 | `memory-recall-web/src/product/productStore.ts:149-216`；`memory-recall-web/src/App.tsx:408-434`；`DEVELOPMENT.md:62-63` |
| preview | `已实现` | 长边最大 1600 px，JPEG quality 0.82；打开当前照片详情时按需下载。 | `memory-recall-web/src/photos/photoVariants.ts:1-45`；`DEVELOPMENT.md:62-63` |
| thumbnail | `已实现` | 长边最大 256 px，JPEG quality 0.72；地图/列表和首次恢复使用。 | `memory-recall-web/src/photos/photoVariants.ts:1-45`；`DEVELOPMENT.md:63` |
| 加密 | `已实现` | 每个 variant 在客户端单独加密后才上传。 | `memory-recall-web/src/crypto/photoCipher.ts:36-89` |
| 直传 | `已实现` | 客户端向 API 请求 grant，直接 PUT COS，再调用 complete；下载同理。API 不经过图片内容流量。 | `memory-recall-server/src/app.ts:345-408`；部署 runbook `:99-109` |
| 签名期限 | `已实现` | upload/download URL 最多五分钟；服务端检查 pending upload、对象长度和摘要/metadata。 | `memory-recall-server/src/postgres.ts:503-527,569-656,687-710` |
| 完整性 | `已实现` | 下载检查 content length，并在提供时校验 SHA-256。 | `memory-recall-web/src/sync/syncClient.ts:202-246` |
| Web cache | `已实现` | IndexedDB 加密小图 cache 上限 96 MiB，按存储时间淘汰；对象 URL 在锁定/清理时 revoke。 | `memory-recall-web/src/prototype/storage.ts:28,220-289`；`memory-recall-web/src/product/photoRegistry.ts:1-39` |
| Bitmap 生命周期 | `部分实现` | Web 关闭 `ImageBitmap` 并撤销 URL；Native marker 有 descriptor cache、裁剪和 recycle，但持续拖动/切后台/销毁重建的真实照片压力测试仍未完成。 | `memory-recall-web/src/photos/photoVariants.ts:31-49`；`memory-recall-web/src/product/photoRegistry.ts:1-39`；`memory-recall-mobile/modules/expo-amap-map/android/src/main/java/expo/modules/amapmap/ExpoAmapMapView.kt:410-577,649-668`；`DEVELOPMENT.md:56-57` |
| 当前流量来源 | `部分实现` | 正常大流量主要是客户端↔COS 的加密 variant；API 只有 JSON、签名和对象 HEAD。Mobile 全量三档恢复仍可能产生不必要流量。真实生产 HAR/账单分项无法确认。 | 部署 runbook `:99-109`；Web/Mobile syncActions 上述证据 |
| COS 孤儿清理 | `未实现` | Memory 删除不自动删除照片对象；CAM 删除权限和过期/孤儿对象清理还未形成产品闭环。 | 部署 runbook `:245-252`；无正式照片 DELETE endpoint |

## 7. 地图和地点系统

### 7.1 Web

| 项目 | 状态 | 当前事实 | 证据 |
| --- | --- | --- | --- |
| 渲染器 | `已实现` | Leaflet 1.9.4；不是 MapLibre。 | `memory-recall-web/package.json:15-28`；`memory-recall-web/src/components/MapView.tsx:1-25` |
| 底图 | `已实现` | 正式足迹地图可在 OSM/CARTO 低缩放底图与高德 `webrd` 国内栅格瓦片之间工作；有 attribution。 | `memory-recall-web/src/components/MapView.tsx:445-476` |
| Marker/聚合 | `已实现` | JS 根据当前记忆和视口生成国家/城市/地点级照片气泡；这是 Web 自有逻辑，不复用 App Native cluster。 | `memory-recall-web/src/components/MapView.tsx:580-930` |
| 地点选取 | `已实现` | 独立 Leaflet 选点页使用高德瓦片；搜索/反查走服务端代理。 | `memory-recall-web/src/components/LocationMapSelection.tsx:70-165` |

### 7.2 App Native AMap

| 项目 | 状态 | 当前事实 | 证据 |
| --- | --- | --- | --- |
| SDK 封装 | `Prototype` | 本地 Expo Module 直接承载 Android AMap `MapView`；组合包版本为 `10.1.200_loc6.4.9_sea9.7.4`。 | `memory-recall-mobile/modules/expo-amap-map/android/build.gradle:20-27`；垂直切片文档 `:3-11` |
| `MapProvider` | `Prototype` | JS 抽象仅转发 move/animate camera、markers、city labels、clusters、经纬度↔屏幕投影和 diagnostics。 | `memory-recall-mobile/src/map/MapProvider.ts:1-42` |
| Camera/Bounds/Zoom | `Prototype` | 原生 camera idle 回传 center/zoom/bounds/diagnostics；JS 不接收每帧 move 事件。 | `memory-recall-mobile/modules/expo-amap-map/src/ExpoAmapMap.types.ts:30-84`；`MapVerticalSliceApp.tsx:157-160` |
| Marker/Cluster | `Prototype` | Kotlin 原生持有 marker、屏幕网格聚类、选中态和 bitmap cache；JS 只在状态变化时提交数据。 | `ExpoAmapMapView.kt:430-760`；`MapVerticalSliceApp.tsx:65-79` |
| 正式数据接入 | `未实现` | 垂直切片使用测试城市/测试 marker，不读取已解锁 MemoryV2 或正式照片同步状态。 | `memory-recall-mobile/src/map/mapTestMarkers.ts:1-41`；`memory-recall-mobile/src/map/MapVerticalSliceApp.tsx:65-69` |
| WorldVector | `Prototype` | `MapsInitializer.loadWorldVectorMap(...)` 已接入并能构建；东京/巴黎/纽约实测普通海外底图仍空白或信息不足。 | `ExpoAmapMapView.kt:210-245`；`DEVELOPMENT.md:56-57` |
| 海外城市标签 | `Prototype` | GeoNames 5,642 城市、约 330 KB、CC BY 4.0；有视野/zoom/碰撞/120 上限，但产品规则数次调整且最终验收未闭环。后续“全部不加载”性能包也不代表产品永久删除。 | `memory-recall-mobile/docs/AMAP-VERTICAL-SLICE.md:51,95-103,122`；`DEVELOPMENT.md:46-55` |
| 地图与地点服务耦合 | `部分实现` | 渲染与搜索/reverse 技术上分离：Native Map 不调用原生搜索/reverse；正式地点仍应走服务端。当前没有统一 `CoordinateAdapter`，坐标语义仍由各入口自行承担。 | `MapVerticalSliceApp.tsx:376-378`；`memory-recall-mobile/docs/COORDINATE-CONTRACT.md:29-36` |

### 7.3 A/B/C/D 性能基线

| 测试 | 状态 | 容器 / 世界地图 | 已确认结果 |
| --- | --- | --- | --- |
| A | `Prototype` | RN / OFF | APK 已生成；用于测 RN 容器下普通国内底图。没有完整可复现 FPS/手势时序记录，结论无法确认。 |
| B | `Prototype` | RN / ON | APK 已生成；用于对比 WorldVector 额外负担。量化差值无法确认。 |
| C | `Prototype` | 纯原生 Activity / OFF | 初版闪退已修复，`NativeMapActivity` 直接作为 Launcher 后重建；完整持续拖动数据无法确认。 |
| D | `Prototype` | 纯原生 Activity / ON | APK 已生成；用于测纯原生 + WorldVector。完整持续拖动数据无法确认。 |

共同证据：`DEVELOPMENT.md:44-46`；`memory-recall-mobile/test-apks/`。`已实现` 的单次证据是 100 测试点聚合为 19 个原生 marker、camera idle 约 120 fps/slow 0；它只证明空闲采样，不证明长时间手势流畅。证据：`DEVELOPMENT.md:56`。用户真机感知为拖动仍明显卡顿，且移除照片 Marker、cluster、海外城市名称后仍存在，因此这些叠加层已不是唯一原因；但缺少 Perfetto/GPU frame timeline，不能据此断言 RN、WorldVector、设备刷新率或高德 SDK 中哪一项是根因。

`待验证`：MapLibre 目前只是候选。仓库没有 MapLibre 依赖、实现或正式 ADR；不得写成已采用。高德搜索和 reverse 可继续作为服务端地点能力，不要求与未来地图渲染器绑定。

## 8. 坐标体系审计（重点）

### 8.1 目标契约与结构缺口

| 结论 | 状态 | 说明 | 证据 |
| --- | --- | --- | --- |
| 目标契约 | `部分实现` | 中国大陆地点使用 GCJ-02；海外使用 WGS-84。它是设计契约，不是所有历史记录已满足的证明。 | `memory-recall-mobile/docs/COORDINATE-CONTRACT.md:12-28` |
| MemoryV2 | `部分实现` | location 有 lat/lng/provider 等，但没有 `coordinateSystem`、原始坐标、转换时间或转换版本。 | `memory-recall-web/src/memory/memoryV2.ts:8-33` |
| 当前生产数据 | `已实现` | 解锁后的生产 Web 运行时共审计 17 条：16 条中国记录均带 `provider=amap` 和 `adcode`，1 条日本记录带 `provider=bigdatacloud` 且无 `adcode`；结合当前写入链路，分别按 GCJ-02 和 WGS-84 使用。当前样本没有发现混合坐标。 | 2026-08-21 生产 Web 只读运行时审计；入口语义见下表 |

### 8.2 每个写入入口实际行为

| 入口 | 状态 | 输入 → 当前处理 → 写入坐标 | 结论 |
| --- | --- | --- | --- |
| 照片 EXIF | `部分实现` | EXIF GPS 通常是 WGS-84；Web 调 `/v1/location/convert-gps`，服务端调用高德 `coordinate/convert?coordsys=gps` 后保存返回值。 | 中国大陆路径会写 GCJ-02。海外照片也走同一转换，海外是否原样保持 WGS-84 无真实三城市测试，无法确认。证据：`memory-recall-web/src/lib/locationApi.ts:81-89`；`memory-recall-server/src/location.ts:201-213`；坐标契约 `:40-47`。 |
| 高德搜索候选 | `已实现` | 服务端返回高德 inputtips/POI 坐标，Web 直接保存 candidate lat/lng。 | 中国大陆候选按高德语义为 GCJ-02。证据：`memory-recall-server/src/location.ts:121-168`；`memory-recall-web/src/lib/geo.ts:246-346`。 |
| `/reverse` | `已实现` | 输入坐标不转换，原样发给高德；高德海外信息不足时，把同一坐标交给 BigDataCloud。 | `/reverse` 只补地点名称，不是坐标纠偏接口。证据：`memory-recall-server/src/location.ts:170-198,235-276`。 |
| Web 地图点击 | `已实现` | Leaflet `event.latlng` 直接保存，只把经度归一到 `[-180,180]`；随后以同一坐标 reverse。地点选择器显示的是高德 GCJ-02 瓦片，点击瓦片中中国地点时，Leaflet 返回该高德瓦片坐标平面上的 GCJ-02 落点，因此不应再次调用 WGS-84→GCJ-02 转换。 | 当前中国地图点击写入按 GCJ-02 使用。证据：`memory-recall-web/src/components/LocationMapSelection.tsx:70-90,144-184`；高德瓦片路径 `:82-86`。 |
| Android 高德地图点击 | `Prototype` | Native Map 返回高德地图坐标；契约约定境内不二次转换、再走服务端 reverse。 | 境内预计是 GCJ-02；但当前垂直切片没有把点击结果持久化到 MemoryV2，不能作为正式写入事实。证据：坐标契约 `:20-36`；`MapVerticalSliceApp.tsx:197-243`。 |
| 旧数据导入/V1→V2 | `部分实现` | 迁移原样复制 `memory.location`。 | 不会自动识别或修复旧坐标系。证据：`memory-recall-web/src/memory/memoryV2.ts:126-145`。 |

### 8.3 可以确认与不能确认

`已实现`：可以确认代码路径中 `/convert-gps` 是唯一显式 WGS-84→高德转换；`/reverse` 不转换；Web map click 不做数值转换，但中国地点是在高德 GCJ-02 瓦片坐标平面上选取并直接保存；MemoryV2 没有坐标系字段。

`已实现`：经用户明确授权，已从解锁后的生产页面 React 运行时读取全部 17 条显示模型的地点字段。结果为 16 条中国 GCJ-02、1 条日本 WGS-84，没有发现坐标体系混杂。审计依据包括 `provider`、`adcode`、国家字段、坐标精度形态和当前生产写入路径；报告不保存记忆 ID、标题、精确地点或经纬度。

`待验证`：海外 EXIF 经高德 `/convert-gps` 后是否在所有国家严格保持 WGS-84，仍缺少真实服务覆盖测试；未来从旧版本、手工导入或尚未接入的 Mobile UI 写入的数据，也不能只靠当前 17 条样本推断。

`未实现`：不得对当前 16 条中国记录批量执行 WGS-84→GCJ-02。它们已经按 GCJ-02 使用，再次转换会造成二次偏移。

## 9. Web 前端实现

| 功能 | 状态 | 当前事实 | 证据 |
| --- | --- | --- | --- |
| 入口/路由 | `已实现` | 单页 Vite 入口默认渲染 `ProductGate`；没有业务路由器。开发环境 query 才能进入两个 prototype。 | `memory-recall-web/src/main.tsx:1-25` |
| 登录/私密空间 | `已实现` | Figma 登录与解锁状态已接入真实认证和本地解锁链路。 | `DEVELOPMENT.md:59-61`；`ProductGate.tsx:337-508` |
| 足迹地图 | `已实现` | 正式解锁后强制 `viewMode='places'`，地图层是当前主 UI。 | `memory-recall-web/src/App.tsx:179,907-945` |
| 水晶时间轴/简单回忆 | `已实现` | 正式地图页使用 `CrystalTimeline` 和 `SimpleRecallV2`。 | `memory-recall-web/src/App.tsx:907-945` |
| 详情/编辑/删除 | `已实现` | 地图 overlay 内查看和编辑，删除写 tombstone；不再跳旧后台式编辑页。 | `DEVELOPMENT.md:64-65`；`memory-recall-web/src/components/MapMemoryOverlay.tsx:1-420` |
| 地区/主题筛选 | `已实现` | 当前结果驱动国家/城市/主题筛选和地图下钻。 | `memory-recall-web/src/lib/memoryFilters.ts:1-75`；`memory-recall-web/src/App.tsx:180-260` |
| 旧 board/timeline/detail | `旧代码` | `TimelineView`、`MemoryDetailPanel`、旧 board 和 `AddMemoryDialog` 仍被编译，但正式 places 入口不可达。 | `memory-recall-web/src/App.tsx:179,493-957` |
| 开发验证入口 | `Prototype` | `?dev-vault=1`、`?crystal-timeline=1` 只在 `import.meta.env.DEV` 生效。 | `memory-recall-web/src/main.tsx:7-20` |
| Figma 对应 | `部分实现` | Web 登录、解锁、地图详情等已落地；完整 Figma 页面覆盖矩阵没有单一可机读清单，未列出的设计稿与代码对应关系无法确认。 | `DEVELOPMENT.md:59-65` |

`部分实现`：生产页面 `<title>` 仍含“VMK 原型”字样，这是旧命名债务，不代表当前正式入口是 prototype。运行时观察与 `memory-recall-web/index.html:1-12` 一致。

## 10. Mobile App 实现

| 项目 | 状态 | 当前事实 | 证据 |
| --- | --- | --- | --- |
| 技术栈 | `已实现` | Expo 57.0.15、React Native 0.86.2、Hermes、New Architecture。 | `memory-recall-mobile/package.json:5-21`；`memory-recall-mobile/docs/AMAP-VERTICAL-SLICE.md:7-11` |
| 标识/SDK | `部分实现` | Android 包名 `com.memorae.cn`；iOS bundle id 仍为 prototype 命名。compile/target/min SDK 由 Expo prebuild 当前解析为 36/36/24，但生成 `android/` 被忽略，升级后需重新核验。 | `memory-recall-mobile/app.json:10-23`；`DEVELOPMENT.md:53-57` |
| Native Module | `Prototype` | `modules/expo-amap-map` 提供 Native View、命令和事件；只为 Android 地图路线验证。 | `memory-recall-mobile/modules/expo-amap-map/src/ExpoAmapMapView.tsx:1-19`；`memory-recall-mobile/modules/expo-amap-map/src/ExpoAmapMap.types.ts:1-111` |
| SQLite/照片 | `已实现` | 密文记忆入 SQLite，照片 ciphertext 放 app 私有文件目录，元数据/IV/路径入 SQLite。 | `memory-recall-mobile/src/storage/database.ts:12-81,155-204` |
| 登录/解锁 | `部分实现` | 账号登录、私密密码和设备钥匙解锁均有功能，但 UI 是工程验证壳。 | `memory-recall-mobile/App.tsx:90-180,394-572` |
| Map | `Prototype` | 高德垂直切片独立入口，未接正式 Memory。 | `memory-recall-mobile/docs/AMAP-VERTICAL-SLICE.md:1-17` |
| Memory Detail | `Prototype` | 默认壳有简易选中/阅读视图；不是已确认的 Canonical Figma 实现。 | `memory-recall-mobile/App.tsx:680-706`；`DEVELOPMENT.md:67-76` |
| Add/Edit/Edit Place | `部分实现` | 默认壳可创建简单记忆和照片；正式 Add/Edit/Location Picker 未实现。旧 `Edit Place` 设计已废弃。 | `memory-recall-mobile/App.tsx:245-391`；`DEVELOPMENT.md:67-76,96-102` |
| Figma | `部分实现` | Mobile Home Canonical、Create Memory、Detail/Edit、Location Picker 有已确认设计方向；大部分仍是设计稿，没有对应正式 App 代码。 | `DEVELOPMENT.md:67-102` |

## 11. 后端与 API

除 `/health` 和 PostgreSQL 模式下的 login 外，`已实现` 的接口都要求 `Authorization: Bearer <token>`；认证 hook 见 `memory-recall-server/src/app.ts:189-206`。

| Endpoint | 状态 | 输入 → 输出 | 当前调用方 |
| --- | --- | --- | --- |
| `GET /health` | `已实现` | 无输入 → `{ok:true}`；生产实现是数据库感知 readiness。 | Caddy/部署检查/人工检查。`app.ts:189`；部署 runbook `:68-71` |
| `POST /v1/auth/login` | `已实现` | loginName/password/deviceId → accessToken/expiresAt。 | Web 正式入口、Mobile 验证壳。`app.ts:208-221` |
| `POST /v1/auth/logout` | `已实现` | bearer → 204 并撤销 session。 | Web、Mobile。`app.ts:224-233` |
| `GET /v1/location/suggest` | `已实现` | `q`,`adcode?` → 地点候选数组。 | Web LocationPicker；Mobile 正式 UI 尚未调用。`app.ts:240-250` |
| `GET /v1/location/reverse` | `已实现` | `lat`,`lng` → 行政地点或 null。 | Web EXIF/地图选点；Mobile 正式 UI 尚未调用。`app.ts:252-262` |
| `POST /v1/location/convert-gps` | `已实现` | `{lat,lng}` → 高德坐标。 | Web EXIF；Mobile 正式 UI 尚未调用。`app.ts:264-274` |
| `PUT /v1/vault` | `已实现` | VaultEnvelopeV1 → 204。 | Web/Mobile sync client。`app.ts:276-281` |
| `GET /v1/vault` | `已实现` | 无 body → envelope 或 404。 | Web/Mobile 新设备恢复。`app.ts:283-287` |
| `PUT /v1/memories/:id` | `已实现` | EncryptedMemoryV1 → 204/409。 | Web/Mobile。`app.ts:289-307` |
| `GET /v1/memories` | `已实现` | 无 cursor → 全量 `{items}`。 | Web/Mobile。`app.ts:309-311` |
| `PUT/GET /v1/photos/:id` | `旧代码` | 整份 EncryptedPhotoV1 经 API/PostgreSQL。 | 仅无 `photoTransfer` 的本地/协议回归；生产 COS 模式不注册。`app.ts:313-343` |
| `POST .../:kind/upload` | `已实现` | 加密 metadata/长度/摘要 → 短期 PUT grant。 | Web/Mobile COS client。`app.ts:345-371` |
| `POST .../:kind/complete` | `已实现` | uploadId → 204。 | Web/Mobile COS client。`app.ts:373-394` |
| `GET .../:kind/download` | `已实现` | photo id/kind → 短期 GET grant。 | Web/Mobile COS client。`app.ts:396-408` |
| 公开注册/密码重置/账号管理 | `未实现` | 无 endpoint。邀请账号由管理员命令创建。 | `memory-recall-server/README.md:145-146` |
| sync cursor/分页/批量 changes | `未实现` | 无 endpoint。 | `app.ts:289-311` |

## 12. 构建、配置和部署

| 项目 | 状态 | 当前方式/约束 | 证据 |
| --- | --- | --- | --- |
| Web 本地 | `已实现` | `npm install`、`npm run dev`；用 `VITE_MEMORY_RECALL_API_URL` 指向 API。未配置时保持纯离线。 | `memory-recall-web/README.md:7-24` |
| Web 验证 | `已实现` | `npm run verify` 包含测试、类型检查、生产构建。 | `memory-recall-web/package.json:6-14` |
| Mobile Development Build | `已实现` | Expo prebuild/run Android；高德只能用 Android Development/Release Build，不能 Expo Go/Web。 | `memory-recall-mobile/README.md:42-45`；垂直切片文档 `:21-45` |
| Android debug/standalone | `Prototype` | `standalone` 嵌 JS、非调试运行但沿用 debug 签名，仅供真机性能验收。 | `DEVELOPMENT.md:53` |
| Android release | `部分实现` | 四个 `MEMORY_RECALL_ANDROID_*` 签名变量缺一即失败；正式 AAB 未创建/发布。 | `memory-recall-mobile/README.md:60-64` |
| 高德 Android Key | `已实现` | 只在 prebuild 时从 `MEMORY_RECALL_AMAP_ANDROID_KEY` 注入生成项目；不能提交 Git，需匹配包名与证书 SHA-1。 | `memory-recall-mobile/app.json:43-49`；垂直切片文档 `:21-31` |
| Server 本地 | `已实现` | 可用 local token + JSON 回归；设置 database URL 后切 PostgreSQL，地点 Key 与 COS 配置均只在服务端环境。 | `memory-recall-server/README.md:7-95` |
| Server 生产 | `已实现` | `/srv/thinkpad` 部署分支；Compose PostgreSQL/API，宿主机 Caddy，静态 Web `/var/www/memorae`。 | 部署 runbook `:59-71,158-189` |
| 环境隔离 | `部分实现` | 本地可纯离线/JSON；测试可临时 PostgreSQL/对象服务；生产强制 PostgreSQL/COS/HTTPS。完整 staging 环境无法确认。 | `memory-recall-server/src/index.ts:20-98`；部署 runbook `:86-101` |
| Secret | `已实现` | DB 密码、session pepper、COS Secret、账号密码、私密空间密码、Android keystore/密码、高德 Key 均不得进 Git。 | `memory-recall-server/README.md:47-91`；`memory-recall-mobile/README.md:60-64` |

`部分实现`：集成分支部署说明和当前生产部署分支不一致。任何生产变更前必须先同步/核对部署分支；不要照集成分支旧 runbook 新建腾讯云 Lighthouse 或 Compose Caddy。

## 13. 关键依赖与第三方服务

| 依赖/服务 | 状态 | 版本/用途 | License / Attribution 状态 |
| --- | --- | --- | --- |
| Expo / RN | `已实现` | Expo `~57.0.15`、RN `0.86.2`。 | 依赖许可证随上游；正式分发清单是否自动汇总无法确认。`memory-recall-mobile/package.json:5-21` |
| Leaflet | `已实现` | `^1.9.4`，Web 地图渲染。 | BSD-2-Clause；代码已保留底图 attribution。`memory-recall-web/package.json:15-28`；`MapView.tsx:445-476` |
| 高德 | `部分实现` | Web 瓦片、服务端 Web Service、Android Native SDK。 | 商业使用条款、配额、隐私合规和 attribution 需按实际高德账号/合同持续核验；合同状态无法从仓库确认。 |
| BigDataCloud | `已实现` | 海外 reverse fallback，无 Key 路径。 | 实际服务条款、限额和生产 attribution 要求无法从仓库确认。`memory-recall-server/src/location.ts:235-276` |
| 腾讯云 COS | `已实现` | `cos-nodejs-sdk-v5 ^3.0.0`，私有加密照片对象。 | 桶策略/费用告警属于运维；实时配置无法从 Git 单独确认。`memory-recall-server/package.json:19-24` |
| PostgreSQL | `已实现` | `pg ^8.16.3`；生产记录为 PostgreSQL 17.6。 | PostgreSQL License。`memory-recall-server/package.json:19-24`；部署 runbook `:245-248` |
| Fastify | `已实现` | `^5.11.3`。 | MIT。`memory-recall-server/package.json:19-24` |
| GeoNames | `Prototype` | `cities15000` 裁剪 5,642 城市，约 330 KB。 | CC BY 4.0 attribution 已写入生成文件；若正式使用必须在产品/分发中保留。`memory-recall-mobile/src/map/generated/overseasCityData.ts:1-3`；垂直切片文档 `:51` |
| MapLibre | `待验证` | 仅候选，仓库无依赖和实现。 | 采用前需评估 SDK license、地图数据/字体/样式/瓦片授权与 attribution。 |

## 14. 性能现状

| 项目 | 状态 | 事实与边界 | 证据 |
| --- | --- | --- | --- |
| Web 生产地图 | `已实现` | 真实页面可正常打开和交互；未建立长期 FPS、内存和大数据量基准。 | 本次只读运行时观察；代码 `MapView.tsx:445-930` |
| Web Retina 瓦片 A/B | `Prototype` | `?map-retina=1` 仅对正式 `MapView` 高德图层启用 Leaflet `detectRetina`；默认关闭，地点选择器不变。高 DPR 自动化已确认相同初始层级下瓦片请求从 `z=4` 提升到 `z=5`；清晰度、手势性能和流量增幅仍待真机对照。 | `memory-recall-web/src/lib/mapTileQuality.ts:1-5`；`memory-recall-web/src/components/MapView.tsx:424-491` |
| App 地图 FPS | `部分实现` | 100 点 idle 样本约 120 fps/slow 0；用户持续拖动仍感觉卡。idle 指标不能替代 gesture frame timeline。 | `DEVELOPMENT.md:56` |
| Marker/Cluster 排除 | `部分实现` | 已构建关闭全部照片 marker/cluster/海外名称的纯底图包，卡顿仍存在；说明叠加层不是唯一原因，但根因未定位。 | `DEVELOPMENT.md:46`；用户真机反馈 |
| 高德原生裸图 | `Prototype` | C/D 建立了纯 Native Activity 基线；缺少同设备、同 camera path、同采样工具的量化 A/B/C/D 报告。 | `DEVELOPMENT.md:44-46` |
| thumbnail | `已实现` | Web/Mobile 都生成 256 px 档；Native 测试壳只选/生成 thumbnail，不读 preview/original。 | 两端 `photoVariants.ts:1-45`；`MapVerticalSliceApp.tsx:114-146` |
| Bitmap/cache | `部分实现` | 有显式 cache/recycle/上限，但真实照片长时间拖动、前后台和销毁重建仍待压测。 | `memory-recall-mobile/modules/expo-amap-map/android/src/main/java/expo/modules/amapmap/ExpoAmapMapView.kt:410-577,649-668`；`DEVELOPMENT.md:56-57` |
| COS 流量 | `部分实现` | Web 已改为首次仅 thumbnail、详情 preview、显式 original；真实生产 HAR/账单复核尚未记录为闭环。Mobile 恢复仍全档。 | `DEVELOPMENT.md:62-63`；两端 syncActions |

## 15. 已知 Bug、技术债与风险

| 严重度 | 类别 | 状态 | 风险 | 证据/影响 |
| --- | --- | --- | --- | --- |
| P1 | 数据正确性/坐标 | `部分实现` | 当前 17 条生产数据已审计且未发现混杂，但 MemoryV2 无 `coordinateSystem`、source、原始坐标或转换版本；未来导入和新客户端入口缺少可追溯性。对现有中国记录再次转换会造成二次偏移。 | 坐标审计章节 |
| P0 | 恢复/运维 | `部分实现` | 自动备份、加密异地副本、外部告警、隔离 restore drill 未完整验收。单机故障可能造成不可恢复停机。 | 部署 runbook `:192-247` |
| P0 | 安全/滥用 | `部分实现` | COS 签名限制对象和时效，但不能强制实际 PUT 大小；未来公开注册前缺 quota/rate limit。 | 部署 runbook `:19-21,245-252` |
| P1 | 同步 | `部分实现` | 全量 list 无 cursor/分页，数据增长后启动和恢复成本线性增加。 | `memory-recall-server/src/app.ts:309-311` |
| P1 | 删除 | `未实现` | Memory tombstone 不回收照片密文，形成 COS 孤儿和持续成本。 | 无照片 DELETE API；sync 删除链路 |
| P1 | 多设备密钥 | `部分实现` | vault envelope 不一致直接报错，无 rekey/恢复/冲突 UX。 | 两端 `syncActions.ts` 的 `sameVault` |
| P1 | 地图性能 | `待验证` | App 纯底图仍感知卡顿，缺 Perfetto/GPU frame timeline，当前不能归因。 | 性能章节 |
| P1 | 海外地图 | `部分实现` | AMap WorldVector 海外信息不足；GeoNames 只补标签，不补道路/行政底图。 | 垂直切片文档 `:118-122` |
| P1 | 客户端差异 | `部分实现` | Mobile 恢复下载三档照片，Web 按需下载，真实流量和恢复耗时不一致。 | 同步章节 |
| P2 | Web 存储安全 | `部分实现` | bearer token 持久化 IndexedDB，遭 XSS 时可被读取；旧文档若称仅内存会误导威胁模型。 | `memory-recall-web/src/sync/accountSession.ts:1-22`；`memory-recall-web/src/prototype/storage.ts:292-315` |
| P2 | 架构债务 | `旧代码` | Web 正式入口仍编译旧 board/timeline/detail；增大认知和包体，容易误改。 | `memory-recall-web/src/App.tsx:493-957` |
| P2 | 命名债务 | `旧代码` | IndexedDB、页面标题和部分文档仍含 prototype；会误导交接，但不代表数据不正式。 | `storage.ts:21-28`；`memory-recall-web/index.html:1-12` |
| P2 | 部署文档 | `旧代码` | 集成分支 runbook 与实际阿里云/宿主 Caddy 拓扑冲突。 | 架构章节 |
| P2 | 产品落地 | `未实现` | Mobile Canonical Figma 大部分未进入正式 App。 | `DEVELOPMENT.md:67-102` |

## 16. 当前技术决策记录

### 已冻结或当前必须保持

| 决策 | 状态 | 当前依据 |
| --- | --- | --- |
| 服务器不保存 Memory 明文 | `已实现` | E2EE 协议、PostgreSQL schema 和客户端 cipher 已形成跨端兼容基础；部署变化不得改变密文协议。证据：`memory-recall-server/docs/DEPLOYMENT-PILOT.md:28-30,97`。 |
| 照片使用私有 COS | `已实现` | 大对象与 PostgreSQL 分离，客户端直传直下，API 只做控制面。证据：同文档 `:20-30`。 |
| 账号密码与私密空间密码分离 | `已实现` | 账号用于服务端 session，私密密码只在客户端解锁。证据：加密章节。 |
| Android 正式包名/唯一签名 | `已实现` | `com.memorae.cn`，release 缺正式签名环境变量即失败；不得生成第二套签名。证据：`memory-recall-mobile/README.md:60-64`。 |
| 当前客户端继续 RN | `部分实现` | 现有 App 基于 Expo/RN，Native 能力通过 Expo Module 补齐。仓库没有 Flutter 迁移 ADR；除“避免重写现有加密/同步链路”外，更完整的 RN-vs-Flutter决策依据无法确认。 |

### 开放决策

| 决策 | 状态 | 当前边界 |
| --- | --- | --- |
| Web 与 App 是否使用同一地图渲染器 | `待验证` | 当前已经不同：Web Leaflet，App 测试 AMap Native。业务协议可共享，渲染器不必强行一致。 |
| App 高德 Native 是否继续作为主地图 | `待验证` | 需先完成可复现的 A/B/C/D frame trace；WorldVector/海外底图和持续拖动均未闭环。 |
| MapLibre | `待验证` | 只作为候选；必须先验证国内坐标适配、瓦片/样式来源、离线包、中文标注、license 和真机性能。 |
| GeoNames 城市层 | `Prototype` | 只解决海外中文城市标签，不解决底图；是否进入产品取决于最终渲染器与 attribution 方案。 |
| 同步 cursor/照片 GC | `未实现` | 数据规模增长前需设计，但不得把建议写成当前协议。 |

## 17. 下一阶段建议（与事实报告分离）

### P0

| 建议 | 原因 | 完成标准 |
| --- | --- | --- |
| 固化生产恢复审计结果并禁止坐标批量转换 | 当前 17 条已经确认中国 GCJ-02、海外 WGS-84；误执行转换会破坏现有正确数据。 | 为当前数据生成不含正文/照片的本地审计摘要；迁移脚本默认只报告、不改坐标；任何转换必须有逐条来源证据。 |
| 关闭生产恢复闭环 | E2EE 无法弥补数据库/COS 运维丢失。 | 定时备份已安装、异地副本加密、外部告警可触发、隔离环境完成 PostgreSQL+COS 引用恢复演练并留记录。 |
| 为 COS 授权增加配额与滥用控制 | 签名 URL 不能保证实际上传大小，未来账号扩展会形成费用风险。 | 账号级限额、频率限制、完成校验、过期 pending 与孤儿对象清理均有监控和测试。 |

### P1

| 建议 | 原因 | 完成标准 |
| --- | --- | --- |
| 为新写入增加坐标 provenance | 当前数据正确，但 MemoryV2 无法说明坐标从 EXIF、搜索还是地图点击产生，未来导入和新客户端仍可能重新引入歧义。 | 新写入明确 `coordinateSystem`、source、original coordinates、conversion version；V1/V2 历史记录保持原值，不自动重算。 |
| 用 Perfetto/GPU Frame Timeline 重跑 A/B/C/D | 当前只有主观卡顿与 idle FPS，无法选择 SDK。 | 同一 ARM64 真机、同一路径、同一时长，记录 frame time、jank、CPU/GPU、内存、GC；A/B/C/D 可横向比较。 |
| 做地图渲染器决策 spike | 海外底图不足与拖动卡顿均未解决，继续堆业务层会混淆根因。 | 高德 Native 与 MapLibre 候选使用同一 100/1000 点、国内/海外、WGS/GCJ、前后台测试矩阵，形成 ADR。高德搜索/reverse 独立保留。 |
| 对齐 Web/Mobile 照片恢复策略 | Mobile 全档恢复会放大 COS 流量和首登时间。 | 两端默认只恢复 thumbnail，preview/original 按需；并发复用、缓存上限和失败重试一致。 |
| 设计照片垃圾回收和 sync cursor | 避免 COS 永久残留和全量同步线性退化。 | tombstone 保留期、设备确认、水位/cursor、对象引用计数或 GC 作业有协议、迁移和回归测试。 |
| 将 Mobile Canonical UI 接入真实加密数据 | 当前 App 仍是验证壳，无法进行真实产品测试。 | 正式导航、Home Map、Detail、Add/Edit、Location Picker 使用 SQLite+sync 的真实 MemoryV2；测试入口与产品入口明确隔离。 |

### P2

| 建议 | 原因 | 完成标准 |
| --- | --- | --- |
| 清理或隔离 Web 旧 UI | 降低包体、误改和交接成本。 | 证明正式入口无引用后移入明确 legacy 区或删除，并保留必要迁移测试。 |
| 修正文档/命名漂移 | 当前 runbook、页面 title、IndexedDB 名称会误导开发者。 | 生产拓扑只有一份权威 runbook；title 不再含 prototype；DB 名称若迁移必须原位升级而非丢数据。 |
| 建立第三方许可清单 | 地图、GeoNames、字体和瓦片均有展示/分发要求。 | 发布产物含可审计 license/attribution 清单，账号合同/配额负责人明确。 |

## 18. 无法确认清单

以下全部为 `待验证`，不得在后续文档中改写成事实，除非补充新的可复现证据：

1. 当前 17 条记录是否曾在更早版本中发生过坐标转换后再被覆盖；现值的坐标语义已经确认，但 MemoryV2 没有保存完整处理历史。
2. 海外 EXIF 坐标经过高德 `/convert-gps` 后是否在所有国家严格保持 WGS-84。
3. A/B/C/D 在同一真机持续拖动下的量化性能差异，以及卡顿的单一根因。
4. 高德、BigDataCloud、MapLibre 候选和底图数据源的实际商业合同、配额、地域合规与最终 attribution 要求。
5. 定时生产备份、加密异地复制、外部告警、隔离 restore drill 是否已在本基线之后完成。
6. 真实 COS 账单中 thumbnail/preview/original、失败重试和孤儿对象各自占比。
7. 第二台真实设备和 Android 正式产品 UI 的完整公网恢复、冲突、离线和照片压力表现。
8. 未建立代码/Figma 全量映射表的页面是否还有已完成设计但未在 `DEVELOPMENT.md` 登记。

## 19. 维护规则

`已实现`：今后涉及加密协议、Memory schema、同步冲突、坐标契约、地图渲染器、生产拓扑或照片存储的重大改动，应在同一提交中更新本文件，并给出新代码/迁移/验收证据。只更新计划而未落地的内容必须保留为 `未实现`、`Prototype` 或 `待验证`；不得提前改成 `已实现`。
