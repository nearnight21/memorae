import { useState, type FC } from 'react';
import { Camera, LockKeyhole, MapPin, Play } from 'lucide-react';
import travelPhoto from '../../assets/login/travel-photo.png';

const CLIPS = [
  { label: '记录照片', icon: Camera, source: '' },
  { label: '确认地点', icon: MapPin, source: '' },
  { label: '本地加密', icon: LockKeyhole, source: '' },
] as const;

/** 真机视频容器。没有录屏素材时明确显示素材位，不用 CSS 假动画冒充 App 录屏。 */
export const MobileActionDemo: FC = () => {
  const [index, setIndex] = useState(0);
  const clip = CLIPS[index];
  const Icon = clip.icon;

  return (
    <div className="mobile-action-demo">
      <div className="phone-preview-top"><span>09:41</span><span className="phone-preview-island" /><span>● ◒ ▮</span></div>
      <div className="phone-preview-screen phone-video-screen">
        {clip.source ? (
          <video className="phone-video-player" src={clip.source} poster={travelPhoto} controls muted playsInline />
        ) : (
          <div className="phone-video-placeholder">
            <img src={travelPhoto} alt="真机演示视频封面" />
            <div className="phone-video-placeholder-scrim" />
            <div className="phone-video-placeholder-label"><Play size={17} fill="currentColor" /><span>真机录屏素材位</span></div>
            <span className="phone-video-placeholder-note">待接入 {clip.label} MP4 / WebM</span>
          </div>
        )}
      </div>
      <div className="phone-preview-controls"><Icon size={12} /><span>{clip.label} · 真实 App 录屏</span></div>
      <div className="phone-action-progress" aria-label="手机端视频步骤">
        {CLIPS.map((item, clipIndex) => <button key={item.label} type="button" aria-label={`查看${item.label}视频`} aria-current={clipIndex === index} onClick={() => setIndex(clipIndex)} />)}
      </div>
      <div className="phone-preview-home" />
    </div>
  );
};

export default MobileActionDemo;
