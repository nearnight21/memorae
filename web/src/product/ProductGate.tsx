import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff, KeyRound, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react';
import App from '../App';
import { createVault, decryptMemoryV2, destroyVaultSession, type VaultEnvelopeV1, type VaultSessionV1 } from '../crypto';
import { TOPIC_RECORD_ID } from '../memory/topic';
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
import { EMAIL_LOGIN_ENABLED, MEMORY_RECALL_API_URL, WECHAT_LOGIN_ENABLED } from '../sync/config';
import { downloadCiphertext, VaultMismatchError } from '../sync/syncActions';
import {
  exchangeWeChatLoginCode,
  loginSyncSession,
  MemoryRecallSyncClient,
  requestEmailVerificationCode,
  SyncRequestError,
  verifyEmailCode,
} from '../sync/syncClient';
import { privateSpaceUnlockErrorMessage, unlockPrivateSpaceLocally } from './privateSpaceUnlock';
import { navigateToLanding } from '../landing/landingRouting';
import travelPhoto from '../assets/login/travel-photo.png';
import erhaiPhoto from '../assets/login/erhai-photo.webp';
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

function clearWeChatCallbackQuery(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('wechat_code');
  url.searchParams.delete('wechat_error');
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

function AuthShell({ titleId, children }: AuthShellProps) {
  return (
    <main className="account-login-page">
      <button className="account-back-home" type="button" onClick={navigateToLanding}>
        <ArrowLeft size={17} aria-hidden="true" /> 返回首页
      </button>
      <span className="account-coordinate account-coordinate-north" aria-hidden="true">△ 36°N, 120°E</span>
      <span className="account-coordinate account-coordinate-south" aria-hidden="true">25°N / 100°E</span>
      <div className="account-login-layout">
        <div className="account-login-visual" aria-hidden="true">
          <svg className="account-login-route" viewBox="0 0 560 740" fill="none">
            <path d="M270 -40C100 30 110 145 225 170S515 265 400 365S100 435 150 545S405 595 425 760" stroke="#b8a892" strokeWidth="1.3" strokeDasharray="4 6" />
            <g className="account-route-waypoints" fill="#d49a47">
              <circle cx="185" cy="154" r="5" /><circle cx="424" cy="291" r="5" />
              <circle cx="145" cy="526" r="5" /><circle cx="348" cy="650" r="5" />
            </g>
            <g className="account-route-years" fill="#95836c">
              <text x="202" y="143" transform="rotate(22 202 143)">2012</text>
              <text x="437" y="271" transform="rotate(66 437 271)">2018</text>
              <text x="104" y="555" transform="rotate(54 104 555)">2024</text>
              <text x="359" y="682" transform="rotate(34 359 682)">2026</text>
            </g>
          </svg>
          <figure className="account-polaroid account-polaroid-street">
            <span className="account-photo-pin" />
            <img src={travelPhoto} alt="" width="270" height="300" />
            <figcaption>暮色里的街巷 <time dateTime="2018-07-21">2018.07</time></figcaption>
          </figure>
          <figure className="account-polaroid account-polaroid-lake">
            <span className="account-photo-pin" />
            <img src={erhaiPhoto} alt="" width="270" height="300" />
            <figcaption>Erhai <span>把风景，留给以后</span></figcaption>
          </figure>
          <p className="account-visual-caption">走过的地方，都是可以回去的时光。</p>
        </div>
        <section className="account-login-content account-card" aria-labelledby={titleId}>
          <header className="account-login-brand">
            <span className="account-security-badge"><LockKeyhole size={13} aria-hidden="true" /> 本地加密 · 密文同步</span>
            <div className="account-brand-title"><h1 id={titleId}>所忆</h1><p>Memorae</p></div>
          </header>
          {children}
        </section>
      </div>
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
  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [emailNotice, setEmailNotice] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerPasswordConfirmation, setRegisterPasswordConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showAccountPassword, setShowAccountPassword] = useState(false);
  const [showPrivateSpacePassword, setShowPrivateSpacePassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [localVaultMismatch, setLocalVaultMismatch] = useState(false);
  const [clearLocalArmed, setClearLocalArmed] = useState(false);

  useEffect(() => {
    setBusy(true);
    void Promise.all([getVaultEnvelope(), getStoredAccountSession()])
      .then(async ([storedVault, storedAccount]) => {
        setVault(storedVault);
        if (!MEMORY_RECALL_API_URL) {
          setPhase(storedVault ? 'locked' : 'setup');
          return;
        }
        let activeAccount = storedAccount;
        const callbackUrl = new URL(window.location.href);
        const wechatCode = callbackUrl.searchParams.get('wechat_code');
        const wechatError = callbackUrl.searchParams.get('wechat_error');
        if (wechatCode) {
          clearWeChatCallbackQuery();
          try {
            activeAccount = await exchangeWeChatLoginCode(MEMORY_RECALL_API_URL, wechatCode);
            await saveStoredAccountSession(activeAccount);
          } catch (exchangeError) {
            setError(exchangeError instanceof Error ? exchangeError.message : '微信登录失败，请重试。');
            activeAccount = null;
          }
        } else if (wechatError) {
          clearWeChatCallbackQuery();
          setError(
            wechatError === 'wechat_denied'
              ? '你取消了微信授权。'
              : '微信登录暂时不可用，请稍后重试。',
          );
        }
        if (!activeAccount || !isAccountSessionActive(activeAccount)) {
          if (activeAccount) await clearStoredAccountSession();
          setPhase('account');
          return;
        }
        setAccountSession(activeAccount);
        if (storedVault) {
          try {
            await validateAccountVault(activeAccount, storedVault);
          } catch (validationError) {
            setLocalVaultMismatch(validationError instanceof VaultMismatchError);
            setError(privateSpaceUnlockErrorMessage(validationError));
            setPhase('account');
            return;
          }
          setPhase('locked');
          return;
        }
        setPhase('locked');
        try {
          await restoreRemoteVault(activeAccount);
        } catch (restoreError) {
          setError(privateSpaceUnlockErrorMessage(restoreError));
        }
      })
      .catch((bootError) => {
        setError(bootError instanceof Error ? bootError.message : '无法打开所忆。');
        setPhase(MEMORY_RECALL_API_URL ? 'account' : 'setup');
      })
      .finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    setClearLocalArmed(false);
  }, [phase, password, confirmation, loginName, accountPassword, authMode]);

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
          decryptMemory: async (memory) => {
            // 主题集合是一条保留记录，不参与照片引用扫描。
            if (memory.id === TOPIC_RECORD_ID) return { photos: [] };
            return (await decryptMemoryV2(activeSession, memory)).memory;
          },
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
        const login = { ...await loginSyncSession(MEMORY_RECALL_API_URL, {
          loginName: loginName.trim(),
          password: accountPassword,
          deviceId: 'web-product',
        }), loginName: loginName.trim() };
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
    if (busy) return;
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
      if (MEMORY_RECALL_API_URL && accountSession) {
        // 撤销旧会话不阻塞本机退出，离线时仍可回到登录页。
        void new MemoryRecallSyncClient({
          baseUrl: MEMORY_RECALL_API_URL,
          token: accountSession.accessToken,
        }).logout().catch(() => undefined);
      }
      setVault(null);
      setSession(null);
      setAccountSession(null);
      setMemories([]);
      setPassword('');
      setConfirmation('');
      setAccountPassword('');
      setLoginName('');
      setEmail('');
      setEmailCode('');
      setEmailCodeSent(false);
      setEmailNotice('');
      setRegisterPassword('');
      setRegisterPasswordConfirmation('');
      setAuthMode('login');
      setShowAccountPassword(false);
      setShowPrivateSpacePassword(false);
      setError('');
      setLocalVaultMismatch(false);
      setClearLocalArmed(false);
      setPhase(MEMORY_RECALL_API_URL ? 'account' : 'setup');
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

  const startWeChatLogin = () => {
    if (!MEMORY_RECALL_API_URL || !WECHAT_LOGIN_ENABLED || busy) return;
    const returnTo = `${window.location.origin}${window.location.pathname}`;
    const url = new URL('/v1/auth/wechat/start', MEMORY_RECALL_API_URL);
    url.searchParams.set('returnTo', returnTo);
    window.location.assign(url.toString());
  };

  const requestEmailCode = async () => {
    if (!MEMORY_RECALL_API_URL || busy) return;
    setBusy(true);
    setError('');
    setEmailNotice('');
    try {
      await requestEmailVerificationCode(MEMORY_RECALL_API_URL, email.trim(), 'register');
      setEmailCodeSent(true);
      setEmailNotice('验证码已发送，请检查邮箱。');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '验证码邮件暂时无法发送。');
    } finally {
      setBusy(false);
    }
  };

  const verifyEmail = async () => {
    if (!MEMORY_RECALL_API_URL || busy) return;
    if (registerPassword.length < 8) {
      setError('密码至少需要 8 个字符。');
      return;
    }
    if (registerPassword !== registerPasswordConfirmation) {
      setError('两次输入的密码不一致。');
      return;
    }
    setBusy(true);
    setError('');
    setEmailNotice('');
    try {
      const login = {
        ...await verifyEmailCode(MEMORY_RECALL_API_URL, email.trim(), emailCode.trim(), registerPassword),
        loginName: email.trim(),
      };
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
      setEmailCode('');
      if (vault) setPhase('locked');
      else {
        setPhase('locked');
        try {
          await restoreRemoteVault(login);
        } catch (restoreError) {
          setError(privateSpaceUnlockErrorMessage(restoreError));
        }
      }
    } catch (verifyError) {
      setLocalVaultMismatch(verifyError instanceof VaultMismatchError);
      setError(
        verifyError instanceof VaultMismatchError
          ? privateSpaceUnlockErrorMessage(verifyError)
          : verifyError instanceof Error ? verifyError.message : '邮箱验证失败，请重试。',
      );
    } finally {
      setBusy(false);
    }
  };

  function renderCurrentAccount() {
    if (!accountSession) return null;
    const label = typeof accountSession.loginName === 'string' ? accountSession.loginName.trim() : '';
    return <p className="account-login-current-account">{label ? `当前账号：${label}` : '已登录当前账号'}</p>;
  }

  function renderAccountSwitch() {
    if (!MEMORY_RECALL_API_URL) return null;
    return (
      <div className="account-unlock-footer-actions">
        <button
          type="button"
          className="account-switch-trigger"
          disabled={busy}
          aria-expanded={clearLocalArmed}
          aria-controls="account-switch-confirm"
          onClick={() => setClearLocalArmed((armed) => !armed)}
        >
          {phase === 'locked' ? '忘记密码或切换其他账号？' : '切换其他账号'}
        </button>
        {clearLocalArmed && (
          <section className="account-login-switch-confirm" id="account-switch-confirm" aria-label="确认切换账号">
            {phase === 'locked' && <p>私密空间密码无法由服务器找回或重置。</p>}
            <p>切换账号会清除这台设备上的私密空间和本机数据，再返回账号登录页。云端已同步的记忆不受影响。</p>
            <p className="account-switch-warning">尚未同步的本机内容将无法恢复。若还需要这些内容，请取消切换。</p>
            <div className="account-switch-buttons">
              <button type="button" onClick={() => void clearLocalSpaceForAccountSwitch()} disabled={busy}>
                {busy ? '正在退出…' : '确认退出并切换账号'}
              </button>
              <button type="button" onClick={() => setClearLocalArmed(false)} disabled={busy}>取消</button>
            </div>
          </section>
        )}
      </div>
    );
  }

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
            <h2>正在打开所忆</h2>
            <p>正在读取这台设备上的账号会话和加密信息</p>
          </div>
        </section>
      </AuthShell>
    );
  }

  if (phase === 'account') {
    const switchAuthMode = (mode: 'login' | 'register') => {
      if (mode === authMode) return;
      setAuthMode(mode);
      setEmailCodeSent(false);
      setEmailCode('');
      setEmailNotice('');
      setRegisterPassword('');
      setRegisterPasswordConfirmation('');
      setError('');
    };
    return (
      <AuthShell titleId="account-login-title">
        <div className="account-login-form">
            {authMode === 'register' && MEMORY_RECALL_API_URL && EMAIL_LOGIN_ENABLED && (
              <form
                className="account-login-email"
                aria-label="邮箱注册"
                onSubmit={(event) => {
                  event.preventDefault();
                  void (emailCodeSent ? verifyEmail() : requestEmailCode());
                }}
              >
                <p className="account-login-method-label">注册新账号</p>
                <label className="account-login-field" htmlFor="account-email">
                  <span>邮箱</span>
                  <input
                    id="account-email"
                    type="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setEmailCodeSent(false);
                      setEmailCode('');
                      setEmailNotice('');
                    }}
                    autoComplete="email"
                    placeholder="请输入邮箱地址"
                    required
                  />
                </label>
                {!emailCodeSent ? (
                  <button className="account-login-code" type="submit" disabled={busy || !email.trim()}>
                    {busy && <LoaderCircle className="animate-spin" size={16} aria-hidden="true" />}
                    发送验证码
                  </button>
                ) : (
                  <>
                    <label className="account-login-field" htmlFor="account-email-code">
                      <span>验证码</span>
                      <input
                        id="account-email-code"
                        inputMode="numeric"
                        value={emailCode}
                        onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                        autoComplete="one-time-code"
                        placeholder="输入 6 位验证码"
                        required
                      />
                    </label>
                    <label className="account-login-field" htmlFor="account-register-password">
                      <span>设置密码</span>
                      <input
                        id="account-register-password"
                        type="password"
                        value={registerPassword}
                        onChange={(event) => setRegisterPassword(event.target.value)}
                        autoComplete="new-password"
                        placeholder="至少 8 位密码"
                        required
                      />
                    </label>
                    <label className="account-login-field" htmlFor="account-register-password-confirmation">
                      <span>确认密码</span>
                      <input
                        id="account-register-password-confirmation"
                        type="password"
                        value={registerPasswordConfirmation}
                        onChange={(event) => setRegisterPasswordConfirmation(event.target.value)}
                        autoComplete="new-password"
                        placeholder="再次输入密码"
                        required
                      />
                    </label>
                    <button className="account-login-code account-login-code-primary" type="submit" disabled={busy || emailCode.length !== 6 || registerPassword.length < 8}>
                      {busy && <LoaderCircle className="animate-spin" size={16} aria-hidden="true" />}
                      完成注册
                    </button>
                    <button className="account-login-code account-login-code-secondary" type="button" onClick={() => setEmailCodeSent(false)} disabled={busy}>
                      更换邮箱
                    </button>
                  </>
                )}
              </form>
            )}
            {emailNotice && <p className="account-login-notice" role="status">{emailNotice}</p>}
            {error && <p className="account-login-error" role="alert">{error}</p>}
            {authMode === 'login' && (
              <>
            <form className="account-login-password-form" onSubmit={handleSubmit}>
            <label className="account-login-field" htmlFor="account-login-name">
              <span>账号</span>
              <input
                id="account-login-name"
                value={loginName}
                onChange={(event) => setLoginName(event.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="请输入邮箱或所忆账号"
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
                  {showAccountPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </span>
            </label>

            <button className="account-login-submit" type="submit" disabled={busy}>
              {busy && <LoaderCircle className="animate-spin" size={18} aria-hidden="true" />}
              <span>{busy ? '正在登录' : '进入记忆空间'}</span>
              {!busy && <ArrowRight size={17} aria-hidden="true" />}
            </button>
            </form>
            {MEMORY_RECALL_API_URL && WECHAT_LOGIN_ENABLED && (
              <button
                className="account-login-wechat"
                type="button"
                onClick={startWeChatLogin}
                disabled={busy}
              >
                微信登录 / 注册
              </button>
            )}
              </>
            )}
            {MEMORY_RECALL_API_URL && EMAIL_LOGIN_ENABLED && (
              <p className="account-login-mode-switch">
                {authMode === 'register' ? '已有账号？' : '还没有账号？'}
                <button
                  type="button"
                  onClick={() => switchAuthMode(authMode === 'register' ? 'login' : 'register')}
                  disabled={busy}
                >
                  {authMode === 'register' ? '登录' : '注册'}
                </button>
              </p>
            )}
            {authMode === 'register' && EMAIL_LOGIN_ENABLED && (
              <p className="account-login-invite-note">
                注册后可用邮箱和密码登录；私密空间密码仍只在本机设置。
              </p>
            )}
        </div>

        {localVaultMismatch && (
          <section className="account-login-switch" aria-label="切换所忆账号">
            <p>这台设备保存的是另一个账号的私密空间。切换会清除本机数据，尚未同步的内容将无法恢复；云端已同步的记忆不受影响。</p>
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
            {renderCurrentAccount()}
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
                {showPrivateSpacePassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
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
        {renderAccountSwitch()}
      </AuthShell>
    );
  }

  return (
    <AuthShell titleId="private-space-setup-title">
      <form className="account-login-form account-login-setup-form" onSubmit={handleSubmit}>
        <div className="account-login-unlock-intro">
          <h2><KeyRound size={16} aria-hidden="true" /> 建立你的记忆空间</h2>
          <p>记忆和照片会先在这台设备加密。密码不会上传，也无法由服务器重置。</p>
          {renderCurrentAccount()}
        </div>
        <label className="account-login-field" htmlFor="private-space-setup-password">
          <span>私密空间密码</span>
          <span className="account-login-password-row">
            <input
              id="private-space-setup-password"
              type={showPrivateSpacePassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              placeholder="至少 8 个字符"
              required
            />
            <button
              type="button"
              onClick={() => setShowPrivateSpacePassword((visible) => !visible)}
              aria-label={showPrivateSpacePassword ? '隐藏私密空间密码' : '显示私密空间密码'}
              aria-pressed={showPrivateSpacePassword}
            >
              {showPrivateSpacePassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </span>
        </label>
        <label className="account-login-field" htmlFor="private-space-setup-confirmation">
          <span>再次输入密码</span>
          <input
            id="private-space-setup-confirmation"
            type="password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="new-password"
            placeholder="再次输入私密空间密码"
            required
          />
        </label>
        {error && <p className="account-login-error" role="alert">{error}</p>}
        <button className="account-login-submit" type="submit" disabled={busy}>
          {busy ? <LoaderCircle className="animate-spin" size={18} aria-hidden="true" /> : <ShieldCheck size={18} aria-hidden="true" />}
          {busy ? '正在处理' : '创建并进入所忆'}
        </button>
        {import.meta.env.DEV && (
          <a className="account-developer-link" href="?dev-vault=1">开发人员：打开密文验证工具</a>
        )}
      </form>
      {renderAccountSwitch()}
    </AuthShell>
  );
}
