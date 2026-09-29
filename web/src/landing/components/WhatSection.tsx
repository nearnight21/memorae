import type { FC } from 'react';
import { CalendarDays, Map, Sparkles } from 'lucide-react';
import LandingMapDemo from './LandingMapDemo';

const TOPIC_EXAMPLES = [
  { icon: Map, title: '一次旅行', body: '把一路上的照片、文字和地点收在同一个主题里。' },
  { icon: CalendarDays, title: '一个阶段', body: '按时间展开，重新看见某段生活是怎样发生的。' },
  { icon: Sparkles, title: '一件重要的事', body: '让特殊记忆拥有自己的位置，而不是沉在相册深处。' },
];

export const WhatSection: FC = () => (
  <section className="landing-section what-section" id="what">
    <div className="section-intro section-intro-narrow">
      <span className="section-kicker">这是什么</span>
      <h2>一张只属于你的记忆地图。</h2>
      <p>
        所忆把照片、文字、时间和地点放在一起。每一次旅行、每一个阶段，或一件值得保存的事，
        都可以成为一个主题，再从地图上重新走一遍。
      </p>
    </div>
    <div className="topic-grid">
      {TOPIC_EXAMPLES.map(({ icon: Icon, title, body }) => (
        <article className="topic-card" key={title}>
          <div className="topic-icon"><Icon size={20} strokeWidth={1.8} /></div>
          <h3>{title}</h3>
          <p>{body}</p>
        </article>
      ))}
    </div>
    <p className="section-caption">写下记忆，按时间和地点展开，再回到地图上重新看见它。</p>
    <div className="what-map-demo">
      <LandingMapDemo height={560} showTimeline />
    </div>
  </section>
);

export default WhatSection;
