import { useLayoutEffect, useRef, useState } from 'react';

const WIDTH = 1440;
const HEIGHT = 900;

/** Render the product in a real desktop viewport, then scale the entire viewport. */
export default function DesktopDemoViewport() {
  const container = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / WIDTH));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={container} className="desktop-demo-viewport" style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}>
      <iframe
        title="所忆 Web 桌面体验预览"
        src="/?landing-desktop-demo=1"
        width={WIDTH}
        height={HEIGHT}
        style={{ transform: `scale(${scale})` }}
      />
    </div>
  );
}
