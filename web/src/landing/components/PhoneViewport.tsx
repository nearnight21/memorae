import type { FC, ReactNode } from 'react';
import { Smartphone, Play } from 'lucide-react';

export interface PhoneViewportProps {
  videoSrc?: string;
  imageSrc?: string;
  alt?: string;
  placeholderTitle?: string;
  placeholderSubtitle?: string;
  className?: string;
  children?: ReactNode;
}

export const PhoneViewport: FC<PhoneViewportProps> = ({
  videoSrc,
  imageSrc,
  alt = 'Memorae 真机展示',
  placeholderTitle = '真实产品操作视窗',
  placeholderSubtitle = '支持 10 秒无缝循环录屏或竖屏全屏截图',
  className = '',
  children,
}) => {
  return (
    <div className={`phone-device-shell ${className}`}>
      {/* 手机屏幕容器 */}
      <div className="phone-screen-container">
        {/* 灵动岛 (Dynamic Island) */}
        <div className="phone-island">
          <span className="phone-island-lens" />
        </div>

        {/* 内部媒体展示插槽 */}
        {children ? (
          children
        ) : videoSrc ? (
          <video
            src={videoSrc}
            autoPlay
            loop
            muted
            playsInline
            className="phone-media-fill"
          />
        ) : imageSrc ? (
          <img src={imageSrc} alt={alt} className="phone-media-fill" />
        ) : (
          <div className="phone-placeholder-box">
            <div className="placeholder-pulse-icon">
              <Play size={20} />
            </div>
            <h5>{placeholderTitle}</h5>
            <p>{placeholderSubtitle}</p>
            <span className="placeholder-badge">1080 × 2400 · 9:19.5</span>
          </div>
        )}

        {/* 底部横条 (Home Bar) */}
        <div className="phone-home-indicator" />
      </div>
    </div>
  );
};

export default PhoneViewport;
