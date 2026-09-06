import type { FC } from 'react';
import { ShieldCheck, KeyRound, Lock, FileArchive } from 'lucide-react';

export const SecuritySection: FC = () => {
  return (
    <section className="landing-section" id="security">
      <div style={{ textAlign: 'center', maxWidth: '720px', margin: '0 auto' }}>
        <div className="section-badge" style={{ justifyContent: 'center' }}>
          <ShieldCheck size={14} />
          <span>隐私主权 · Privacy by Design</span>
        </div>
        <h2 className="section-heading">
          最温柔的回忆，
          <br />
          理应披上最坚固的铠甲。
        </h2>
        <p className="section-subtext" style={{ margin: '0 auto' }}>
          我们坚信，属于你的人生轨迹绝不应成为任何大模型的训练语料或商业分析的商品。
          所忆采用严格的零知识（Zero-Knowledge）端到端加密架构。
        </p>
      </div>

      <div className="security-cards-grid">
        <div className="security-card">
          <div className="security-card-icon">
            <KeyRound size={22} />
          </div>
          <h4>本地锁定的加密保险箱</h4>
          <p>
            主加密密钥（VMK）仅由您独立设置的私密空间密码在设备本地解开。钥匙从不离开内存，服务器仅保存您盲加密的密钥信封，无从窥探。
          </p>
        </div>

        <div className="security-card">
          <div className="security-card-icon">
            <Lock size={22} />
          </div>
          <h4>出境即密文 · 零知识存储</h4>
          <p>
            文字记忆、经纬坐标及三档照片在离开浏览器或手机的瞬间，均已完成 AES-GCM 强加密。云端对象存储仅作为中转密文字节仓库。
          </p>
        </div>

        <div className="security-card">
          <div className="security-card-icon">
            <FileArchive size={22} />
          </div>
          <h4>数据主权归属于你</h4>
          <p>
            支持随时导出包含全量照片与时空元数据的专属加密档案。即使未来切换设备或断开网络，离线解密工具也能让记忆历久弥新。
          </p>
        </div>
      </div>
    </section>
  );
};

export default SecuritySection;
