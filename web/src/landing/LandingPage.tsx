import type { FC } from 'react';
import LandingNavbar from './components/LandingNavbar';
import HeroSection from './components/HeroSection';
import StickyStorySection from './components/StickyStorySection';
import TimelinePlayground from './components/TimelinePlayground';
import LocalModeTrustSection from './components/LocalModeTrustSection';
import DownloadFooter from './components/DownloadFooter';
import { navigateToApp } from './landingRouting';
import './landing.css';

export interface LandingPageProps {
  onEnterApp?: () => void;
}

export const LandingPage: FC<LandingPageProps> = ({ onEnterApp = navigateToApp }) => {
  return (
    <div className="landing-shell">
      {/* 顶部微光弥散氛围层 */}
      <div className="landing-ambient-glow" />

      {/* 悬浮毛玻璃导航条 */}
      <LandingNavbar onEnterApp={onEnterApp} />

      {/* 第 1 屏：地图即主体与大气主标语（大画幅时空画卷） */}
      <HeroSection onEnterApp={onEnterApp} />

      {/* 第 2 屏：Sticky 核心特性联动（左侧滚动推进，右侧平滑切图） */}
      <StickyStorySection />

      {/* 第 3 屏：原生水晶时光轴交互展台（拖拽岁月与功能联动） */}
      <TimelinePlayground />

      {/* 第 3.5 屏：信任与退路：本地模式手账信笺展台 */}
      <LocalModeTrustSection />

      {/* 第 4 屏：尾声与极简下载收口 */}
      <DownloadFooter onEnterApp={onEnterApp} />
    </div>
  );
};

export default LandingPage;
