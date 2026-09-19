/** 仅供更新兼容夹具；需先安装 Web 依赖。正常 App 验证只读取 JSON。 */
import { writeFile } from 'node:fs/promises';

async function generate() {
  const webCipherPath = '../../web/src/crypto/memoryCipher.ts';
  const { encryptMemory, encryptMemoryV2 } = await import(webCipherPath);
  // 公开的人工测试密钥，不属于任何用户私密空间。
  const session = { cryptoVersion: 1, vmk: new Uint8Array(32).fill(17), textKey: new Uint8Array(32).fill(34), photoKey: new Uint8Array(32).fill(51), destroyed: false };
  const now = '2026-09-19T00:00:00.000Z';
  const topic = { id: 'topics', topics: [{ id: 'topic_web', name: '川藏旅行', createdAt: now, updatedAt: now }], lastUsedAt: { topic_web: now } };
  const memory = { schemaVersion: 2, id: 'memory-web', title: '旅途', date: '2026-09-19', category: 'growth', tag: '', pastSelf: '只有文字的记忆', presentSelf: '', pinnedBy: 'pin', board: { px: 20, py: 20, rotation: 0 }, location: null, photos: [], createdAt: now, updatedAt: now, topicIds: ['topic_web', 'topic_other'] };
  const edited = { ...memory, topicIds: ['topic_other'], title: '编辑后的记忆' };
  const fixture = {
    source: 'Web encryptMemory/encryptMemoryV2；公开人工测试密钥 0x11/0x22/0x33，各 32 字节',
    topic, memory, edited,
    topicCipher: await encryptMemory(session, topic),
    memoryCipher: await encryptMemoryV2(session, memory),
    editedCipher: await encryptMemoryV2(session, edited, 2),
  };
  await writeFile(new URL('./fixtures/web-topics-v1.json', import.meta.url), `${JSON.stringify(fixture, null, 2)}\n`);
}
void generate();
