import { useState, useEffect, type FC, type ReactNode } from 'react';
import { MapPin, Lock, Camera, Check, Sparkles, Wifi, Battery, Signal } from 'lucide-react';
import travelPhoto from '../../assets/login/travel-photo.png';

export interface MobileDeviceMockupProps {
  mediaSrc?: string;
  className?: string;
  children?: ReactNode;
}

const MOBILE_SNIPPETS = [
  {
    city: '大理 · 洱海生态廊道',
    address: '下波涢村沿海木栈道',
    time: '刚刚 · 16:42',
    caption: '海风吹拂着水杉林，水鸟在水面上起落，今天天气格外晴朗。',
    locked: true,
  },
  {
    city: '杭州 · 满觉陇',
    address: '下满觉陇路石板小径',
    time: '昨天 · 14:15',
    caption: '满山金桂飘香，在路边茶舍坐了两个小时，空气里都是甜味。',
    locked: true,
  },
];

export const MobileDeviceMockup: FC<MobileDeviceMockupProps> = ({
  mediaSrc,
  className = '',
  children,
}) => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (mediaSrc) return;
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % MOBILE_SNIPPETS.length);
    }, 4800);
    return () => clearInterval(timer);
  }, [mediaSrc]);

  const current = MOBILE_SNIPPETS[index];

  return (
    <div className={`mobile-device-frame ${className}`}>
      <div className="mobile-volume-btn" />
      <div className="mobile-power-btn" />

      <div className="mobile-inner-screen">
        {/* 顶部状态栏与灵动岛 */}
        <div className="mobile-status-bar">
          <span className="mobile-time">09:41</span>
          <div className="mobile-dynamic-island">
            <span className="island-camera" />
            <span className="island-sensor" />
          </div>
          <div className="mobile-status-icons">
            <Signal size={12} />
            <Wifi size={12} />
            <Battery size={13} />
          </div>
        </div>

        {/* 屏幕内容 */}
        <div className="mobile-screen-content">
          {mediaSrc ? (
            mediaSrc.endsWith('.mp4') ? (
              <video src={mediaSrc} autoPlay loop muted playsInline className="mobile-media" />
            ) : (
              <img src={mediaSrc} alt="移动端展示动图" className="mobile-media" />
            )
          ) : children ? (
            children
          ) : (
            <div className="mobile-simulated-app">
              <div className="mobile-app-header">
                <div>
                  <span className="app-subtitle">所忆随笔</span>
                  <h3 className="app-maintitle">记下此刻</h3>
                </div>
                <div className="header-badge-encrypted">
                  <Lock size={11} />
                  <span>端到端加密</span>
                </div>
              </div>

              {/* 随拍照片卡 */}
              <div className="mobile-photo-preview">
                <img src={travelPhoto} alt="随拍记忆" />
                <div className="photo-corner-tag">
                  <Camera size={11} />
                  <span>原图私密封存</span>
                </div>
              </div>

              {/* 实时定位反查卡片 */}
              <div className="mobile-location-card">
                <div className="location-icon-circle">
                  <MapPin size={14} />
                </div>
                <div className="location-text">
                  <strong>{current.city}</strong>
                  <span>{current.address}</span>
                </div>
                <span className="location-provider-tag">高德定位</span>
              </div>

              {/* 随笔输入预览 */}
              <div className="mobile-entry-note">
                <p>{current.caption}</p>
                <div className="entry-footer">
                  <span className="entry-timestamp">{current.time}</span>
                  <span className="entry-status">
                    <Check size={12} /> 已写入本地 SQLite
                  </span>
                </div>
              </div>

              {/* 底部悬浮操作与安全同步提示 */}
              <div className="mobile-bottom-bar">
                <div className="sync-chip">
                  <Sparkles size={12} />
                  <span>离开本机前自动密文打包</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 底部横条（Home Indicator） */}
        <div className="mobile-home-indicator" />
      </div>
    </div>
  );
};

export default MobileDeviceMockup;
