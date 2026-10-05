import { decryptMemoryV2, destroyVaultSession, type EncryptedMemoryV1 } from '../../crypto';
import { unlockPrivateSpaceLocally } from '../../product/privateSpaceUnlock';
import type { Memory } from '../../types';
import { toDisplayMemory } from '../../memory/toDisplayMemory';
import { DEMO_ACCESS_TOKEN, DEMO_API_URL, DEMO_SPACE_PASSWORD } from '../../sync/config';

interface DemoVault {
  schema: 'memory-recall-vault';
  cryptoVersion: 1;
  createdAt: string;
  kdf: { name: 'Argon2id'; salt: string; memoryKiB: number; iterations: number; parallelism: number; hashLength: 32 };
  wrappedVmk: { algorithm: 'AES-256-GCM'; iv: string; ciphertext: string };
  wrappedKeys: { text: { algorithm: 'AES-256-GCM'; iv: string; ciphertext: string }; photo: { algorithm: 'AES-256-GCM'; iv: string; ciphertext: string } };
}

export function isRemoteDemoConfigured(): boolean {
  return Boolean(DEMO_API_URL && DEMO_ACCESS_TOKEN && DEMO_SPACE_PASSWORD);
}

export async function loadDemoMemories(): Promise<Memory[]> {
  if (!isRemoteDemoConfigured()) throw new Error('Demo 只读接口尚未配置。');
  const headers = { authorization: `Bearer ${DEMO_ACCESS_TOKEN}` };
  const [vaultResponse, memoriesResponse] = await Promise.all([
    fetch(`${DEMO_API_URL}/v1/demo/vault`, { headers }),
    fetch(`${DEMO_API_URL}/v1/demo/memories`, { headers }),
  ]);
  if (!vaultResponse.ok || !memoriesResponse.ok) throw new Error('Demo 记忆暂时不可用。');
  const vault = await vaultResponse.json() as DemoVault;
  const { items } = await memoriesResponse.json() as { items: EncryptedMemoryV1[] };
  const session = await unlockPrivateSpaceLocally(vault, DEMO_SPACE_PASSWORD);
  try {
    const memories: Memory[] = [];
    for (const encrypted of items) {
      if (encrypted.deleted) continue;
      const { memory } = await decryptMemoryV2(session, encrypted);
      memories.push(toDisplayMemory({ ...memory, photoUrls: [], thumbnailUrls: [] }));
    }
    return memories;
  } finally {
    destroyVaultSession(session);
  }
}
