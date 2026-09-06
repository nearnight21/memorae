import type { FC } from 'react';
import PhoneViewport from './PhoneViewport';

export const PhoneDemoSection: FC = () => {
  return (
    <section className="phone-demo-section" id="mobile-showcase">
      <span className="section-eyebrow">随行沉浸 · Mobile in Motion</span>
      <h2 className="section-headline">一张地图，就是你的人生轨迹。</h2>
      <p className="section-description">
        漫步城市街巷，或是伫立于雪山湖畔。轻轻一点，高德精细坐标反查与拍立得质感记忆瞬间定格。
      </p>

      {/* 居中大手机模型 */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <PhoneViewport
          placeholderTitle="真机 10s 操作录屏 (MP4/WebM)"
          placeholderSubtitle="放入 demo-loop.mp4 即自动播放地图浏览与点位展开"
        />
      </div>
    </section>
  );
};

export default PhoneDemoSection;
