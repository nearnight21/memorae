import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react';
import App from '../App';
import { createVault, destroyVaultSession, unlockVault, type VaultEnvelopeV1, type VaultSessionV1 } from '../crypto';
import { getVaultEnvelope, saveVaultEnvelope } from '../prototype/storage';
import { loadProductMemories } from './productStore';
import { revokeRegisteredPhotos } from './photoRegistry';
import type { Memory } from '../types';

type GatePhase = 'booting' | 'setup' | 'locked' | 'unlocked';

export default function ProductGate() {
  const [phase, setPhase] = useState<GatePhase>('booting');
  const [vault, setVault] = useState<VaultEnvelopeV1 | null>(null);
  const [session, setSession] = useState<VaultSessionV1 | null>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getVaultEnvelope()
      .then((stored) => {
        setVault(stored);
        setPhase(stored ? 'locked' : 'setup');
      })
      .catch((bootError) => {
        setError(bootError instanceof Error ? bootError.message : '无法读取本机私密空间。');
        setPhase('setup');
      });
  }, []);

  const finishUnlock = async (activeSession: VaultSessionV1) => {
    setSession(activeSession);
    setMemories(await loadProductMemories(activeSession));
    setPassword('');
    setConfirmation('');
    setPhase('unlocked');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (phase === 'setup') {
        if (password.length < 8) throw new Error('私密空间密码至少需要 8 个字符。');
        if (password !== confirmation) throw new Error('两次输入的私密空间密码不一致。');
        const created = await createVault(password);
        await saveVaultEnvelope(created.envelope);
        setVault(created.envelope);
        await finishUnlock(created.session);
      } else if (phase === 'locked' && vault) {
        await finishUnlock(await unlockVault(vault, password));
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '无法打开私密空间。');
    } finally {
      setBusy(false);
    }
  };

  const lock = () => {
    if (session) destroyVaultSession(session);
    revokeRegisteredPhotos();
    setSession(null);
    setMemories([]);
    setPhase(vault ? 'locked' : 'setup');
  };

  if (phase === 'unlocked' && session) {
    return <App session={session} initialMemories={memories} onLock={lock} />;
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
            <h1 className="mt-1 font-editorial-serif text-3xl">{phase === 'setup' ? '建立你的记忆空间' : '欢迎回来'}</h1>
          </div>
        </div>
        <p className="mt-6 text-sm leading-7 text-[#BDB3A1]">
          {phase === 'setup'
            ? '记忆和照片会先在这台设备加密。密码不会上传，也无法由服务器重置。'
            : '在这台设备上解锁后，直接进入你的软木板、时间线和足迹地图。'}
        </p>
        {error && <p className="mt-4 rounded-xl border border-red-700/35 bg-red-950/25 px-4 py-3 text-sm text-red-200">{error}</p>}
        {phase === 'booting' ? (
          <div className="mt-8 flex items-center justify-center gap-2 text-sm text-[#BDB3A1]"><LoaderCircle className="animate-spin" />正在读取本机密文</div>
        ) : (
          <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
            <label className="block text-xs text-[#B9AA91]">
              私密空间密码
              <input className="mt-2 w-full rounded-xl border border-[#6E5A39] bg-[#15120E] px-4 py-3 text-[#F6EEDC] outline-none focus:border-[#C39D59]" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={phase === 'setup' ? 'new-password' : 'current-password'} required />
            </label>
            {phase === 'setup' && (
              <label className="block text-xs text-[#B9AA91]">
                再次输入密码
                <input className="mt-2 w-full rounded-xl border border-[#6E5A39] bg-[#15120E] px-4 py-3 text-[#F6EEDC] outline-none focus:border-[#C39D59]" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" required />
              </label>
            )}
            <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#C29A54] px-4 py-3 font-semibold text-[#17130D] transition-colors hover:bg-[#D5B36F] disabled:opacity-55" type="submit" disabled={busy}>
              {busy ? <LoaderCircle className="animate-spin" size={18} /> : <ShieldCheck size={18} />}
              {busy ? '正在处理' : phase === 'setup' ? '创建并进入所忆' : '解锁并进入所忆'}
            </button>
          </form>
        )}
        <a className="mt-7 block text-center text-[11px] text-[#7E725F] hover:text-[#B89A68]" href="?dev-vault=1">开发人员：打开密文验证工具</a>
      </section>
    </main>
  );
}
