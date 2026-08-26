# 加密与同步冻结规范

状态：冻结（V1）  
生效提交：`ab73e29`（照片同步增量计划修复）  
客户端范围：`projects/memorae/web`、`projects/memorae/app`
服务端范围：`projects/memorae/server`、PostgreSQL、腾讯云 COS

这份规范是跨端兼容边界。后续 UI、地图、照片展示和性能优化不得改变下列协议行为。

## 1. 加密协议

- `cryptoVersion` 固定为 `1`。
- Vault schema 固定为 `memory-recall-vault`。
- 密钥派生固定为 Argon2id：`memoryKiB=65536`、`iterations=3`、`parallelism=1`、`hashLength=32`。
- 对称加密固定为 AES-256-GCM；每次密封使用随机 12 字节 IV，并保留认证标签。
- Vault 使用独立 AAD：`memory-recall:v1:key:vmk`、`memory-recall:v1:key:text`、`memory-recall:v1:key:photo`。
- Memory AAD 必须包含记忆 ID 和版本：`memory-recall:v1:memory:{id}:version:{version}`。
- 照片 metadata/content 使用照片 ID、档位和 part 独立 AAD；`thumbnail`、`preview`、`original` 不能互换解密。
- 服务端和 COS 只接收客户端密文、密文元数据和摘要，不接收或处理 Memory 明文、照片明文或密钥。
- 不得降低 Argon2id 参数来解决性能问题；不得复用 IV、跨档位复用 AAD 或改变密文 JSON 字段含义。

如需改变以上任一项，必须新建协议版本、补 Web↔Mobile 固定向量、提供迁移/回滚方案，并经过单独评审；普通功能提交不得修改冻结常量。

## 2. 照片档位与 COS

- 每张照片最多有三档独立密文：`thumbnail`、`preview`、`original`。
- 默认恢复/解锁只下载 `thumbnail`；`preview` 和 `original` 仅在详情或明确操作时按需下载。
- 下载前必须检查本地对应 `thumbnail` 缓存；已有缓存不得再次发起 COS GET。
- 上传使用客户端直传 COS：客户端向 API 请求 grant，直接 PUT 密文对象，再调用 complete；API 不中转照片字节。
- 服务端默认签名 URL 有效期为 5 分钟，待上传记录有效期为 15 分钟。
- 默认密文内容上限：`thumbnail=2 MiB`、`preview=8 MiB`、`original=64 MiB`。
- 直传必须校验密文长度和 SHA-256；下载必须校验返回长度，并在有摘要时校验 SHA-256。
- Memory 删除或照片删除不得假设 COS 对象已物理删除；孤儿对象 GC 是独立运维流程，不能由普通同步隐式触发全库扫描或删除。

## 3. 上传规则

- 普通新建、编辑、删除只允许提交增量 `UploadPlan`：记忆 ID 集合和照片 `{id, kind}` 集合。
- 只有用户明确触发的全量上传入口才允许读取全部记忆或全部照片引用。
- 新建：上传当前记忆；仅新增照片上传其三档密文。
- 编辑：上传新版本记忆；仅新增照片上传其三档密文。只改文字、日期或地点时不上传照片。
- 删除：只上传递增版本 tombstone，不上传照片。
- 计划必须持久化、合并和去重；App/Web 重启、断网恢复只能继续未确认的计划，不能升级成全库上传。
- 上传顺序固定为：校验同一 Vault → 上传 Vault envelope → 上传记忆密文 → 上传照片密文。
- 单条记忆 HTTP 409 记录为冲突并继续其他记忆；非冲突错误保留计划以便重试。
- 照片上传失败不能回滚已经落盘的记忆，也不能阻断其他记忆上传。

## 4. 下载与版本规则

- 下载先校验本地/远端 Vault 完全一致；不一致立即停止，不合并密钥信封。
- 记忆列表当前是全量密文列表，但按 ID/version 合并；更高版本覆盖本地，更低版本跳过。
- 同版本不同密文视为冲突：跳过该条并继续其他记录，不自动选择本地或远端。
- tombstone 是加密的删除记录，使用更高版本隐藏旧记忆；旧活动版本不得复活 tombstone。
- 记忆密文先落盘并通知读取方；照片 thumbnail 缓存属于后台 best-effort，不能阻塞首页展示。
- 对单条解密失败必须保留其他记忆的下载结果，并记录脱敏诊断；不得因一条坏记录清空整批本地数据。

## 5. 代码与提交保护

- `FROZEN_KDF_DEFAULTS` 和 `FROZEN_PHOTO_TRANSFER_LIMITS` 是冻结常量；修改它们必须同时修改协议版本和本文件。
- Web/Mobile 的加密固定向量、上传计划、下载缓存、冲突、tombstone 测试必须持续通过。
- 服务端 schema、COS object key、照片 grant/complete/download 三步语义属于 V1 兼容面，不得在普通 UI 提交中改名或删除。
- 任何声称“优化同步/照片性能”的提交，都必须证明没有扩大上传/下载对象集合，并提供请求计数或对应回归测试。
