import type { FC } from 'react';
import { ArrowRight, Download, Sparkles } from 'lucide-react';
import LandingMapDemo from './LandingMapDemo';

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

      {/* 大地图主体展台：真实产品地图的只读切片，可直接点击记忆气泡查看详情 */}
      <LandingMapDemo height={640} showTimeline={false} className="hero-map-demo" />
    </section>
  );
};

export default HeroSection;
