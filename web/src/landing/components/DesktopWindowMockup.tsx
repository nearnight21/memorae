import { useState, useEffect, type FC, type ReactNode } from 'react';
import { MapPin, Clock, Compass, Sparkles, Navigation } from 'lucide-react';
import travelPhoto from '../../assets/login/travel-photo.png';

export interface DesktopWindowMockupProps {
  title?: string;
  mediaSrc?: string;
  className?: string;
  children?: ReactNode;
}

const MEMORY_HIGHLIGHTS = [
  {
    id: '1',
    year: '2018',
    date: '2018.07.21',
    city: '京都 · 清水舞台',
    title: '傍晚夏蝉与暮色余晖',
    snippet: '顺着二年坂走下来，晚霞落在石阶上，游人渐稀。',
    lat: '34.9948',
    lng: '135.7850',
    tag: '旅行足迹',
  },
  {
    id: '2',
    year: '2022',
    date: '2022.10.04',
    city: '阿勒泰 · 喀纳斯',
    title: '月亮湾的第一场初雪',
    snippet: '松针上挂满了细密的霜雪，湖水呈现出浓郁的松石绿。',
    lat: '48.7180',
    lng: '87.0392',
    tag: '自然探索',
  },
  {
    id: '3',
    year: '2026',
    date: '2026.05.18',
    city: '上海 · 武康大楼',
    title: '初夏的梧桐绿荫与微风',
    snippet: '骑车穿过复兴西路，阳光在沥青路面上洒下斑驳光斑。',
    lat: '31.2053',
    lng: '121.4398',
    tag: '城市漫游',
  },
];

export const DesktopWindowMockup: FC<DesktopWindowMockupProps> = ({
  title = '所忆 · 时空足迹画卷 (Memorae Studio)',
  mediaSrc,
  className = '',
  children,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (mediaSrc) return;
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % MEMORY_HIGHLIGHTS.length);
    }, 4200);
    return () => clearInterval(timer);
  }, [mediaSrc]);

  const activeMemory = MEMORY_HIGHLIGHTS[activeIndex];

  return (
    <div className={`desktop-window ${className}`}>
      {/* 顶部拟物 Mac 状态栏与控制按钮 */}
      <div className="desktop-window-header">
        <div className="desktop-window-controls">
          <span className="window-dot dot-close" />
          <span className="window-dot dot-minimize" />
          <span className="window-dot dot-expand" />
        </div>
        <div className="desktop-window-title">
          <Compass className="window-title-icon" size={13} />
          <span>{title}</span>
        </div>
        <div className="desktop-window-actions">
          <span className="window-badge">已加密同步</span>
        </div>
      </div>

      {/* 窗体内容展示区 */}
      <div className="desktop-window-body">
        {mediaSrc ? (
          mediaSrc.endsWith('.mp4') ? (
            <video src={mediaSrc} autoPlay loop muted playsInline className="window-media" />
          ) : (
            <img src={mediaSrc} alt="产品实际展示动图" className="window-media" />
          )
        ) : children ? (
          children
        ) : (
          <div className="desktop-simulated-app">
            {/* 左侧时光线与记忆索引 */}
            <aside className="simulated-sidebar">
              <div className="simulated-sidebar-header">
                <span className="sidebar-brand">Memorae 空间</span>
                <span className="memory-count">36 处足迹</span>
              </div>

              <div className="simulated-year-pills">
                {MEMORY_HIGHLIGHTS.map((m, idx) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setActiveIndex(idx)}
                    className={`year-pill ${idx === activeIndex ? 'is-active' : ''}`}
                  >
                    <span className="pill-dot" />
                    <span className="pill-year">{m.year}</span>
                    <span className="pill-city">{m.city.split(' · ')[0]}</span>
                  </button>
                ))}
              </div>

              <div className="simulated-recent-card">
                <div className="card-top-tag">
                  <Sparkles size={11} />
                  <span>时光漫步回放</span>
                </div>
                <h4>{activeMemory.title}</h4>
                <p className="card-snippet">{activeMemory.snippet}</p>
                <div className="card-meta">
                  <span className="meta-time">
                    <Clock size={11} />
                    {activeMemory.date}
                  </span>
                  <span className="meta-pin">
                    <MapPin size={11} />
                    {activeMemory.city}
                  </span>
                </div>
              </div>
            </aside>

            {/* 右侧交互地图视窗 */}
            <main className="simulated-map-viewport">
              <div className="simulated-map-canvas">
                <div className="map-grid-lines" />
                <div className="map-contour-overlay" />

                {/* 时光漫游足迹连线 */}
                <svg className="map-connecting-path" viewBox="0 0 600 400" preserveAspectRatio="none">
                  <path
                    d="M 120 280 C 220 220, 320 310, 480 150"
                    fill="none"
                    stroke="rgba(217, 119, 6, 0.45)"
                    strokeWidth="2.5"
                    strokeDasharray="6 6"
                  />
                </svg>

                {/* 地图上的记忆脉冲点 */}
                <div className="map-marker marker-1">
                  <span className="marker-core" />
                  <span className="marker-label">京都</span>
                </div>
                <div className="map-marker marker-2">
                  <span className="marker-core" />
                  <span className="marker-label">阿勒泰</span>
                </div>
                <div className="map-marker marker-3">
                  <span className="marker-pulse" />
                  <span className="marker-core highlight" />
                  <span className="marker-label highlight">{activeMemory.city.split(' · ')[0]}</span>
                </div>

                {/* 悬浮拍立得时光照片卡 */}
                <div className="floating-polaroid-card">
                  <div className="polaroid-photo-frame">
                    <img src={travelPhoto} alt="记忆快照" />
                    <span className="photo-time-badge">{activeMemory.date}</span>
                  </div>
                  <div className="polaroid-caption">
                    <div className="polaroid-title-row">
                      <strong>{activeMemory.title}</strong>
                      <span className="polaroid-tag">{activeMemory.tag}</span>
                    </div>
                    <p>{activeMemory.city}</p>
                  </div>
                </div>

                {/* 地图右下角坐标读数 */}
                <div className="map-hud-readout">
                  <span>
                    <Navigation size={10} /> GCJ-02: {activeMemory.lat}, {activeMemory.lng}
                  </span>
                  <span>Zoom 14.5</span>
                </div>
              </div>

              {/* 底部时间轴滑动带 */}
              <div className="simulated-timeline-bar">
                <div className="timeline-track">
                  <div
                    className="timeline-progress"
                    style={{ width: `${((activeIndex + 1) / MEMORY_HIGHLIGHTS.length) * 100}%` }}
                  />
                  <div
                    className="timeline-scrubber"
                    style={{ left: `${((activeIndex + 0.5) / MEMORY_HIGHLIGHTS.length) * 100}%` }}
                  >
                    <span className="scrubber-handle" />
                    <span className="scrubber-year">{activeMemory.year}</span>
                  </div>
                </div>
              </div>
            </main>
          </div>
        )}
      </div>
    </div>
  );
};

export default DesktopWindowMockup;
