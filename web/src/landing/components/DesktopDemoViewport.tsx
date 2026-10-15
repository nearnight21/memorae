import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Hand, LockKeyhole, MapPin, X } from 'lucide-react';

const WIDTH = 1440;
const HEIGHT = 900;

/** 保持真实桌面视口比例；靠近屏幕时才加载，主动激活后才接收地图手势。 */
export default function DesktopDemoViewport() {
  const container = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [nearViewport, setNearViewport] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [interactive, setInteractive] = useState(false);

  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    setScale(element.clientWidth / WIDTH);
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / WIDTH));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setNearViewport(true);
        observer.disconnect();
      }
    }, { rootMargin: '300px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={container}
      className={`desktop-demo-viewport ${interactive ? 'is-interactive' : ''}`}
      style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
      onMouseLeave={() => setInteractive(false)}
      onKeyDown={(event) => { if (event.key === 'Escape') setInteractive(false); }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && !event.currentTarget.contains(next)) setInteractive(false);
      }}
    >
      {!loaded && (
        <div className="desktop-demo-skeleton" role="status">
          <MapPin size={28} strokeWidth={1.3} />
          <span>正在展开记忆地图…</span>
          <small><LockKeyhole size={12} /> 只读演示空间</small>
        </div>
      )}
      {nearViewport && (
        <iframe
          id="landing-desktop-map"
          title="所忆 Web 桌面体验预览"
          src="/?landing-desktop-demo=1"
          width={WIDTH}
          height={HEIGHT}
          tabIndex={interactive ? 0 : -1}
          inert={!interactive}
          style={{ transform: `scale(${scale})`, pointerEvents: interactive ? 'auto' : 'none', opacity: loaded ? 1 : 0 }}
          onLoad={() => setLoaded(true)}
        />
      )}
      {loaded && (
        <button
          type="button"
          className={`map-interaction-toggle ${interactive ? 'is-active' : ''}`}
          aria-controls="landing-desktop-map"
          aria-pressed={interactive}
          onClick={() => setInteractive((value) => !value)}
        >
          {interactive ? <X size={14} /> : <Hand size={14} />}
          <span>{interactive ? '退出地图交互' : '点击激活地图交互'}</span>
        </button>
      )}
    </div>
  );
}
