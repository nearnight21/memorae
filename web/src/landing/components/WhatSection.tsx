import type { FC } from 'react';
import { Check, LockKeyhole } from 'lucide-react';
import DesktopDemoViewport from './DesktopDemoViewport';
import MobileActionDemo from './MobileActionDemo';

export const WhatSection: FC = () => (
  <section className="landing-section what-section" id="what" aria-label="所忆的地图与记录体验">
    <div className="product-preview-stage">
      <div className="browser-preview">
        <div className="browser-preview-bar">
          <div className="browser-dots" aria-hidden="true"><span className="browser-dot is-red" /><span className="browser-dot is-yellow" /><span className="browser-dot is-green" /></div>
          <span className="browser-preview-title">所忆 · 记忆地图</span>
          <span className="browser-preview-status"><Check size={12} /> 只读体验</span>
        </div>
        <div className="browser-preview-content"><DesktopDemoViewport /></div>
      </div>
    </div>
    <p className="preview-caption"><LockKeyhole size={12} /> 演示记忆，随意探索。你的故事，只向你展开。</p>
    <div className="section-intro what-intro">
      <span className="section-kicker">一张地图，两种陪伴</span>
      <h2>在路上记录，<br />在地图上重逢。</h2>
      <p>手机端留住照片、地点和当时的想法；回到大屏，沿着时间轴，重新打开走过的路。</p>
    </div>
    <MobileActionDemo />
    <p className="section-caption">网页端负责展开，手机端负责记录。</p>
  </section>
);

export default WhatSection;
