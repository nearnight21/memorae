import type { FC } from 'react';
import LandingNavbar from './components/LandingNavbar';
import HeroSection from './components/HeroSection';
import PhoneDemoSection from './components/PhoneDemoSection';
import StickyStorySection from './components/StickyStorySection';
import TimelinePlayground from './components/TimelinePlayground';
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

      {/* 第 1 屏：地图即主体与大气主标语 */}
      <HeroSection onEnterApp={onEnterApp} />

      {/* 第 2 屏：移动端初亮相（居中真实真机录屏展示） */}
      <PhoneDemoSection />

      {/* 第 3 屏：Sticky 联动（左侧滚动推进，右侧真机平滑切图） */}
      <StickyStorySection />

      {/* 第 4 屏：原生交互时光轴漫游 */}
      <TimelinePlayground />

      {/* 第 5 屏：尾声与极简下载收口 */}
      <DownloadFooter onEnterApp={onEnterApp} />
    </div>
  );
};

export default LandingPage;
