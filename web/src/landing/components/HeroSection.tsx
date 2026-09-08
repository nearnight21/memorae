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
        <Sparkles size={13} style={{ color: 'var(--theme-crystal-bright)' }} />
        <span>端到端加密的时空足迹地图 · Web 沉浸大屏 & Android 原生随行</span>
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
        Web 网站端大画幅沉浸漫游，手机随行即刻记录。出境即密文，唯有您的钥匙能够唤醒回忆。
      </p>

      {/* 核心行动按钮 */}
      <div className="hero-actions-row">
        <button type="button" onClick={onEnterApp} className="btn-hero-primary">
          <span>进入 Web 空间 (免安装)</span>
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
            stroke="rgba(108, 153, 173, 0.45)"
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
              <MapPin size={10} style={{ display: 'inline', marginRight: 2, color: 'var(--theme-journal-earth)' }} />
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
              <MapPin size={10} style={{ display: 'inline', marginRight: 2, color: 'var(--theme-journal-earth)' }} />
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
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              background: 'var(--theme-crystal-deep)',
              boxShadow: '0 0 16px var(--theme-crystal)',
              border: '2.5px solid var(--theme-land-paper)',
            }}
          />
          <span
            style={{
              fontSize: '11px',
              fontFamily: 'monospace',
              fontWeight: 600,
              color: 'var(--theme-crystal-deep)',
              background: 'rgba(255, 253, 249, 0.95)',
              padding: '2px 8px',
              borderRadius: '4px',
              border: '1px solid var(--theme-crystal-border)',
              boxShadow: '0 2px 8px rgba(70, 50, 30, 0.08)',
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
