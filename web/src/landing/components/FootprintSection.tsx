import type { FC } from 'react';
import { MapPin, CalendarDays, HardDrive, Compass } from 'lucide-react';
import MobileDeviceMockup from './MobileDeviceMockup';

export const FootprintSection: FC = () => {
  return (
    <section className="landing-section" id="footprint">
      <div className="showcase-split-grid">
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <MobileDeviceMockup />
        </div>

        <div className="showcase-text-col">
          <div className="section-badge">
            <Compass size={14} />
            <span>时空叙事 · Footprint & Timeline</span>
          </div>
          <h2 className="section-heading">
            每一次启程，
            <br />
            都立于真实的大地之上。
          </h2>
          <p className="section-subtext">
            不仅仅是一本日记，而是将照片、经纬度与岁月沉淀交织而成的个人地理长卷。
            手机出门随行即刻记录，回家在大屏前伴着夜色温故知新。
          </p>

          <div className="feature-point-list">
            <div className="feature-point-item">
              <div className="point-icon-box">
                <MapPin size={18} />
              </div>
              <div className="point-content">
                <h5>高德精细坐标与行政区反查</h5>
                <p>自动解析省市区与地理特征，精准锚定每一处落脚点，拒绝模糊的拍摄泛泛标签。</p>
              </div>
            </div>

            <div className="feature-point-item">
              <div className="point-icon-box">
                <CalendarDays size={18} />
              </div>
              <div className="point-content">
                <h5>平滑横向时间轴</h5>
                <p>滑动年份标尺，散落于不同年代的记忆如晨星般点亮，回溯人生旅途的每段轨迹。</p>
              </div>
            </div>

            <div className="feature-point-item">
              <div className="point-icon-box">
                <HardDrive size={18} />
              </div>
              <div className="point-content">
                <h5>离线优先 · 荒野亦能记录</h5>
                <p>基于本地 SQLite 与 IndexedDB 架构，无论身在航班还是荒野峡谷，记录永不中断。</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FootprintSection;
