import type { FC } from 'react';
import { ArrowRight, Download, LockKeyhole } from 'lucide-react';

export interface HeroSectionProps {
  onEnterApp: () => void;
}

export const HeroSection: FC<HeroSectionProps> = ({ onEnterApp }) => {
  return (
    <section className="hero-canvas-section" id="top">
      <span className="hero-coordinate hero-coordinate-north" aria-hidden="true">36°N / 120°E</span>
      <span className="hero-coordinate hero-coordinate-south" aria-hidden="true">25°N / 100°E</span>
      <div className="hero-security-note"><LockKeyhole size={13} /> 本地加密 · 密文同步</div>
      <div className="hero-title-group">
        <h1 className="hero-main-title">所忆</h1>
        <span className="hero-wordmark" aria-hidden="true">Memorae</span>
      </div>
      <p className="hero-sub-text">
        把走过的地方，变成只属于你的记忆地图。
      </p>
      <div className="hero-actions-row">
        <button type="button" onClick={onEnterApp} className="btn-hero-primary">
          <span>开始记录</span>
          <ArrowRight size={15} />
        </button>
        <a
          href="https://github.com/nearnight21/memorae/releases"
          target="_blank"
          rel="noreferrer"
          className="btn-hero-secondary"
        >
          <Download size={15} />
          <span>下载 Android</span>
        </a>
      </div>
      <a className="hero-discover-link" href="#what">沿着地图，找回那些日子 <span aria-hidden="true">↓</span></a>
    </section>
  );
};

export default HeroSection;
