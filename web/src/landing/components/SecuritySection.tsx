import type { FC } from 'react';
import { Check, Cloud, FileLock2, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import travelPhoto from '../../assets/login/travel-photo.png';

export const SecuritySection: FC = () => (
  <section className="landing-section security-section" id="security">
    <div className="section-intro">
      <span className="section-kicker"><ShieldCheck size={14} /> 安心，才放得下回忆</span>
      <h2>照片去了云端，<br />秘密留在你手里。</h2>
      <p>从拍下照片，到下一次重温。离开设备之前，记忆已经在本地完成加密。</p>
    </div>
    <div className="encryption-pipeline" aria-label="照片先在设备上生成三个尺寸并加密，再上传云端私有存储；查看时在自己的设备上解密">
      <article className="pipeline-device pipeline-box">
        <div className="pipeline-box-heading"><h3>你的设备</h3><span>明文照片与主密钥</span></div>
        <div className="pipeline-device-content"><img src={travelPhoto} alt="加密前的演示照片" width="90" height="100" loading="lazy" /><div className="pipeline-key"><KeyRound size={35} strokeWidth={1.5} /><span>VMK 在本机解锁使用</span></div></div>
        <div className="pipeline-step-pills"><span>01 拍照或选图</span><span>02 生成三尺寸</span></div>
      </article>
      <div className="pipeline-bridge">
        <strong><LockKeyhole size={15} /> AES-GCM 256</strong>
        <svg viewBox="0 0 260 72" fill="none" aria-hidden="true">
          <path className="encryption-tunnel" d="M2 17H210V3L253 36L210 69V55H2" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2 5" />
          <path d="M12 36H224" stroke="currentColor" strokeOpacity=".14" />
          <g className="cipher-particles" fill="currentColor"><circle cx="25" cy="36" r="3" /><circle cx="70" cy="27" r="2" /><circle cx="116" cy="44" r="3" /><circle cx="160" cy="30" r="2" /><circle cx="202" cy="38" r="3" /></g>
        </svg>
        <span>03 离开设备前完成加密</span>
      </div>
      <article className="pipeline-vault pipeline-box">
        <div className="pipeline-box-heading"><h3><Cloud size={17} /> 腾讯云 COS</h3><LockKeyhole size={16} /></div>
        <p className="pipeline-vault-label">私有存储 · 仅保存加密文件</p>
        <div className="vault-cipher-content"><div className="cipher-lines" aria-hidden="true"><code>0x8F3A 7C92 D1E0</code><code>A6B1 00F4 9D2C</code><code>•••• •••• ••••</code></div><div className="cipher-blocks" aria-hidden="true">{[0, 1, 2].map((block) => <span key={block}><FileLock2 size={19} /></span>)}</div></div>
        <div className="pipeline-step-pills"><span>04 上传私有 COS</span><span>05 设备本地解密</span></div>
      </article>
    </div>
    <div className="security-qa-grid">
      <article><span className="security-qa-icon"><LockKeyhole size={17} /></span><div><h3>云端能看到我的照片吗？</h3><p>云端保存的是三档独立加密文件。服务器负责授权和同步，不持有能直接解开照片的明文密钥。</p></div></article>
      <article><span className="security-qa-icon"><KeyRound size={17} /></span><div><h3>换一台设备，还能打开吗？</h3><p>已同步的记忆，可在其他设备登录账号后，用同一私密空间密码本地解锁。密码不会发送给服务器。</p></div></article>
    </div>
    <p className="security-bottom-note"><Check size={13} /> 缩略图、预览图与原图分别加密，每次使用新的随机 IV。</p>
  </section>
);

export default SecuritySection;
