import type { FC } from 'react';
import { ShieldCheck, HardDrive, Compass, AlertCircle, Sparkles } from 'lucide-react';

export const LocalModeTrustSection: FC = () => {
  return (
    <section className="landing-section local-mode-section" id="local-mode">
      <div className="local-trust-card">
        {/* 顶部微光与标头 */}
        <div className="local-trust-header">
          <div className="local-trust-badge">
            <Sparkles size={13} style={{ color: 'var(--theme-crystal-deep)' }} />
            <span>PHYSICAL VAULT · 本地数据主权</span>
          </div>
          <h2 className="local-trust-title">
            如果你对加密上传仍有顾虑，
            <br />
            没关系。
          </h2>
          <p className="local-trust-subtitle">
            我们完全理解并尊重你对个人隐私最本能的审慎。除了端到端密文同步外，所忆为你提供了一个完全物理隔离的「本地模式」——让照片、日记与足迹 100% 只保存在你当前的这台设备上，不经过任何云端服务器，哪怕一个字节也不离开你的掌心。
          </p>
        </div>

        {/* 本地模式三大承诺卡片 */}
        <div className="local-commitments-grid">
          <div className="local-commitment-item">
            <div className="commitment-icon-box">
              <ShieldCheck size={20} />
            </div>
            <h4 className="commitment-title">零账号，免登录即开</h4>
            <p className="commitment-desc">
              无需注册或绑定手机与邮箱，轻触即刻启程，在广袤的网络世界中不留下任何身份轨迹与足迹信令。
            </p>
          </div>

          <div className="local-commitment-item">
            <div className="commitment-icon-box">
              <HardDrive size={20} />
            </div>
            <h4 className="commitment-title">纯设备沙盒封存</h4>
            <p className="commitment-desc">
              原始大图、胶片缩略图与经纬坐标完全持久化在设备本地的 SQLite 与私密存储中，真正的物理离线自持。
            </p>
          </div>

          <div className="local-commitment-item">
            <div className="commitment-icon-box">
              <Compass size={20} />
            </div>
            <h4 className="commitment-title">完整手账与地图体验</h4>
            <p className="commitment-desc">
              依然享有高德精细地理反查、拟物旅行手账装帧与年份时间标尺，单机状态下依然沉静典雅。
            </p>
          </div>
        </div>

        {/* 坦诚的技术边界告知（折角信笺风格） */}
        <div className="local-limitations-callout">
          <div className="limitations-badge-row">
            <AlertCircle size={15} style={{ color: 'var(--theme-journal-earth)' }} />
            <span className="limitations-badge-text">坦诚的技术边界与物理限制告知</span>
          </div>

          <p className="limitations-intro">
            由于完全切断了云端通道与网络传输，在拥抱极致隐私的同时，也意味着物理特性的自然边界：
          </p>

          <ul className="limitations-list">
            <li>
              <strong>无法跨端联动：</strong>
              <span>目前的本地模式无法在电脑 Web 端与手机 App 端之间跨设备同步互通。</span>
            </li>
            <li>
              <strong>仅限单机核心功能：</strong>
              <span>本地模式下只能使用单机端的核心记录与浏览能力，依赖云端协同的高阶能力暂不开放。</span>
            </li>
            <li>
              <strong>数据完全依附本机：</strong>
              <span>所有记忆仅保存在当前设备沙盒中。若卸载应用或清空系统数据，将无法通过云端找回，目前暂不支持换机自动迁移。</span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
};

export default LocalModeTrustSection;
