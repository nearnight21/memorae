import type { FC } from 'react';
import LandingMapDemo from './LandingMapDemo';

/**
 * 真实产品「地图 + 水晶时间轴」的只读落地页切片。
 *
 * 不再使用年份按钮、拍立得卡片或功能解说卡片去描述产品，
 * 而是让访问者直接拖动真实时间轴，亲眼看到地图上的演示记忆随时间收纳与浮现。
 * 功能解读统一后移到产品理念与隐私章节，避免同一段里出现两套时间交互。
 */
export const TimelinePlayground: FC = () => {
  return (
    <section className="timeline-interactive-section" id="timeline">
      <span className="section-eyebrow">水晶时间轴 · Ocean Crystal Timeline</span>
      <h2 className="section-headline">滑动岁月，唤醒封存的时光。</h2>
      <p className="section-description">
        这是 Memorae 核心的水晶时间轴。按住晶莹剔透的旋钮左右滑动，
        地图上散落于各年各处的记忆会随之收纳与浮现——无需任何说明，拖一下就懂。
      </p>

      <div className="timeline-stage-box">
        <LandingMapDemo height={660} showTimeline />
      </div>
    </section>
  );
};

export default TimelinePlayground;
