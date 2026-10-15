import { useEffect, useRef, useState, type FC } from 'react';
import { BatteryFull, CalendarDays, Camera, Check, ChevronDown, FileLock2, LockKeyhole, MapPin, Pause, Play, ShieldCheck, Signal, Wifi } from 'lucide-react';
import travelPhoto from '../../assets/login/travel-photo.png';

const CLIPS = [
  { label: '记录照片', description: '留住一张照片，也留住当时的心情。', icon: Camera, source: '' },
  { label: '确认地点', description: '为那个瞬间，在地图上留一个坐标。', icon: MapPin, source: '' },
  { label: '本地加密', description: '离开设备之前，先把记忆妥善封存。', icon: LockKeyhole, source: '' },
] as const;

/** 交互示意与真实视频分开呈现，不把界面动画标记为 App 录屏。 */
export const MobileActionDemo: FC = () => {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const clip = CLIPS[index];

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      setReducedMotion(media.matches);
      if (media.matches) setPlaying(false);
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!stage.current) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.25 });
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!playing || !visible || reducedMotion) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setIndex((value) => (value + 1) % CLIPS.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [playing, visible, reducedMotion]);

  return (
    <div ref={stage} className="mobile-action-demo">
      <div className="mobile-story-steps">
        <span className="experience-copy-kicker">把一个瞬间，认真收好</span>
        <div className="mobile-step-list" aria-label="手机记录步骤">
          {CLIPS.map((item, step) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                className={`mobile-step-card ${step === index ? 'is-active' : ''}`}
                aria-expanded={step === index}
                aria-controls="mobile-demo-panel"
                onClick={() => { setIndex(step); setPlaying(false); }}
              >
                <span className="mobile-step-number">0{step + 1}</span>
                <span className="mobile-step-copy"><strong>{item.label}</strong><span>{item.description}</span></span>
                <span className="mobile-step-icon"><Icon size={19} /><ChevronDown size={15} /></span>
              </button>
            );
          })}
        </div>
        <div className="mobile-demo-footnote">
          <span>手机端操作示意</span>
          {!reducedMotion && (
            <button type="button" onClick={() => setPlaying((value) => !value)} aria-label={playing ? '暂停自动演示' : '继续自动演示'}>
              {playing ? <Pause size={12} /> : <Play size={12} />} {playing ? '暂停演示' : '继续演示'}
            </button>
          )}
        </div>
      </div>
      <div className="mobile-phone-stage">
        <div className="phone-topography" aria-hidden="true" />
        <span className="phone-stage-coordinate" aria-hidden="true">25.69°N · 100.16°E</span>
        <div className="phone-preview">
          <div className="phone-preview-top"><span>9:41</span><span className="phone-preview-island" /><span className="phone-status-icons"><Signal size={12} /><Wifi size={12} /><BatteryFull size={16} /></span></div>
          <div id="mobile-demo-panel" className="phone-preview-screen" role="region" aria-label={`操作示意：${clip.label}`} aria-live={playing ? 'off' : 'polite'}>
            {clip.source ? (
              <video className="phone-video-player" src={clip.source} poster={travelPhoto} controls muted playsInline />
            ) : (
              <div className={`phone-demo-state is-step-${index}`} key={index}>
                <div className="phone-journal-heading"><span>所忆 · 随手记</span><LockKeyhole size={13} /></div>
                {index < 2 ? (
                  <>
                    <div className="phone-journal-photo"><img src={travelPhoto} alt="演示照片：落日下的街巷" loading="lazy" width="260" height="250" /><span><CalendarDays size={11} /> 2024.05.18</span></div>
                    <div className={`phone-location-card ${index === 1 ? 'is-located' : ''}`}><MapPin size={17} /><div><strong>大理 · 洱海</strong>{index === 1 && <span>25.69°N, 100.16°E</span>}</div>{index === 1 && <Check size={14} />}</div>
                    {index === 0 ? (
                      <p className="phone-journal-note">午后的微风与海浪，<br />在这里虚度时光……</p>
                    ) : (
                      <div className="phone-mini-map" aria-label="地点已确认"><span className="mini-map-road" /><span className="mini-map-pin"><MapPin size={23} fill="currentColor" /></span><span className="mini-map-label">把回忆，放回发生的地方</span></div>
                    )}
                    <div className="phone-journal-bottom"><span>记录此刻，留给未来</span><Check size={13} /></div>
                  </>
                ) : (
                  <div className="phone-encryption-state">
                    <div className="phone-shield"><ShieldCheck size={54} strokeWidth={1.2} /><span><Check size={13} /></span></div>
                    <h3>记忆，已妥善封存。</h3>
                    <span className="phone-encryption-badge"><LockKeyhole size={11} /> AES-GCM 256 本地加密完成</span>
                    <div className="phone-encrypted-files">{['缩略图.enc', '预览图.enc', '原图.enc'].map((name) => <span key={name}><FileLock2 size={14} />{name}<Check size={12} /></span>)}</div>
                    <p>VMK 密钥在本机解锁使用<br />上传云端的，只有密文。</p>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="phone-preview-home" />
        </div>
        <span className="phone-stage-note"><LockKeyhole size={11} /> 每个瞬间，都值得被好好保存。</span>
      </div>
    </div>
  );
};

export default MobileActionDemo;
