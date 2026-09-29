import type { FC } from 'react';
import { KeyRound, Lock, Server, ShieldCheck } from 'lucide-react';

export const SecuritySection: FC = () => (
  <section className="landing-section security-section" id="security">
    <div className="section-intro section-intro-narrow">
      <span className="section-kicker"><ShieldCheck size={14} /> 如何保护</span>
      <h2>你的记忆先在本地变成密文。</h2>
      <p>云端负责同步，只有你的设备和私密空间密码能够把它重新打开。</p>
    </div>

    <div className="security-flow" aria-label="所忆的数据保护流程">
      <div className="security-flow-step">
        <div className="security-flow-icon"><KeyRound size={20} /></div>
        <span className="security-flow-index">01</span>
        <h3>本地解锁</h3>
        <p>私密空间密码只在设备本地用于解锁密钥。</p>
      </div>
      <div className="security-flow-line" aria-hidden="true" />
      <div className="security-flow-step">
        <div className="security-flow-icon"><Lock size={20} /></div>
        <span className="security-flow-index">02</span>
        <h3>离开即加密</h3>
        <p>照片、文字、地点离开设备前已经变成密文。</p>
      </div>
      <div className="security-flow-line" aria-hidden="true" />
      <div className="security-flow-step">
        <div className="security-flow-icon"><Server size={20} /></div>
        <span className="security-flow-index">03</span>
        <h3>云端只同步密文</h3>
        <p>服务器保存同步所需的密文，不直接读取记忆内容。</p>
      </div>
    </div>

    <div className="security-note">
      <strong>账号密码和私密空间密码是两套密码。</strong>
      <span>锁定后，本地内存中的解密密钥会被清除；网络中断时，设备上已有的记忆仍可继续使用。</span>
    </div>
  </section>
);

export default SecuritySection;
