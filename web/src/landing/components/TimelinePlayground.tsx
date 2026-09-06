import { useState, type FC } from 'react';
import { Calendar, MapPin, Sparkles } from 'lucide-react';
import travelPhoto from '../../assets/login/travel-photo.png';

const MILESTONE_YEARS = [
  {
    year: '2007',
    city: '北京 · 什刹海',
    title: '胡同口的老槐树与单车',
    story: '那年秋天风吹过什刹海的水面，银锭桥边的冰糖葫芦冒着热气。',
  },
  {
    year: '2012',
    city: '拉萨 · 八廓街',
    title: '大昭寺金顶的日暮日光',
    story: '空气稀薄而通透，酥油茶的香气在转经道上久久不散。',
  },
  {
    year: '2018',
    city: '京都 · 鸭川河畔',
    title: '初夏傍晚的微风与蝉鸣',
    story: '坐在河畔石阶上看着远处群山隐没在蓝紫色的暮色中。',
  },
  {
    year: '2022',
    city: '喀纳斯 · 月亮湾',
    title: '深秋松针上的初雪',
    story: '松石绿色的水蜿蜒在晨雾里，木栈道上落满了金黄的落叶。',
  },
  {
    year: '2026',
    city: '上海 · 武康庭',
    title: '阳光穿过法桐叶的微光',
    story: '重新整理过去所有的旅程与笔记，将每一处时光装进所忆。',
  },
];

export const TimelinePlayground: FC = () => {
  const [selectedIdx, setSelectedIdx] = useState(2);

  const active = MILESTONE_YEARS[selectedIdx] || MILESTONE_YEARS[0];
  const progressPercent = (selectedIdx / (MILESTONE_YEARS.length - 1)) * 100;

  return (
    <section className="timeline-interactive-section" id="timeline">
      <span className="section-eyebrow">原生漫游 · Interactive Timeline</span>
      <h2 className="section-headline">滑动岁月，唤醒封存的时光。</h2>
      <p className="section-description">
        轻触年份刻度，散落在不同坐标与岁月的记忆卡片即刻轻盈跃出。
      </p>

      <div className="timeline-stage-box">
        {/* 顶部滑动轨道 */}
        <div className="timeline-slider-rail">
          <div
            className="timeline-slider-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* 年份选择按钮排 */}
        <div className="timeline-year-buttons-row">
          {MILESTONE_YEARS.map((item, idx) => (
            <button
              key={item.year}
              type="button"
              onClick={() => setSelectedIdx(idx)}
              className={`year-node-btn ${selectedIdx === idx ? 'is-active-year' : ''}`}
            >
              <span>{item.year}</span>
            </button>
          ))}
        </div>

        {/* 当前年份展示卡片 */}
        <div className="timeline-active-display">
          {/* 左侧拍立得卡片 */}
          <div
            className="hero-floating-card"
            style={{
              position: 'relative',
              top: 0,
              left: 0,
              transform: 'none',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            }}
          >
            <div className="card-polaroid-frame" style={{ width: '240px', height: '160px' }}>
              <img src={travelPhoto} alt={active.title} />
            </div>
            <div className="card-polaroid-meta" style={{ marginTop: '10px' }}>
              <h6 style={{ fontSize: '14px' }}>{active.title}</h6>
              <p style={{ fontSize: '11px', marginTop: '4px' }}>
                <MapPin size={11} style={{ display: 'inline', marginRight: 3 }} />
                {active.city}
              </p>
            </div>
          </div>

          {/* 右侧诗意解读 */}
          <div style={{ textAlign: 'left', maxWidth: '380px' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                color: '#38BDF8',
                fontSize: '12px',
                fontFamily: 'monospace',
                marginBottom: '10px',
              }}
            >
              <Calendar size={13} />
              <span>{active.year} 年回溯</span>
            </div>
            <h4 style={{ fontSize: '22px', fontWeight: 700, color: '#FFFFFF', margin: '0 0 12px 0' }}>
              {active.title}
            </h4>
            <p style={{ fontSize: '14px', lineHeight: 1.7, color: '#9CA3AF', margin: 0 }}>
              {active.story}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default TimelinePlayground;
