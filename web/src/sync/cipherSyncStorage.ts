import {
  getEncryptedPhotoVariant,
  getEncryptedMemory,
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
  getMemory: getEncryptedMemory,
  saveVault: saveVaultEnvelope,
  listMemories: listEncryptedMemories,
  listPhotos: listEncryptedPhotos,
  getPhoto: getEncryptedPhotoVariant,
  saveMemory: saveEncryptedMemory,
  savePhoto: saveEncryptedPhoto,
  saveCachedPhoto: saveCachedEncryptedPhoto,
};
