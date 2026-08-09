import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { VaultEnvelopeV1 } from '../crypto';
import {
  assertPrototypeBundle,
  createEncryptedBundle,
  type PrototypeBundleV1,
} from '../storage/bundle';

export async function shareEncryptedBundle(vault: VaultEnvelopeV1): Promise<string> {
  const bundle = await createEncryptedBundle(vault);
  const file = new File(Paths.cache, `memory-recall-encrypted-${Date.now()}.json`);
  file.create({ overwrite: true, intermediates: true });
  file.write(JSON.stringify(bundle));
  if (!await Sharing.isAvailableAsync()) {
    throw new Error('当前设备不支持系统分享。');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: '导出 Memory Recall 加密备份',
  });
  return file.uri;
}
export async function pickEncryptedBundle(): Promise<PrototypeBundleV1 | null> {
  const picked = await File.pickFileAsync({
    mimeTypes: ['application/json', 'text/json', 'text/plain'],
  });
  if (picked.canceled) {
    return null;
  }
  const parsed = JSON.parse(await picked.result.text()) as unknown;
  assertPrototypeBundle(parsed);
  return parsed;
}
