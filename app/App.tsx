import { StatusBar } from 'expo-status-bar';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  bytesToBase64,
  createVault,
  decryptMemoryV2,
  decryptPhoto,
  destroyVaultSession,
  encryptMemoryV2,
  encryptPhoto,
  unlockVault,
  type MemoryV2,
  type VaultEnvelopeV1,
  type VaultSessionV1,
} from './src/crypto';
import { nativeCryptoPrimitives } from './src/crypto/nativePrimitives';
import { pickEncryptedBundle, shareEncryptedBundle } from './src/services/bundleFiles';
import { runNativeCompatibilityCheck } from './src/services/compatibility';
import {
  createJpegPhotoVariant,
  PHOTO_VARIANT_SPECS,
} from './src/photos/photoVariants';
import {
  disableDeviceUnlock,
  enableDeviceUnlock,
  hasDeviceUnlock,
  unlockWithDevice,
} from './src/services/deviceUnlock';
import { replaceWithEncryptedBundle } from './src/storage/bundle';
import { downloadCiphertext, uploadCiphertext } from './src/sync/syncActions';
import { loginSyncSession, MemoryRecallSyncClient } from './src/sync/syncClient';
import AmapJsWebViewMap, { type AmapWebViewMarker } from './src/map/AmapJsWebViewMap';
import {
  clearEncryptedContent,
  deleteEncryptedPhotoVariants,
  getEncryptedPhoto,
  getVaultEnvelope,
  initializeStorage,
  listEncryptedMemories,
  listEncryptedPhotos,
  saveEncryptedMemory,
  saveEncryptedPhoto,
  saveVaultEnvelope,
} from './src/storage/database';

interface PendingPhoto {
  uri: string;
  filename: string;
  mimeType: string;
  width: number;
  height: number;
}

type Mode = 'loading' | 'setup' | 'locked' | 'unlocked';
type SyncAuthMode = 'account' | 'token';

const MAX_PHOTO_BYTES = 30 * 1024 * 1024;

function todayValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const cipherSyncStorage = {
  getVault: getVaultEnvelope,
  saveVault: saveVaultEnvelope,
  listMemories: listEncryptedMemories,
  listPhotos: listEncryptedPhotos,
  saveMemory: saveEncryptedMemory,
  savePhoto: saveEncryptedPhoto,
};

export default function App() {
  const [mode, setMode] = useState<Mode>('loading');
  const [vault, setVault] = useState<VaultEnvelopeV1 | null>(null);
  const [session, setSession] = useState<VaultSessionV1 | null>(null);
  const [memories, setMemories] = useState<MemoryV2[]>([]);
  const [selectedMemory, setSelectedMemory] = useState<MemoryV2 | null>(null);
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [date, setDate] = useState(todayValue());
  const [location, setLocation] = useState('');
  const [tags, setTags] = useState('');
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhoto | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [deviceUnlockEnabled, setDeviceUnlockEnabled] = useState(false);
  const [syncUrl, setSyncUrl] = useState('http://127.0.0.1:8788');
  const [syncAuthMode, setSyncAuthMode] = useState<SyncAuthMode>('account');
  const [syncLoginName, setSyncLoginName] = useState('');
  const [syncLoginPassword, setSyncLoginPassword] = useState('');
  const [syncToken, setSyncToken] = useState('');
  const [syncSessionExpiresAt, setSyncSessionExpiresAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('正在检查本地密文库……');

  const stateLabel = useMemo(() => ({
    loading: '启动中',
    setup: '未创建',
    locked: '已锁定',
    unlocked: '已解锁',
  })[mode], [mode]);

  const mapMarkers = useMemo<AmapWebViewMarker[]>(() => memories.flatMap((memory) => {
    const location = memory.location;
    if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return [];
    return [{ id: memory.id, lat: location.lat!, lng: location.lng! }];
  }), [memories]);

  useEffect(() => {
    void (async () => {
      try {
        await initializeStorage();
        const storedVault = await getVaultEnvelope();
        setVault(storedVault);
        setDeviceUnlockEnabled(await hasDeviceUnlock());
        setMode(storedVault ? 'locked' : 'setup');
        setStatus(storedVault ? '找到本机密文，等待解锁。' : '本机还没有私密空间。');
      } catch (error) {
        setStatus(`启动失败：${errorMessage(error)}`);
        setMode('setup');
      }
    })();
  }, []);

  async function runTask(task: () => Promise<void>): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      await task();
    } catch (error) {
      setStatus(`失败：${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function refreshMemories(activeSession: VaultSessionV1): Promise<number> {
    const encrypted = await listEncryptedMemories();
    let migratedCount = 0;
    const decrypted: MemoryV2[] = [];
    for (const item of encrypted) {
      if (item.deleted) continue;
      const result = await decryptMemoryV2(nativeCryptoPrimitives, activeSession, item);
      decrypted.push(result.memory);
      if (result.migrated) {
        await saveEncryptedMemory(await encryptMemoryV2(
          nativeCryptoPrimitives,
          activeSession,
          result.memory,
          item.version + 1,
        ));
        migratedCount += 1;
      }
    }
    decrypted.sort((left, right) => right.date.localeCompare(left.date));
    setMemories(decrypted);
    return migratedCount;
  }

  async function finishUnlock(activeSession: VaultSessionV1, message: string): Promise<void> {
    setSession(activeSession);
    setMode('unlocked');
    setPassword('');
    const migratedCount = await refreshMemories(activeSession);
    setStatus(migratedCount > 0 ? `${message} 已将 ${migratedCount} 条旧记忆升级为 MemoryV2。` : message);
  }

  function lock(): void {
    if (session) destroyVaultSession(session);
    setSession(null);
    setMemories([]);
    setSelectedMemory(null);
    setPreviewUri(null);
    setPendingPhoto(null);
    setMode(vault ? 'locked' : 'setup');
    setStatus('私密空间已经锁定，内存钥匙已清零。');
  }

  async function createPrivateSpace(): Promise<void> {
    if (password.length < 8) {
      throw new Error('测试密码至少输入 8 个字符。');
    }
    if (password !== passwordConfirmation) {
      throw new Error('两次输入的密码不一致。');
    }
    setStatus('正在用 64 MiB Argon2id 创建私密空间……');
    const startedAt = performance.now();
    const created = await createVault(nativeCryptoPrimitives, password);
    await saveVaultEnvelope(created.envelope);
    setVault(created.envelope);
    setPasswordConfirmation('');
    await finishUnlock(
      created.session,
      `私密空间创建完成，用时 ${Math.round(performance.now() - startedAt)} ms。`,
    );
  }

  async function unlockWithPassword(): Promise<void> {
    if (!vault) throw new Error('本机没有可解锁的私密空间。');
    setStatus('正在派生解锁钥匙……');
    const startedAt = performance.now();
    const activeSession = await unlockVault(nativeCryptoPrimitives, vault, password);
    await finishUnlock(
      activeSession,
      `密码解锁成功，用时 ${Math.round(performance.now() - startedAt)} ms。`,
    );
  }

  async function quickUnlock(): Promise<void> {
    if (!vault) throw new Error('本机没有可解锁的私密空间。');
    setStatus('等待系统指纹验证……');
    const startedAt = performance.now();
    const activeSession = await unlockWithDevice(vault);
    await finishUnlock(
      activeSession,
      `本机指纹解锁成功，用时 ${Math.round(performance.now() - startedAt)} ms。`,
    );
  }

  async function rememberThisDevice(): Promise<void> {
    if (!session) throw new Error('请先解锁。');
    await enableDeviceUnlock(session);
    setDeviceUnlockEnabled(true);
    setStatus('设备钥匙已写入 Android Keystore；VMK 本身没有直接保存。');
  }

  async function choosePhoto(): Promise<void> {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new Error('没有获得照片访问权限。');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const byteLength = asset.fileSize ?? new File(asset.uri).size;
    if (byteLength === null) throw new Error('无法读取所选照片的大小。');
    if (byteLength > MAX_PHOTO_BYTES) throw new Error('照片不能超过 30MB。');
    setPendingPhoto({
      uri: asset.uri,
      filename: asset.fileName ?? `photo-${Date.now()}.jpg`,
      mimeType: asset.mimeType ?? 'image/jpeg',
      width: asset.width,
      height: asset.height,
    });
    setStatus(`已选择照片：${asset.fileName ?? '未命名照片'}`);
  }

  async function saveMemory(): Promise<void> {
    if (!session) throw new Error('请先解锁。');
    if (!title.trim() && !body.trim()) throw new Error('标题和正文不能同时为空。');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('日期请使用 YYYY-MM-DD 格式。');
    setStatus('正在加密并保存……');

    let photoId: string | undefined;
    let photoMetric = '';
    if (pendingPhoto) {
      const startedAt = performance.now();
      photoId = nativeCryptoPrimitives.randomUUID();
      try {
        for (const spec of PHOTO_VARIANT_SPECS) {
          const variantBytes = await createJpegPhotoVariant(
            pendingPhoto.uri,
            pendingPhoto.width,
            pendingPhoto.height,
            spec,
          );
          try {
            await saveEncryptedPhoto(await encryptPhoto(
              nativeCryptoPrimitives,
              session,
              variantBytes,
              { filename: pendingPhoto.filename, mimeType: 'image/jpeg' },
              { id: photoId, kind: spec.kind },
            ));
          } finally {
            variantBytes.fill(0);
          }
        }
        const plaintextFile = new File(pendingPhoto.uri);
        if (plaintextFile.size !== null && plaintextFile.size > MAX_PHOTO_BYTES) {
          throw new Error('照片不能超过 30MB。');
        }
        const photoBytes = await plaintextFile.bytes();
        try {
          await saveEncryptedPhoto(await encryptPhoto(
            nativeCryptoPrimitives,
            session,
            photoBytes,
            { filename: pendingPhoto.filename, mimeType: pendingPhoto.mimeType },
            { id: photoId, kind: 'original' },
          ));
          photoMetric = `；${Math.round(photoBytes.byteLength / 1024)} KiB 原图及两档展示图加密 ${Math.round(performance.now() - startedAt)} ms`;
        } finally {
          photoBytes.fill(0);
        }
      } catch (error) {
        try {
          await deleteEncryptedPhotoVariants(photoId);
        } catch {
          // 保留最初的照片处理错误，残留加密文件可在清空本机密文时删除。
        }
        throw error;
      }
    }

    const now = new Date().toISOString();
    const memory: MemoryV2 = {
      schemaVersion: 2,
      id: nativeCryptoPrimitives.randomUUID(),
      title: title.trim() || '无标题',
      pastSelf: body.trim(),
      presentSelf: '',
      date,
      category: location.trim() ? 'travel' : 'growth',
      tag: tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean).join(' · '),
      pinnedBy: 'pin',
      board: { px: 20, py: 20, rotation: 0 },
      location: location.trim() ? { name: location.trim(), mx: 50, my: 50 } : null,
      photos: photoId && pendingPhoto
        ? [{ id: photoId, mimeType: pendingPhoto.mimeType }]
        : [],
      createdAt: now,
      updatedAt: now,
    };
    try {
      const encryptedMemory = await encryptMemoryV2(
        nativeCryptoPrimitives,
        session,
        memory,
      );
      await saveEncryptedMemory(encryptedMemory);
    } catch (error) {
      if (photoId) {
        try {
          await deleteEncryptedPhotoVariants(photoId);
        } catch {
          // 保留最初的记忆保存错误，残留加密文件可在清空本机密文时删除。
        }
      }
      throw error;
    }
    setTitle('');
    setBody('');
    setDate(todayValue());
    setLocation('');
    setTags('');
    setPendingPhoto(null);
    await refreshMemories(session);
    setStatus(`记忆已加密保存${photoMetric}。`);
  }

  async function showPhoto(memory: MemoryV2): Promise<void> {
    const photoId = memory.photos[0]?.id;
    if (!session || !photoId) return;
    const encrypted = await getEncryptedPhoto(photoId, 'preview')
      ?? await getEncryptedPhoto(photoId, 'original');
    if (!encrypted) throw new Error('找不到照片密文。');
    const startedAt = performance.now();
    const photo = await decryptPhoto(nativeCryptoPrimitives, session, encrypted);
    setPreviewUri(`data:${photo.metadata.mimeType};base64,${bytesToBase64(photo.bytes)}`);
    photo.bytes.fill(0);
    setStatus(`照片只在内存中解密，用时 ${Math.round(performance.now() - startedAt)} ms。`);
  }

  async function openMemory(memory: MemoryV2): Promise<void> {
    setSelectedMemory(memory);
    setPreviewUri(null);
    if (memory.photos.length > 0) await showPhoto(memory);
  }

  async function exportBundle(): Promise<void> {
    if (!vault) throw new Error('没有可导出的私密空间。');
    await shareEncryptedBundle(vault);
    setStatus('已调用系统分享导出加密 JSON；文件中不含密码和明文。');
  }

  async function importBundle(): Promise<void> {
    const bundle = await pickEncryptedBundle();
    if (!bundle) return;
    if (session) destroyVaultSession(session);
    await disableDeviceUnlock();
    await replaceWithEncryptedBundle(bundle);
    setVault(bundle.vault);
    setSession(null);
    setMemories([]);
    setSelectedMemory(null);
    setPreviewUri(null);
    setDeviceUnlockEnabled(false);
    setMode('locked');
    setStatus('加密包已导入，请输入它原来的私密空间密码。');
  }

  async function runCompatibility(): Promise<void> {
    setStatus('正在运行 Android 原生 64 MiB Argon2id 与网页密文兼容测试……');
    const result = await runNativeCompatibilityCheck();
    setStatus(
      `兼容测试通过：AES-GCM ${Math.round(result.aesMilliseconds)} ms；Argon2id ${Math.round(result.argon2Milliseconds)} ms；网页 VMK/文字/照片解密 ${Math.round(result.webBundleMilliseconds)} ms。`,
    );
  }

  function createSyncClient(): MemoryRecallSyncClient {
    if (!syncUrl.trim()) throw new Error('请输入本地密文服务地址。');
    if (!syncToken.trim()) throw new Error('请输入本地访问令牌。');
    return new MemoryRecallSyncClient({
      baseUrl: syncUrl.trim(),
      token: syncToken.trim(),
    });
  }

  async function loginToSyncService(): Promise<void> {
    if (!syncUrl.trim()) throw new Error('请输入密文服务地址。');
    if (syncLoginName.trim().length < 3) throw new Error('请输入受邀请账号。');
    if (syncLoginPassword.length < 8) throw new Error('登录密码至少需要 8 个字符。');
    const login = await loginSyncSession(syncUrl.trim(), {
      loginName: syncLoginName.trim(),
      password: syncLoginPassword,
      deviceId: 'android-prototype',
    });
    setSyncToken(login.accessToken);
    setSyncSessionExpiresAt(login.expiresAt);
    setSyncLoginPassword('');
    setStatus(`同步账号登录成功，会话有效至 ${new Date(login.expiresAt).toLocaleString()}。`);
  }

  async function logoutFromSyncService(): Promise<void> {
    await createSyncClient().logout();
    setSyncToken('');
    setSyncSessionExpiresAt(null);
    setStatus('已退出同步账号，当前访问令牌已撤销。');
  }

  async function toggleSyncAuthMode(): Promise<void> {
    if (syncAuthMode === 'account' && syncToken) {
      await createSyncClient().logout();
    }
    setSyncToken('');
    setSyncSessionExpiresAt(null);
    setSyncLoginPassword('');
    setSyncAuthMode((current) => (current === 'account' ? 'token' : 'account'));
    setStatus(syncAuthMode === 'account' ? '已切换到本地固定令牌模式。' : '已切换到受邀请账号登录。');
  }

  async function uploadLocalCiphertext(): Promise<void> {
    setStatus('正在把本机密文发送到本地服务……');
    const result = await uploadCiphertext(createSyncClient(), cipherSyncStorage);
    setStatus(`上传完成：${result.memories} 条记忆密文，${result.photos} 份照片密文。`);
  }

  async function downloadRemoteCiphertext(): Promise<void> {
    setStatus('正在从本地服务下载密文……');
    const result = await downloadCiphertext({
      client: createSyncClient(),
      storage: cipherSyncStorage,
      decryptMemory: session
        ? async (memory) => (await decryptMemoryV2(
          nativeCryptoPrimitives,
          session,
          memory,
        )).memory
        : undefined,
    });

    if (result.importedVault) {
      const downloadedVault = await getVaultEnvelope();
      await disableDeviceUnlock();
      setVault(downloadedVault);
      setDeviceUnlockEnabled(false);
      setMode('locked');
      setStatus('钥匙信封已下载。请输入原私密空间密码解锁，再点一次下载密文。');
      return;
    }
    if (result.requiresUnlock) {
      setStatus('钥匙信封一致。请先解锁私密空间，再下载记忆和照片密文。');
      return;
    }
    if (session) await refreshMemories(session);
    setStatus(`下载完成：${result.memories} 条记忆密文，${result.photos} 份照片密文。`);
  }

  function confirmClear(): void {
    Alert.alert(
      '清空本机原型？',
      '这会删除本机密文和设备解锁钥匙。请先导出备份。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '清空',
          style: 'destructive',
          onPress: () => void runTask(async () => {
            if (session) destroyVaultSession(session);
            await disableDeviceUnlock();
            await clearEncryptedContent();
            setVault(null);
            setSession(null);
            setMemories([]);
            setSelectedMemory(null);
            setPreviewUri(null);
            setDeviceUnlockEnabled(false);
            setMode('setup');
            setStatus('本机原型数据已经清空。');
          }),
        },
      ],
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>VMK V1 · ANDROID TEST</Text>
            <Text style={styles.heading}>所忆</Text>
          </View>
          <Text style={styles.state}>{stateLabel}</Text>
        </View>

        <View style={styles.statusBox}>
          <Text style={styles.statusText}>{busy ? '处理中… ' : ''}{status}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>跨端兼容</Text>
          <Text style={styles.hint}>运行真实 Android 原生 Argon2id，并解开网页端生成的固定 VMK、文字和照片。</Text>
          <Button title="运行兼容与性能测试" disabled={busy} onPress={() => void runTask(runCompatibility)} />
        </View>

        {mode !== 'loading' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>本地密文同步</Text>
            <Text style={styles.hint}>登录密码和短期令牌只保留在当前页面内存中，与私密空间密码完全分离。</Text>
            <TextInput
              style={styles.input}
              placeholder="本地服务地址"
              autoCapitalize="none"
              autoCorrect={false}
              value={syncUrl}
              onChangeText={setSyncUrl}
            />
            {syncAuthMode === 'account' ? (
              syncToken ? (
                <>
                  <Text style={styles.hint}>受邀请账号已登录{syncSessionExpiresAt ? `，有效至 ${new Date(syncSessionExpiresAt).toLocaleString()}` : ''}。</Text>
                  <Button title="退出同步账号" disabled={busy} onPress={() => void runTask(logoutFromSyncService)} />
                </>
              ) : (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="受邀请账号"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={syncLoginName}
                    onChangeText={setSyncLoginName}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="独立登录密码"
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                    value={syncLoginPassword}
                    onChangeText={setSyncLoginPassword}
                  />
                  <Button title="登录同步服务" disabled={busy} onPress={() => void runTask(loginToSyncService)} />
                </>
              )
            ) : (
              <TextInput
                style={styles.input}
                placeholder="本地固定访问令牌"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                value={syncToken}
                onChangeText={setSyncToken}
              />
            )}
            <View style={styles.spacer} />
            <Button
              title={syncAuthMode === 'account' ? '改用本地固定令牌' : '改用受邀请账号'}
              disabled={busy}
              onPress={() => void runTask(toggleSyncAuthMode)}
            />
            <View style={styles.spacer} />
            <Button title="上传本机密文" disabled={busy || !vault || !syncToken} onPress={() => void runTask(uploadLocalCiphertext)} />
            <View style={styles.spacer} />
            <Button title="下载服务器密文" disabled={busy || !syncToken} onPress={() => void runTask(downloadRemoteCiphertext)} />
          </View>
        )}

        {mode === 'loading' && <Text style={styles.centerText}>正在启动……</Text>}

        {mode === 'setup' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>创建私密空间</Text>
            <TextInput
              style={styles.input}
              placeholder="私密空间密码（至少 8 个字符）"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <TextInput
              style={styles.input}
              placeholder="再次输入密码"
              secureTextEntry
              value={passwordConfirmation}
              onChangeText={setPasswordConfirmation}
            />
            <Button title="创建并解锁" disabled={busy} onPress={() => void runTask(createPrivateSpace)} />
            <View style={styles.spacer} />
            <Button title="导入网页端加密备份" disabled={busy} onPress={() => void runTask(importBundle)} />
          </View>
        )}

        {mode === 'locked' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>解锁私密空间</Text>
            <TextInput
              style={styles.input}
              placeholder="私密空间密码"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={() => void runTask(unlockWithPassword)}
            />
            <Button title="密码解锁" disabled={busy} onPress={() => void runTask(unlockWithPassword)} />
            {deviceUnlockEnabled && (
              <>
                <View style={styles.spacer} />
                <Button title="使用本机指纹解锁" disabled={busy} onPress={() => void runTask(quickUnlock)} />
              </>
            )}
            <View style={styles.spacer} />
            <Button title="导入其他加密备份" disabled={busy} onPress={() => void runTask(importBundle)} />
          </View>
        )}

        {mode === 'unlocked' && session && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>足迹地图</Text>
              <Text style={styles.hint}>地图只接收已解密记忆的地点坐标；正文、密文、会话密钥和照片不会进入地图 Runtime。</Text>
              <AmapJsWebViewMap
                markers={mapMarkers}
                onMarkerPressed={(id) => setStatus(`地图地点已选中：${id}`)}
              />
            </View>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>新建测试记忆</Text>
              <TextInput style={styles.input} placeholder="标题" value={title} onChangeText={setTitle} />
              <TextInput
                style={[styles.input, styles.bodyInput]}
                placeholder="正文"
                multiline
                value={body}
                onChangeText={setBody}
              />
              <TextInput style={styles.input} placeholder="日期（YYYY-MM-DD）" value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" />
              <TextInput style={styles.input} placeholder="地点（例如：杭州西湖）" value={location} onChangeText={setLocation} />
              <TextInput style={styles.input} placeholder="标签（用逗号分隔）" value={tags} onChangeText={setTags} />
              <Button title={pendingPhoto ? `已选：${pendingPhoto.filename}` : '选择一张真实照片'} disabled={busy} onPress={() => void runTask(choosePhoto)} />
              <View style={styles.spacer} />
              <Button title="加密并保存" disabled={busy} onPress={() => void runTask(saveMemory)} />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>本机解锁</Text>
              <Text style={styles.hint}>保存随机设备钥匙到 Android Keystore，通过它解开 VMK；不保存密码。</Text>
              <Button
                title={deviceUnlockEnabled ? '重新设置指纹解锁' : '启用本机指纹解锁'}
                disabled={busy}
                onPress={() => void runTask(rememberThisDevice)}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{selectedMemory ? '记忆详情' : `已解密记忆（${memories.length}）`}</Text>
              {selectedMemory ? (
                <View style={styles.readerCard}>
                  <Text style={styles.readerDate}>{selectedMemory.date}</Text>
                  <Text style={styles.readerTitle}>{selectedMemory.title}</Text>
                  {selectedMemory.location && <Text style={styles.readerLocation}>⌖ {selectedMemory.location.name}</Text>}
                  {previewUri && <Image source={{ uri: previewUri }} style={styles.readerPhoto} resizeMode="cover" />}
                  <Text selectable style={styles.readerBody}>{selectedMemory.pastSelf || '这段记忆没有正文。'}</Text>
                  {selectedMemory.tag && (
                    <View style={styles.tagRow}>{selectedMemory.tag.split(' · ').map((tag) => <Text key={tag} style={styles.tag}>#{tag}</Text>)}</View>
                  )}
                  <Button title="返回记忆列表" onPress={() => { setSelectedMemory(null); setPreviewUri(null); }} />
                </View>
              ) : (
                <>
                  {memories.length === 0 && <Text style={styles.hint}>还没有记忆。</Text>}
                  {memories.map((memory) => (
                    <Pressable key={memory.id} style={({ pressed }) => [styles.memoryCard, pressed && styles.memoryCardPressed]} onPress={() => void runTask(() => openMemory(memory))}>
                      <Text style={styles.memoryTitle}>{memory.title}</Text>
                      <Text numberOfLines={3} style={styles.memoryBody}>{memory.pastSelf}</Text>
                      <Text style={styles.memoryMeta}>{memory.date}{memory.location ? ` · ${memory.location.name}` : ''}</Text>
                      <Text style={styles.readLink}>阅读完整记忆 →</Text>
                    </Pressable>
                  ))}
                </>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>密文操作</Text>
              <Button title="导出加密 JSON" disabled={busy} onPress={() => void runTask(exportBundle)} />
              <View style={styles.spacer} />
              <Button title="锁定并清除内存钥匙" disabled={busy} onPress={lock} />
            </View>
          </>
        )}

        <View style={styles.dangerSection}>
          <Button title="清空本机原型数据" color="#9d2f2f" disabled={busy} onPress={confirmClear} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f3f0e8' },
  page: { padding: 18, paddingTop: 56, paddingBottom: 64, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { fontSize: 11, letterSpacing: 1.2, color: '#58634c', fontWeight: '700' },
  heading: { marginTop: 4, fontSize: 28, fontWeight: '800', color: '#1d251a' },
  state: { backgroundColor: '#dce6ce', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, color: '#314126', fontWeight: '700' },
  statusBox: { backgroundColor: '#fff8df', borderWidth: 1, borderColor: '#e5d69d', borderRadius: 12, padding: 12 },
  statusText: { color: '#534a2c', lineHeight: 20 },
  section: { backgroundColor: '#ffffff', borderRadius: 14, padding: 15, gap: 10, borderWidth: 1, borderColor: '#ddd9ce' },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#20271e' },
  hint: { color: '#6b7066', lineHeight: 20 },
  input: { minHeight: 46, borderWidth: 1, borderColor: '#c8c8be', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fafaf7', color: '#171a16' },
  bodyInput: { minHeight: 100, textAlignVertical: 'top' },
  spacer: { height: 2 },
  centerText: { textAlign: 'center', padding: 24 },
  memoryCard: { backgroundColor: '#f6f7f2', borderRadius: 10, padding: 12, gap: 6 },
  memoryCardPressed: { opacity: 0.72, transform: [{ scale: 0.995 }] },
  memoryTitle: { fontSize: 16, fontWeight: '700', color: '#1e241b' },
  memoryBody: { color: '#3f473b', lineHeight: 20 },
  memoryMeta: { color: '#818779', fontSize: 12 },
  readLink: { marginTop: 4, color: '#58634c', fontSize: 13, fontWeight: '700' },
  readerCard: { gap: 12, paddingVertical: 4 },
  readerDate: { color: '#7c7464', fontSize: 12, letterSpacing: 0.8 },
  readerTitle: { color: '#1d251a', fontSize: 27, lineHeight: 34, fontWeight: '800' },
  readerLocation: { color: '#58634c', fontSize: 14 },
  readerPhoto: { width: '100%', height: 300, borderRadius: 12, backgroundColor: '#161916' },
  readerBody: { color: '#343a30', fontSize: 17, lineHeight: 29 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { color: '#58634c', backgroundColor: '#edf1e7', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, fontSize: 12 },
  previewBox: { gap: 8, marginTop: 4 },
  preview: { width: '100%', height: 260, backgroundColor: '#151515', borderRadius: 10 },
  dangerSection: { paddingTop: 4 },
});
