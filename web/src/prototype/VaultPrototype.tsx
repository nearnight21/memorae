import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  ArchiveRestore,
  Check,
  Download,
  Eye,
  EyeOff,
  FileKey,
  ImagePlus,
  KeyRound,
  LoaderCircle,
  Lock,
  MapPin,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  createVault,
  decryptMemoryV1,
  decryptPhoto,
  destroyVaultSession,
  encryptMemoryV1,
  encryptPhoto,
  unlockVault,
  type EncryptedMemoryV1,
  type MemoryV1,
  type VaultEnvelopeV1,
  type VaultSessionV1,
} from '../crypto';
import { downloadCiphertext, uploadCiphertext } from '../sync/syncActions';
import { MemoryRecallSyncClient } from '../sync/syncClient';
import {
  assertPrototypeBundle,
  clearPrototypeDatabase,
  createEncryptedBundle,
  deleteEncryptedMemory,
  getVaultEnvelope,
  listEncryptedMemories,
  listEncryptedPhotos,
  replaceWithEncryptedBundle,
  saveEncryptedMemory,
  saveEncryptedPhoto,
  saveVaultEnvelope,
} from './storage';
import './vault-prototype.css';

type Phase = 'booting' | 'setup' | 'locked' | 'unlocked';

interface VisibleMemory extends MemoryV1 {
  photoUrls: string[];
}

interface CipherStats {
  memoryCount: number;
  photoCount: number;
  ciphertextCharacters: number;
  preview: string;
}

const MAX_PHOTO_BYTES = 30 * 1024 * 1024;

function todayValue(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

const cipherSyncStorage = {
  getVault: getVaultEnvelope,
  saveVault: saveVaultEnvelope,
  listMemories: listEncryptedMemories,
  listPhotos: listEncryptedPhotos,
  saveMemory: saveEncryptedMemory,
  savePhoto: saveEncryptedPhoto,
};

export default function VaultPrototype() {
  const [phase, setPhase] = useState<Phase>('booting');
  const [envelope, setEnvelope] = useState<VaultEnvelopeV1 | null>(null);
  const [session, setSession] = useState<VaultSessionV1 | null>(null);
  const [memories, setMemories] = useState<VisibleMemory[]>([]);
  const [cipherStats, setCipherStats] = useState<CipherStats>({
    memoryCount: 0,
    photoCount: 0,
    ciphertextCharacters: 0,
    preview: '',
  });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [unlockDuration, setUnlockDuration] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayValue());
  const [body, setBody] = useState('');
  const [location, setLocation] = useState('');
  const [tags, setTags] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [resetArmed, setResetArmed] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [syncUrl, setSyncUrl] = useState('http://127.0.0.1:8788');
  const [syncToken, setSyncToken] = useState('');
  const photoInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const objectUrlsRef = useRef<string[]>([]);

  const passwordType = showPassword ? 'text' : 'password';
  const canCreateVault = password.length >= 8 && password === confirmPassword && !busy;
  const canSaveMemory = Boolean(session && title.trim() && body.trim() && photo && !busy);

  const revokePhotoUrls = () => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
  };

  const refreshCipherStats = async (currentEnvelope: VaultEnvelopeV1 | null) => {
    const [encryptedMemories, encryptedPhotos] = await Promise.all([
      listEncryptedMemories(),
      listEncryptedPhotos(),
    ]);
    const memoryCharacters = encryptedMemories.reduce(
      (sum, item) => sum + item.payload.ciphertext.length,
      0,
    );
    const photoCharacters = encryptedPhotos.reduce(
      (sum, item) => sum + item.content.ciphertext.length + item.metadata.ciphertext.length,
      0,
    );
    const preview =
      encryptedMemories[0]?.payload.ciphertext.slice(0, 72) ||
      currentEnvelope?.wrappedVmk.ciphertext.slice(0, 72) ||
      '';

    setCipherStats({
      memoryCount: encryptedMemories.length,
      photoCount: encryptedPhotos.length,
      ciphertextCharacters: memoryCharacters + photoCharacters,
      preview,
    });
  };

  const loadDecryptedMemories = async (activeSession: VaultSessionV1) => {
    revokePhotoUrls();
    const [encryptedMemories, encryptedPhotos] = await Promise.all([
      listEncryptedMemories(),
      listEncryptedPhotos(),
    ]);
    const photoMap = new Map(encryptedPhotos.map((item) => [item.id, item]));

    const visible = await Promise.all(
      encryptedMemories.map(async (encryptedMemory) => {
        const result = await decryptMemoryV1(activeSession, encryptedMemory);
        const memory = result.memory;
        if (result.migrated) {
          await saveEncryptedMemory(await encryptMemoryV1(
            activeSession,
            memory,
            encryptedMemory.version + 1,
          ));
        }
        const photoUrls = await Promise.all(memory.photos.map(async ({ id }) => {
          const encryptedPhoto = photoMap.get(id);
          if (!encryptedPhoto) {
            throw new Error(`记忆“${memory.title}”缺少照片密文：${id}。`);
          }
          const decryptedPhoto = await decryptPhoto(activeSession, encryptedPhoto);
          const photoUrl = URL.createObjectURL(
            new Blob([decryptedPhoto.bytes], { type: decryptedPhoto.metadata.mimeType }),
          );
          objectUrlsRef.current.push(photoUrl);
          return photoUrl;
        }));
        return { ...memory, photoUrls };
      }),
    );

    visible.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    setMemories(visible);
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const storedEnvelope = await getVaultEnvelope();
        if (!active) return;
        setEnvelope(storedEnvelope);
        setPhase(storedEnvelope ? 'locked' : 'setup');
        await refreshCipherStats(storedEnvelope);
      } catch (bootError) {
        if (!active) return;
        setError(bootError instanceof Error ? bootError.message : '原型启动失败。');
        setPhase('setup');
      }
    })();

    return () => {
      active = false;
      revokePhotoUrls();
    };
  }, []);

  const handleCreateVault = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');

    if (password.length < 8) {
      setError('原型密码至少需要 8 个字符。');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致。');
      return;
    }

    setBusy(true);
    const started = performance.now();
    try {
      const created = await createVault(password);
      await saveVaultEnvelope(created.envelope);
      setEnvelope(created.envelope);
      setSession(created.session);
      setPhase('unlocked');
      setUnlockDuration(performance.now() - started);
      setPassword('');
      setConfirmPassword('');
      setNotice('私密空间已创建。现在添加一条真实记忆和照片。');
      await refreshCipherStats(created.envelope);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '创建私密空间失败。');
    } finally {
      setBusy(false);
    }
  };

  const handleUnlock = async (event: FormEvent) => {
    event.preventDefault();
    if (!envelope) return;
    setBusy(true);
    setError('');
    setNotice('');
    const started = performance.now();

    try {
      const unlocked = await unlockVault(envelope, password);
      await loadDecryptedMemories(unlocked);
      setSession(unlocked);
      setPhase('unlocked');
      setUnlockDuration(performance.now() - started);
      setPassword('');
      setNotice('已在设备端解密，页面显示内容来自密文。');
      await refreshCipherStats(envelope);
    } catch (unlockError) {
      setError(unlockError instanceof Error ? unlockError.message : '解锁失败。');
    } finally {
      setBusy(false);
    }
  };

  const lockPrivateSpace = (message = '私密空间已锁定，明文和照片已从页面移除。') => {
    if (session) destroyVaultSession(session);
    revokePhotoUrls();
    setSession(null);
    setMemories([]);
    setPassword('');
    setConfirmPassword('');
    setPhase(envelope ? 'locked' : 'setup');
    setError('');
    setNotice(message);
  };

  const handleSaveMemory = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || !photo) return;

    setError('');
    setNotice('');

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type)) {
      setError('原型目前只接受 JPG、PNG 或 WebP 照片。');
      return;
    }
    if (photo.size > MAX_PHOTO_BYTES) {
      setError(`照片不能超过 ${formatBytes(MAX_PHOTO_BYTES)}。`);
      return;
    }

    setBusy(true);
    try {
      const photoBytes = new Uint8Array(await photo.arrayBuffer());
      const photoId = crypto.randomUUID();
      const memoryId = crypto.randomUUID();
      const encryptedPhoto = await encryptPhoto(
        session,
        photoBytes,
        { filename: photo.name, mimeType: photo.type },
        { id: photoId },
      );
      const now = new Date().toISOString();
      const memory: MemoryV1 = {
        schemaVersion: 1,
        id: memoryId,
        title: title.trim(),
        date,
        text: body.trim(),
        location: location.trim() ? { name: location.trim() } : null,
        tags: tags
          .split(/[,，]/)
          .map((tag) => tag.trim())
          .filter(Boolean),
        photos: [{ id: photoId, mimeType: photo.type }],
        createdAt: now,
        updatedAt: now,
      };
      const encryptedMemory = await encryptMemoryV1(session, memory);

      await saveEncryptedPhoto(encryptedPhoto);
      try {
        await saveEncryptedMemory(encryptedMemory);
      } catch (saveError) {
        await deleteEncryptedMemory(memoryId, [photoId]);
        throw saveError;
      }

      await loadDecryptedMemories(session);
      await refreshCipherStats(envelope);
      setTitle('');
      setDate(todayValue());
      setBody('');
      setLocation('');
      setTags('');
      setPhoto(null);
      if (photoInputRef.current) photoInputRef.current.value = '';
      setNotice('保存成功：页面中的文字和照片均由本地密文重新解密得到。');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '加密保存失败。');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (memory: VisibleMemory) => {
    if (deletingId !== memory.id) {
      setDeletingId(memory.id);
      window.setTimeout(() => setDeletingId((current) => (current === memory.id ? null : current)), 4000);
      return;
    }

    setBusy(true);
    try {
      await deleteEncryptedMemory(memory.id, memory.photos.map(({ id }) => id));
      if (session) await loadDecryptedMemories(session);
      await refreshCipherStats(envelope);
      setDeletingId(null);
      setNotice('这条原型记忆及其照片密文已从本设备删除。');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '删除失败。');
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    setBusy(true);
    setError('');
    try {
      const bundle = await createEncryptedBundle();
      downloadJson(`memory-recall-encrypted-${Date.now()}.json`, bundle);
      setNotice('密文包已导出。文件中没有私密空间密码和明文内容。');
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : '导出失败。');
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError('');
    setNotice('');

    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      assertPrototypeBundle(parsed);
      if (session) destroyVaultSession(session);
      revokePhotoUrls();
      await replaceWithEncryptedBundle(parsed);
      setSession(null);
      setMemories([]);
      setEnvelope(parsed.vault);
      setPhase('locked');
      setPassword('');
      setNotice('密文包已导入。请输入原私密空间密码完成换设备验证。');
      await refreshCipherStats(parsed.vault);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : '导入失败。');
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
      setBusy(false);
    }
  };

  const handleReset = async () => {
    if (!resetArmed) {
      setResetArmed(true);
      window.setTimeout(() => setResetArmed(false), 5000);
      return;
    }

    setBusy(true);
    try {
      if (session) destroyVaultSession(session);
      revokePhotoUrls();
      await clearPrototypeDatabase();
      setEnvelope(null);
      setSession(null);
      setMemories([]);
      setPassword('');
      setConfirmPassword('');
      setPhase('setup');
      setResetArmed(false);
      setCipherStats({ memoryCount: 0, photoCount: 0, ciphertextCharacters: 0, preview: '' });
      setNotice('本设备的原型密文已清空。现在可以导入刚才导出的密文包。');
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : '清空失败。');
    } finally {
      setBusy(false);
    }
  };

  const createSyncClient = () => {
    if (!syncUrl.trim()) throw new Error('请输入本地密文服务地址。');
    if (!syncToken.trim()) throw new Error('请输入本地访问令牌。');
    return new MemoryRecallSyncClient({
      baseUrl: syncUrl.trim(),
      token: syncToken.trim(),
    });
  };

  const handleUploadCiphertext = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await uploadCiphertext(createSyncClient(), cipherSyncStorage);
      setNotice(`上传完成：${result.memories} 条记忆密文，${result.photos} 份照片密文。`);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : '上传密文失败。');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadCiphertext = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await downloadCiphertext({
        client: createSyncClient(),
        storage: cipherSyncStorage,
        decryptMemory: session
          ? async (memory) => (await decryptMemoryV1(session, memory)).memory
          : undefined,
      });

      if (result.importedVault) {
        const downloadedEnvelope = await getVaultEnvelope();
        setEnvelope(downloadedEnvelope);
        setPhase('locked');
        setNotice('钥匙信封已下载。请输入原私密空间密码解锁，再点一次下载密文。');
        await refreshCipherStats(downloadedEnvelope);
        return;
      }
      if (result.requiresUnlock) {
        setNotice('钥匙信封一致。请先解锁私密空间，再下载记忆和照片密文。');
        return;
      }
      if (session) await loadDecryptedMemories(session);
      await refreshCipherStats(envelope);
      setNotice(`下载完成：${result.memories} 条记忆密文，${result.photos} 份照片密文。`);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : '下载密文失败。');
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = useMemo(() => {
    if (phase === 'unlocked') return '已解锁';
    if (phase === 'locked') return '已锁定';
    if (phase === 'setup') return '未创建';
    return '正在检查';
  }, [phase]);

  if (phase === 'booting') {
    return (
      <main className="vault-shell vault-shell--centered">
        <div className="vault-loading" role="status">
          <LoaderCircle className="vault-spin" aria-hidden="true" />
          <span>正在检查本机密文库</span>
        </div>
      </main>
    );
  }

  return (
    <main className="vault-shell">
      <header className="vault-header">
        <div>
          <p className="vault-eyebrow">MEMORIES · VMK V1 PROTOTYPE</p>
          <h1>私密空间验证</h1>
          <p className="vault-subtitle">所有内容先在这台设备加密；联调时只向本地服务发送密文。</p>
        </div>
        <div className="vault-status-group">
          <span className={`vault-status vault-status--${phase}`}>{statusLabel}</span>
          <span className="vault-local-badge"><ShieldCheck size={15} />仅保存在本机</span>
        </div>
      </header>

      {(notice || error) && (
        <div className={`vault-message ${error ? 'vault-message--error' : 'vault-message--success'}`} role={error ? 'alert' : 'status'}>
          {error ? null : <Check size={17} aria-hidden="true" />}
          <span>{error || notice}</span>
        </div>
      )}

      <section className="vault-sync-card">
        <div className="vault-section-heading">
          <div><p>LOCAL CIPHERTEXT SYNC</p><h2>本地密文同步</h2></div>
          <span>令牌不保存</span>
        </div>
        <p>用于当前电脑上的网页与 Android 模拟器联调，不会上传密码或 VMK。</p>
        <div className="vault-sync-fields">
          <label>
            <span>本地服务地址</span>
            <input value={syncUrl} onChange={(event) => setSyncUrl(event.target.value)} inputMode="url" autoCapitalize="none" spellCheck={false} />
          </label>
          <label>
            <span>本地访问令牌</span>
            <input type="password" value={syncToken} onChange={(event) => setSyncToken(event.target.value)} autoComplete="off" placeholder="启动服务时设置的令牌" />
          </label>
        </div>
        <div className="vault-sync-actions">
          <button type="button" onClick={handleUploadCiphertext} disabled={busy || !envelope}><Upload size={16} />上传本机密文</button>
          <button type="button" onClick={handleDownloadCiphertext} disabled={busy}><Download size={16} />下载服务器密文</button>
        </div>
      </section>

      {phase !== 'unlocked' ? (
        <section className="vault-gate-grid">
          <article className="vault-gate-card">
            <div className="vault-card-heading">
              <span className="vault-icon-box"><KeyRound aria-hidden="true" /></span>
              <div>
                <p>{phase === 'setup' ? '第一次使用' : '欢迎回来'}</p>
                <h2>{phase === 'setup' ? '创建私密空间' : '解锁本机密文'}</h2>
              </div>
            </div>

            <form onSubmit={phase === 'setup' ? handleCreateVault : handleUnlock} className="vault-form">
              <label>
                <span>私密空间密码</span>
                <div className="vault-password-field">
                  <input
                    type={passwordType}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={phase === 'setup' ? 'new-password' : 'current-password'}
                    placeholder={phase === 'setup' ? '至少 8 个字符' : '输入原来的私密空间密码'}
                    required
                  />
                  <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? '隐藏密码' : '显示密码'}>
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>

              {phase === 'setup' && (
                <label>
                  <span>再次输入密码</span>
                  <input
                    type={passwordType}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="确认私密空间密码"
                    required
                  />
                </label>
              )}

              <button className="vault-primary-button" type="submit" disabled={phase === 'setup' ? !canCreateVault : !password || busy}>
                {busy ? <LoaderCircle className="vault-spin" size={18} /> : phase === 'setup' ? <KeyRound size={18} /> : <Lock size={18} />}
                {busy ? '正在处理' : phase === 'setup' ? '创建并解锁' : '在设备端解锁'}
              </button>
            </form>

            <p className="vault-gate-note">密码不会保存。忘记密码时，这个原型无法替你恢复内容。</p>
          </article>

          <aside className="vault-proof-card">
            <div className="vault-proof-title"><FileKey size={20} /><h2>当前密文证据</h2></div>
            <dl>
              <div><dt>加密版本</dt><dd>VMK V1</dd></div>
              <div><dt>记忆密文</dt><dd>{cipherStats.memoryCount} 条</dd></div>
              <div><dt>照片密文</dt><dd>{cipherStats.photoCount} 份</dd></div>
              <div><dt>密码派生</dt><dd>Argon2id</dd></div>
            </dl>
            <div className="vault-cipher-preview">
              <span>密文片段</span>
              <code>{cipherStats.preview || '创建私密空间后生成'}</code>
            </div>
            {unlockDuration !== null && <p className="vault-timing">上次本地处理耗时 {Math.round(unlockDuration)}ms</p>}
          </aside>
        </section>
      ) : (
        <>
          <nav className="vault-actions" aria-label="私密空间操作">
            <button type="button" onClick={() => lockPrivateSpace()} disabled={busy}><Lock size={16} />锁定</button>
            <button type="button" onClick={handleExport} disabled={busy}><Download size={16} />导出密文包</button>
            <button type="button" onClick={() => importInputRef.current?.click()} disabled={busy}><Upload size={16} />导入并替换</button>
            <button type="button" className={resetArmed ? 'vault-danger-button' : ''} onClick={handleReset} disabled={busy}>
              <Trash2 size={16} />{resetArmed ? '再点一次确认清空' : '清空本机原型'}
            </button>
          </nav>

          <input ref={importInputRef} type="file" accept="application/json,.json" className="vault-hidden-input" onChange={handleImport} />

          <section className="vault-workspace">
            <form className="vault-entry-card" onSubmit={handleSaveMemory}>
              <div className="vault-section-heading">
                <div><p>真实流程测试</p><h2>添加一条地点记忆</h2></div>
                <span>加密后写入</span>
              </div>

              <div className="vault-form-grid">
                <label className="vault-field-wide"><span>标题</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="这段记忆叫什么" required /></label>
                <label><span>日期</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
                <label><span>地点</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="例如：杭州西湖" /></label>
                <label className="vault-field-wide"><span>记忆正文</span><textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="写下当时发生的事……" rows={5} required /></label>
                <label className="vault-field-wide"><span>标签</span><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="旅行，家人，第一次" /></label>
              </div>

              <label className={`vault-photo-picker ${photo ? 'vault-photo-picker--selected' : ''}`}>
                <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} required />
                <span className="vault-photo-icon"><ImagePlus aria-hidden="true" /></span>
                <span className="vault-photo-copy">
                  <strong>{photo ? photo.name : '选择一张真实照片'}</strong>
                  <small>{photo ? `${formatBytes(photo.size)} · 保存后只留下密文` : 'JPG、PNG 或 WebP，最大 30MB'}</small>
                </span>
              </label>

              <button className="vault-primary-button" type="submit" disabled={!canSaveMemory}>
                {busy ? <LoaderCircle className="vault-spin" size={18} /> : <ShieldCheck size={18} />}
                {busy ? '正在加密照片和文字' : '在本机加密并保存'}
              </button>
            </form>

            <section className="vault-memories-panel">
              <div className="vault-section-heading">
                <div><p>解密结果</p><h2>我的地点记忆</h2></div>
                <span>{memories.length} 条</span>
              </div>

              {memories.length === 0 ? (
                <div className="vault-empty-state">
                  <ArchiveRestore size={28} aria-hidden="true" />
                  <h3>还没有密文记忆</h3>
                  <p>从左侧加入一条真实内容。保存后会立即从密文重新解密展示。</p>
                </div>
              ) : (
                <div className="vault-memory-list">
                  {memories.map((memory) => (
                    <article className="vault-memory-card" key={memory.id}>
                      {memory.photoUrls[0] && <img src={memory.photoUrls[0]} alt={memory.title} />}
                      <div className="vault-memory-content">
                        <div className="vault-memory-meta">
                          <span>{memory.date}</span>
                          {memory.location && <span><MapPin size={13} />{memory.location.name}</span>}
                        </div>
                        <h3>{memory.title}</h3>
                        <p>{memory.text}</p>
                        {memory.tags.length > 0 && <div className="vault-tags">{memory.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
                        <button type="button" className={deletingId === memory.id ? 'vault-confirm-delete' : 'vault-delete-link'} onClick={() => handleDelete(memory)} disabled={busy}>
                          <Trash2 size={14} />{deletingId === memory.id ? '再点一次删除密文' : '删除'}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </section>

          <section className="vault-evidence-strip">
            <div><span>记忆</span><strong>{cipherStats.memoryCount}</strong></div>
            <div><span>照片</span><strong>{cipherStats.photoCount}</strong></div>
            <div><span>密文字符</span><strong>{cipherStats.ciphertextCharacters.toLocaleString()}</strong></div>
            <code>{cipherStats.preview || '等待第一条密文'}</code>
          </section>
        </>
      )}

      {phase !== 'unlocked' && (
        <div className="vault-transfer-actions">
          <input ref={importInputRef} type="file" accept="application/json,.json" className="vault-hidden-input" onChange={handleImport} />
          {envelope && <button type="button" onClick={handleExport} disabled={busy}><Download size={16} />导出当前密文包</button>}
          <button type="button" onClick={() => importInputRef.current?.click()} disabled={busy}><Upload size={16} />导入密文包</button>
          {envelope && (
            <button type="button" className={resetArmed ? 'vault-danger-button' : ''} onClick={handleReset} disabled={busy}>
              <Trash2 size={16} />{resetArmed ? '再次确认清空' : '模拟新设备：清空本机'}
            </button>
          )}
        </div>
      )}

      <footer className="vault-footer">
        <span>只有主动点击同步时才连接本地密文服务</span>
        <a href="?legacy=1">查看原 Memories 界面</a>
      </footer>
    </main>
  );
}
