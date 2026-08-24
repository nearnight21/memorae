import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { KeyRound, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react';
import App from '../App';
import MapView from '../components/MapView';
import { createVault, decryptMemoryV2, destroyVaultSession, type VaultEnvelopeV1, type VaultSessionV1 } from '../crypto';
import {
  clearStoredAccountSession,
  getStoredAccountSession,
  getVaultEnvelope,
  markCipherSyncPending,
  saveCipherSyncPlan,
  clearPrototypeDatabase,
  saveStoredAccountSession,
  saveVaultEnvelope,
} from '../prototype/storage';
import { loadProductMemories } from './productStore';
import { revokeRegisteredPhotos } from './photoRegistry';
import type { Memory } from '../types';
import { isAccountSessionActive, type StoredAccountSession } from '../sync/accountSession';
import { cipherSyncStorage } from '../sync/cipherSyncStorage';
import { MEMORY_RECALL_API_URL } from '../sync/config';
import { downloadCiphertext, VaultMismatchError } from '../sync/syncActions';
import { loginSyncSession, MemoryRecallSyncClient, SyncRequestError } from '../sync/syncClient';
import { privateSpaceUnlockErrorMessage, unlockPrivateSpaceLocally } from './privateSpaceUnlock';
import photoBacking from '../assets/login/photo-backing.svg';
import timeNodeCurrent from '../assets/login/time-node-current.svg';
import timeNodeSmall from '../assets/login/time-node-small.svg';
import timePath from '../assets/login/time-path.svg';
import travelPhoto from '../assets/login/travel-photo.png';
import './product-gate.css';

type GatePhase = 'booting' | 'account' | 'setup' | 'locked' | 'unlocked';

export interface ProductGateUnlockedContext {
  session: VaultSessionV1;
  accountSession: StoredAccountSession | null;
  initialMemories: Memory[];
  onLock: () => void;
}

interface ProductGateProps {
  unlockedRenderer?: (context: ProductGateUnlockedContext) => ReactNode;
  loadUnlockedMemories?: (session: VaultSessionV1) => Promise<Memory[]>;
  syncPhotosOnUnlock?: boolean;
}

interface AuthShellProps {
  titleId: string;
  children: ReactNode;
}

const AUTH_TIMELINE = [
  { year: '2007', left: '17.8%', top: '73.4%', current: false },
  { year: '2012', left: '40.7%', top: '57.2%', current: false },
  { year: '2018', left: '63.8%', top: '44.4%', current: true },
  { year: '2026', left: '93.4%', top: '11.1%', current: false },
];

function AuthShell({ titleId, children }: AuthShellProps) {
  return (
    <main className="account-login-page">
      <div className="account-login-map" aria-hidden="true">
        <MapView
          memories={[]}
          selectedMemory={null}
          onSelectMemory={() => undefined}
          onCloseMemory={() => undefined}
          signedOutBackdrop
        />
      </div>
      <div className="account-login-map-wash" aria-hidden="true" />

      <figure className="account-login-photo" aria-label="2018 年 7 月 21 日的旅行照片">
        <img className="account-login-photo-backing" src={photoBacking} alt="" />
        <div className="account-login-photo-emulsion">
          <img src={travelPhoto} alt="夕阳下的街道、行人与车辆" />
        </div>
        <time dateTime="2018-07-21">2018.07.21</time>
        <span className="account-login-photo-curl" aria-hidden="true" />
      </figure>

      <div className="account-login-timeline" aria-hidden="true">
        <img className="account-login-time-path" src={timePath} alt="" />
        {AUTH_TIMELINE.map(({ year, left, top, current }) => (
          <span key={year} className="account-login-time-node" style={{ left, top }}>
            <img src={current ? timeNodeCurrent : timeNodeSmall} alt="" />
            <b className={year === '2026' ? 'is-leading' : undefined}>{year}</b>
          </span>
        ))}
      </div>

      <div className="account-login-form-wash" aria-hidden="true" />
      <section className="account-login-content" aria-labelledby={titleId}>
        <header className="account-login-brand">
          <h1 id={titleId}>所忆</h1>
          <p>Memorae</p>
        </header>
        {children}
      </section>
    </main>
  );
}

export default function ProductGate({
  unlockedRenderer,
  loadUnlockedMemories = loadProductMemories,
  syncPhotosOnUnlock = true,
}: ProductGateProps = {}) {
  const [phase, setPhase] = useState<GatePhase>('booting');
  const [vault, setVault] = useState<VaultEnvelopeV1 | null>(null);
  const [session, setSession] = useState<VaultSessionV1 | null>(null);
  const [accountSession, setAccountSession] = useState<StoredAccountSession | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loginName, setLoginName] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showAccountPassword, setShowAccountPassword] = useState(false);
  const [showPrivateSpacePassword, setShowPrivateSpacePassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [localVaultMismatch, setLocalVaultMismatch] = useState(false);
  const [clearLocalArmed, setClearLocalArmed] = useState(false);

  useEffect(() => {
    void Promise.all([getVaultEnvelope(), getStoredAccountSession()])
      .then(async ([storedVault, storedAccount]) => {
        setVault(storedVault);
        if (!MEMORY_RECALL_API_URL) {
          setPhase(storedVault ? 'locked' : 'setup');
          return;
        }
        if (!storedAccount || !isAccountSessionActive(storedAccount)) {
          if (storedAccount) await clearStoredAccountSession();
          setPhase('account');
          return;
        }
        setAccountSession(storedAccount);
        if (storedVault) {
          setPhase('locked');
          return;
        }
        setPhase('locked');
        try {
          await restoreRemoteVault(storedAccount);
        } catch (restoreError) {
          setError(privateSpaceUnlockErrorMessage(restoreError));
        }
      })
      .catch((bootError) => {
        setError(bootError instanceof Error ? bootError.message : '无法打开所忆。');
        setPhase(MEMORY_RECALL_API_URL ? 'account' : 'setup');
      });
  }, []);

  const restoreRemoteVault = async (
    activeAccount: StoredAccountSession,
  ): Promise<VaultEnvelopeV1 | null> => {
    const client = new MemoryRecallSyncClient({
      baseUrl: MEMORY_RECALL_API_URL,
      token: activeAccount.accessToken,
    });
    try {
      const remoteVault = await client.getVault();
      await saveVaultEnvelope(remoteVault);
      setVault(remoteVault);
      setPhase('locked');
      return remoteVault;
    } catch (restoreError) {
      if (restoreError instanceof SyncRequestError && restoreError.status === 404) {
        setPhase('setup');
        return null;
      }
      if (restoreError instanceof SyncRequestError && restoreError.status === 401) {
        await clearStoredAccountSession();
        setAccountSession(null);
        setPhase('account');
        return null;
      }
      throw restoreError;
    }
  };

  const validateAccountVault = async (
    activeAccount: StoredAccountSession,
    localVault: VaultEnvelopeV1,
  ): Promise<void> => {
    const client = new MemoryRecallSyncClient({
      baseUrl: MEMORY_RECALL_API_URL,
      token: activeAccount.accessToken,
    });
    try {
      const remoteVault = await client.getVault();
      if (JSON.stringify(remoteVault) !== JSON.stringify(localVault)) {
        throw new VaultMismatchError();
      }
    } catch (validationError) {
      if (validationError instanceof SyncRequestError && validationError.status === 404) return;
      throw validationError;
    }
  };

  const finishUnlock = async (activeSession: VaultSessionV1) => {
    if (
      MEMORY_RECALL_API_URL
      && accountSession
      && isAccountSessionActive(accountSession)
      && navigator.onLine
    ) {
      try {
        await downloadCiphertext({
          client: new MemoryRecallSyncClient({
            baseUrl: MEMORY_RECALL_API_URL,
            token: accountSession.accessToken,
          }),
          storage: cipherSyncStorage,
          downloadPhotos: syncPhotosOnUnlock,
          decryptMemory: async (memory) => (await decryptMemoryV2(activeSession, memory)).memory,
        });
      } catch (syncError) {
        if (syncError instanceof VaultMismatchError) {
          destroyVaultSession(activeSession);
          throw syncError;
        }
        if (syncError instanceof SyncRequestError && syncError.status === 401) {
          await clearStoredAccountSession();
          setAccountSession(null);
        }
        // 本机私密空间仍可离线使用；待网络或账号会话恢复后继续同步。
      }
    }
    setSession(activeSession);
    setMemories(await loadUnlockedMemories(activeSession));
    setPassword('');
    setConfirmation('');
    setShowPrivateSpacePassword(false);
    setPhase('unlocked');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (phase === 'account') {
        const login = await loginSyncSession(MEMORY_RECALL_API_URL, {
          loginName: loginName.trim(),
          password: accountPassword,
          deviceId: 'web-product',
        });
        try {
          if (vault) await validateAccountVault(login, vault);
        } catch (validationError) {
          await new MemoryRecallSyncClient({
            baseUrl: MEMORY_RECALL_API_URL,
            token: login.accessToken,
          }).logout().catch(() => undefined);
          throw validationError;
        }
        await saveStoredAccountSession(login);
        setAccountSession(login);
        setAccountPassword('');
        if (vault) setPhase('locked');
        else {
          setPhase('locked');
          try {
            await restoreRemoteVault(login);
          } catch (restoreError) {
            setError(privateSpaceUnlockErrorMessage(restoreError));
          }
        }
      } else if (phase === 'setup') {
        if (password.length < 8) throw new Error('私密空间密码至少需要 8 个字符。');
        if (password !== confirmation) throw new Error('两次输入的私密空间密码不一致。');
        const created = await createVault(password);
        await saveVaultEnvelope(created.envelope);
        // 初始化私密空间只需要把钥匙信封送到服务端，不应隐式扫描全库照片。
        await saveCipherSyncPlan({ memoryIds: [], photoRefs: [] });
        await markCipherSyncPending();
        setVault(created.envelope);
        await finishUnlock(created.session);
      } else if (phase === 'locked') {
        const activeVault = vault ?? (
          accountSession ? await restoreRemoteVault(accountSession) : null
        );
        if (activeVault) {
          const activeSession = await unlockPrivateSpaceLocally(activeVault, password);
          // 本机信封验证一结束就移除密码状态；后续密文同步只接收内存会话密钥。
          setPassword('');
          setShowPrivateSpacePassword(false);
          try {
            await finishUnlock(activeSession);
          } catch (finishError) {
            if (!activeSession.destroyed) destroyVaultSession(activeSession);
            throw finishError;
          }
        }
      }
    } catch (submitError) {
      setLocalVaultMismatch(submitError instanceof VaultMismatchError);
      setClearLocalArmed(false);
      setError(
        phase === 'locked'
          ? privateSpaceUnlockErrorMessage(submitError)
          : submitError instanceof Error ? submitError.message : '无法打开私密空间。',
      );
    } finally {
      setBusy(false);
    }
  };

  const clearLocalSpaceForAccountSwitch = async () => {
    if (!clearLocalArmed) {
      setClearLocalArmed(true);
      return;
    }
    setBusy(true);
    try {
      if (session) destroyVaultSession(session);
      revokeRegisteredPhotos();
      await clearPrototypeDatabase();
      await clearStoredAccountSession();
      setVault(null);
      setSession(null);
      setAccountSession(null);
      setMemories([]);
      setPassword('');
      setConfirmation('');
      setAccountPassword('');
      setShowPrivateSpacePassword(false);
      setError('');
      setLocalVaultMismatch(false);
      setClearLocalArmed(false);
      setPhase('account');
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : '本机数据清除失败，请重试。');
    } finally {
      setBusy(false);
    }
  };

  const lock = () => {
    if (session) destroyVaultSession(session);
    revokeRegisteredPhotos();
    setSession(null);
    setMemories([]);
    setPassword('');
    setShowPrivateSpacePassword(false);
    const needsAccount = Boolean(
      MEMORY_RECALL_API_URL
      && (!accountSession || !isAccountSessionActive(accountSession)),
    );
    setPhase(needsAccount ? 'account' : vault ? 'locked' : 'setup');
  };

  const handleAccountSessionExpired = () => {
    setAccountSession(null);
  };

  if (phase === 'unlocked' && session) {
    if (unlockedRenderer) {
      return unlockedRenderer({
        session,
        accountSession,
        initialMemories: memories,
        onLock: lock,
      });
    }
    return (
      <App
        session={session}
        accountSession={accountSession}
        initialMemories={memories}
        onAccountSessionExpired={handleAccountSessionExpired}
        onLock={lock}
      />
    );
  }

  if (phase === 'booting') {
    return (
      <AuthShell titleId="account-login-loading-title">
        <section className="account-login-loading" role="status" aria-live="polite">
          <LoaderCircle className="animate-spin" size={22} aria-hidden="true" />
          <div>
            <h2 id="account-login-loading-title">正在打开所忆</h2>
            <p>正在读取这台设备上的账号会话和加密信息</p>
          </div>
        </section>
      </AuthShell>
    );
  }

  if (phase === 'account') {
    return (
      <AuthShell titleId="account-login-title">
        <form className="account-login-form" onSubmit={handleSubmit}>
            <label className="account-login-field" htmlFor="account-login-name">
              <span>账号</span>
              <input
                id="account-login-name"
                value={loginName}
                onChange={(event) => setLoginName(event.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="请输入所忆账号"
                required
              />
            </label>

            <label className="account-login-field" htmlFor="account-login-password">
              <span>密码</span>
              <span className="account-login-password-row">
                <input
                  id="account-login-password"
                  type={showAccountPassword ? 'text' : 'password'}
                  value={accountPassword}
                  onChange={(event) => setAccountPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="请输入密码"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowAccountPassword((visible) => !visible)}
                  aria-label={showAccountPassword ? '隐藏密码' : '显示密码'}
                  aria-pressed={showAccountPassword}
                >
                  {showAccountPassword ? '隐藏' : '显示'}
                </button>
              </span>
            </label>

            {error && <p className="account-login-error" role="alert">{error}</p>}

            <button className="account-login-submit" type="submit" disabled={busy}>
              {busy && <LoaderCircle className="animate-spin" size={18} aria-hidden="true" />}
              {busy ? '正在登录' : '登录'}
            </button>
            <p className="account-login-invite-note">内测版本 · 仅限受邀账号</p>
        </form>

        {localVaultMismatch && (
          <section className="account-login-switch" aria-label="切换所忆账号">
            <p>这台设备保存的是另一个账号的私密空间。切换只会清除本机数据，不会删除云端记忆。</p>
            <div>
              <button type="button" onClick={() => void clearLocalSpaceForAccountSwitch()} disabled={busy}>
                {clearLocalArmed ? '再次点击确认清除' : '清除本机数据并切换'}
              </button>
              {clearLocalArmed && (
                <button type="button" onClick={() => setClearLocalArmed(false)} disabled={busy}>取消</button>
              )}
            </div>
          </section>
        )}
      </AuthShell>
    );
  }

  if (phase === 'locked') {
    return (
      <AuthShell titleId="private-space-unlock-title">
        <form className="account-login-form account-login-unlock-form" onSubmit={handleSubmit}>
          <div className="account-login-unlock-intro">
            <h2>私密空间</h2>
            <p>输入密码以解锁加密记忆</p>
          </div>

          <label className="account-login-field" htmlFor="private-space-password">
            <span>私密空间密码</span>
            <span className="account-login-password-row">
              <input
                id="private-space-password"
                type={showPrivateSpacePassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="off"
                placeholder="请输入私密空间密码"
                required
              />
              <button
                type="button"
                onClick={() => setShowPrivateSpacePassword((visible) => !visible)}
                aria-label={showPrivateSpacePassword ? '隐藏私密空间密码' : '显示私密空间密码'}
                aria-pressed={showPrivateSpacePassword}
              >
                {showPrivateSpacePassword ? '隐藏' : '显示'}
              </button>
            </span>
          </label>

          {error && <p className="account-login-error" role="alert">{error}</p>}

          <button className="account-login-submit" type="submit" disabled={busy}>
            {busy && <LoaderCircle className="animate-spin" size={18} aria-hidden="true" />}
            {busy ? '正在解锁' : '解锁并进入'}
          </button>
          <p className="account-login-invite-note">密码仅在本机验证，不会上传</p>
        </form>
      </AuthShell>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#17140f] px-5 py-10 text-[#F0E7D5]">
      <section className="w-full max-w-md rounded-[28px] border border-[#8D7145]/35 bg-[#211D17] p-8 shadow-[0_28px_90px_rgba(0,0,0,0.45)]">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#A88446]/45 bg-[#2B251C] text-[#D3B06B]">
            {phase === 'setup' ? <KeyRound /> : <LockKeyhole />}
          </span>
          <div>
            <p className="text-[11px] tracking-[0.2em] text-[#A88C5C]">所忆 · 私密空间</p>
            <h1 className="mt-1 font-editorial-serif text-3xl">建立你的记忆空间</h1>
          </div>
        </div>
        <p className="mt-6 text-sm leading-7 text-[#BDB3A1]">
          记忆和照片会先在这台设备加密。密码不会上传，也无法由服务器重置。
        </p>
        {error && <p className="mt-4 rounded-xl border border-red-700/35 bg-red-950/25 px-4 py-3 text-sm text-red-200">{error}</p>}
        <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-xs text-[#B9AA91]">
            私密空间密码
            <input className="mt-2 w-full rounded-xl border border-[#6E5A39] bg-[#15120E] px-4 py-3 text-[#F6EEDC] outline-none focus:border-[#C39D59]" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required />
          </label>
          <label className="block text-xs text-[#B9AA91]">
            再次输入密码
            <input className="mt-2 w-full rounded-xl border border-[#6E5A39] bg-[#15120E] px-4 py-3 text-[#F6EEDC] outline-none focus:border-[#C39D59]" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" required />
          </label>
          <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#C29A54] px-4 py-3 font-semibold text-[#17130D] transition-colors hover:bg-[#D5B36F] disabled:opacity-55" type="submit" disabled={busy}>
            {busy ? <LoaderCircle className="animate-spin" size={18} /> : <ShieldCheck size={18} />}
            {busy ? '正在处理' : '创建并进入所忆'}
          </button>
        </form>
        {import.meta.env.DEV && (
          <a className="mt-7 block text-center text-[11px] text-[#7E725F] hover:text-[#B89A68]" href="?dev-vault=1">开发人员：打开密文验证工具</a>
        )}
      </section>
    </main>
  );
}
