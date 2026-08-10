# Memory Recall · MemoryV1 数据契约

> 状态：V1 已冻结
>
> 业务结构版本：`schemaVersion: 1`
>
> 加密协议版本：`cryptoVersion: 1`

`schemaVersion` 描述解密后的记忆 JSON；`cryptoVersion` 描述外层密文协议。两者必须独立演进，客户端不得用其中一个替代另一个。

## JSON 结构

```ts
interface MemoryV1 {
  schemaVersion: 1;
  id: string;
  title: string;
  text: string;
  date: string;
  tags: string[];
  location: {
    name: string;
    city?: string;
    country?: string;
    lat?: number;
    lng?: number;
  } | null;
  photos: Array<{
    id: string;
    mimeType: string;
  }>;
  createdAt: string;
  updatedAt: string;
}
```

## 字段约束

| 字段 | 含义与约束 |
|---|---|
| `schemaVersion` | 必须为数字 `1`；未知版本必须明确失败。 |
| `id` | 非空记忆 ID，同时参与记忆密文 AAD。 |
| `title` | 非空标题，属于私人明文。 |
| `text` | 正文，可以为空字符串，属于私人明文。 |
| `date` | `YYYY-MM-DD` 格式的有效日历日期。 |
| `tags` | 非空字符串数组；V1 不自动改写标签内容。 |
| `location` | 可以为 `null`；存在时 `name` 必填，经纬度范围分别为 `[-90, 90]` 与 `[-180, 180]`。 |
| `photos` | 照片引用数组；同一记忆内 `id` 不得重复。照片原始字节不进入 Memory JSON。 |
| `photos[].mimeType` | 非空 MIME 类型，例如 `image/jpeg`；作为私人元数据随 Memory JSON 加密。 |
| `createdAt` | 标准 UTC ISO 8601 时间戳，例如 `2026-08-10T04:00:00.000Z`。 |
| `updatedAt` | 标准 UTC ISO 8601 时间戳。 |

V1 对象只允许上述字段。增加业务字段必须定义新的 schema 版本，不得在 V1 中静默扩展。

## 编码与加密

1. 客户端使用 `JSON.stringify` 序列化完整 `MemoryV1`，再以 UTF-8 编码。
2. 完整 Memory JSON 使用 `TextKey` 和 AES-256-GCM 加密。
3. AAD 格式为 `memory-recall:v1:memory:{id}:version:{version}`。
4. 照片原始字节使用 `PhotoKey` 单独加密；照片文件名、MIME 类型和字节长度使用 `TextKey` 加密。
5. 每次加密必须生成独立的 12 字节随机 IV。
6. 导出包只能包含钥匙信封、密文及同步所需普通元数据，不得包含标题、正文、地点、文件名或照片明文。

JSON 属性顺序不属于协议语义。两端只要求解密后字段值一致，不要求相同明文产生相同密文。

## 旧原型迁移

没有 `schemaVersion` 且符合旧原型结构的记录按以下规则迁移：

| 旧字段 | MemoryV1 字段 |
|---|---|
| `body` | `text` |
| 字符串 `location` | `{ name: location }`；空字符串变为 `null` |
| `photoId` | `photos: [{ id: photoId, mimeType: "application/octet-stream" }]` |
| `createdAt` | 同时作为 `createdAt` 和初始 `updatedAt` |

旧记录解密并通过校验后，客户端使用递增的记录版本重新加密保存。格式不完整、未知 `schemaVersion`、篡改密文或错误 AAD 均必须明确失败，不能静默丢弃。

## 兼容夹具

- Web 生成、Android 解密：`memory-recall-mobile/tests/fixtures/web-memory-v1-bundle.json`
- Android 生成、Web 解密：`memory-recall-web/tests/fixtures/android-memory-v1-bundle.json`
- 两端夹具均包含一条完整 MemoryV1 和一张有效的 1×1 PNG。
- 夹具生成器分别位于两个项目的 `tests/generate-memory-v1-fixture.ts`。
