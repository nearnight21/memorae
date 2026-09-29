import type { FC } from 'react';
import { ArrowRight, Download, LockKeyhole } from 'lucide-react';

export interface HeroSectionProps {
  onEnterApp: () => void;
}

export const HeroSection: FC<HeroSectionProps> = ({ onEnterApp }) => {
  return (
    <section className="hero-canvas-section" id="top">
      <img className="hero-app-icon" src="/logo.png" alt="所忆应用图标" />
      <h1 className="hero-main-title">
        所忆
      </h1>
      <p className="hero-sub-text">
        把走过的地方，变成只属于你的记忆地图。
      </p>
      <div className="hero-actions-row">
        <button type="button" onClick={onEnterApp} className="btn-hero-primary">
          <span>打开 Web 空间</span>
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
      <div className="hero-security-note"><LockKeyhole size={13} /> 本地加密 · 密文同步</div>
    </section>
  );
};

export default HeroSection;
