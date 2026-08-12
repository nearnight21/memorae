import {
  getVaultEnvelope,
  listEncryptedMemories,
  listEncryptedPhotos,
  saveCachedEncryptedPhoto,
  saveEncryptedMemory,
  saveEncryptedPhoto,
  saveVaultEnvelope,
} from '../prototype/storage';

export const cipherSyncStorage = {
  getVault: getVaultEnvelope,
  saveVault: saveVaultEnvelope,
  listMemories: listEncryptedMemories,
  listPhotos: listEncryptedPhotos,
  saveMemory: saveEncryptedMemory,
  savePhoto: saveEncryptedPhoto,
  saveCachedPhoto: saveCachedEncryptedPhoto,
};
