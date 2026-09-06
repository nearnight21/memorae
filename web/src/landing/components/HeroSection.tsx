import type { FC } from 'react';
import { ArrowRight, Download, Sparkles, MapPin } from 'lucide-react';
import travelPhoto from '../../assets/login/travel-photo.png';

export interface HeroSectionProps {
  onEnterApp: () => void;
}

export const HeroSection: FC<HeroSectionProps> = ({ onEnterApp }) => {
  return (
    <section className="hero-canvas-section" id="top">
      {/* 极简标签 */}
      <div className="hero-tag-pill">
        <Sparkles size={13} style={{ color: '#38BDF8' }} />
        <span>端到端加密的时空足迹地图 · Android & Web 原生随行</span>
      </div>

      {/* 强对比大标题（Arc 风格） */}
      <h1 className="hero-main-title">
        你去过的地方，
        <br />
        不应该只剩一个地名。
      </h1>

      {/* 副标题 */}
      <p className="hero-sub-text">
        Memorae 将散落在各处的照片与文字，串连成生命轨迹中的时空长卷。
        出境即密文，唯有您的钥匙能够唤醒回忆。
      </p>

      {/* 核心行动按钮 */}
      <div className="hero-actions-row">
        <button type="button" onClick={onEnterApp} className="btn-hero-primary">
          <span>开始体验</span>
          <ArrowRight size={15} />
        </button>
        <a href="#download" className="btn-hero-secondary">
          <Download size={15} />
          <span>下载 Android 原生版</span>
        </a>
      </div>

      {/* 大地图主体展台 */}
      <div className="hero-map-stage">
        {/* 背景栅格微光 */}
        <div className="hero-map-grid-mesh" />

        {/* 动态足迹连线 */}
        <svg
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          viewBox="0 0 1000 500"
          preserveAspectRatio="none"
        >
          <path
            d="M 180 340 C 350 200, 550 360, 820 180"
            fill="none"
            stroke="rgba(56, 189, 248, 0.35)"
            strokeWidth="2"
            strokeDasharray="6 6"
          />
        </svg>

        {/* 坐标气泡 1 */}
        <div
          className="hero-floating-card"
          style={{ top: '60px', left: '12%', transform: 'rotate(-3deg)' }}
        >
          <div className="card-polaroid-frame">
            <img src={travelPhoto} alt="京都暮色" />
          </div>
          <div className="card-polaroid-meta">
            <h6>清水舞台的晚蝉与暮色</h6>
            <p>
              <MapPin size={10} style={{ display: 'inline', marginRight: 2 }} />
              2018.07 · 京都
            </p>
          </div>
        </div>

        {/* 坐标气泡 2 */}
        <div
          className="hero-floating-card"
          style={{ bottom: '40px', right: '14%', transform: 'rotate(2.5deg)' }}
        >
          <div className="card-polaroid-frame">
            <img src={travelPhoto} alt="阿勒泰初雪" />
          </div>
          <div className="card-polaroid-meta">
            <h6>月亮湾的第一场初雪</h6>
            <p>
              <MapPin size={10} style={{ display: 'inline', marginRight: 2 }} />
              2022.10 · 阿勒泰
            </p>
          </div>
        </div>

        {/* 中心坐标点 */}
        <div
          style={{
            position: 'absolute',
            top: '48%',
            left: '52%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <div
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              background: '#38BDF8',
              boxShadow: '0 0 20px #38BDF8',
              border: '3px solid #FFFFFF',
            }}
          />
          <span
            style={{
              fontSize: '11px',
              fontFamily: 'monospace',
              color: '#38BDF8',
              background: 'rgba(0, 0, 0, 0.7)',
              padding: '2px 8px',
              borderRadius: '4px',
              border: '1px solid rgba(56, 189, 248, 0.3)',
            }}
          >
            31.2053° N, 121.4398° E
          </span>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
