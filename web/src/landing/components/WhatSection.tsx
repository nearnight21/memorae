import type { FC } from 'react';
import { ArrowRight, Check, MapPin } from 'lucide-react';
import DesktopDemoViewport from './DesktopDemoViewport';
import MobileActionDemo from './MobileActionDemo';

export const WhatSection: FC = () => {
  return (
    <section className="landing-section what-section" id="what">
      <div className="section-intro section-intro-narrow">
        <span className="section-kicker">这是什么</span>
        <h2>网页端用来回看，手机端用来记录。</h2>
        <p>同一套记忆，在不同设备上各有用处。下面直接展示两边分别能做什么。</p>
      </div>

      <div className="experience-copy">
        <div><span className="experience-copy-kicker">回到大屏</span><h3>网页端：看地图、时间轴和完整详情。</h3></div>
        <p>适合坐下来整理和回看。点开地图上的记忆，可以看到照片、地点、日期和文字。</p>
      </div>

      <div className="product-preview-stage">
        <div className="browser-preview">
          <div className="browser-preview-bar"><span className="browser-dot is-red" /><span className="browser-dot is-yellow" /><span className="browser-dot is-green" /><span className="browser-preview-title">所忆 · Web 空间</span><span className="browser-preview-status"><Check size={12} /> 本地解锁</span></div>
          <div className="browser-preview-content">
            <DesktopDemoViewport />
            <div className="browser-preview-hint"><MapPin size={14} /><span>点击地图上的记忆点，打开详情</span><ArrowRight size={14} /></div>
          </div>
        </div>
      </div>

      <div className="experience-copy experience-copy-mobile">
        <div><span className="experience-copy-kicker">出门时</span><h3>手机端：拍照、记地点、写下当时的想法。</h3></div>
        <p>适合在路上快速记录。这里展示真实手机比例和重点操作视频的位置。</p>
      </div>

      <div className="phone-demo-stage"><div className="phone-preview"><MobileActionDemo /></div></div>

      <p className="section-caption">网页端负责展开，手机端负责记录。</p>
    </section>
  );
};

export default WhatSection;
