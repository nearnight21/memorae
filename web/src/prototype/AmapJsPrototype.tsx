import { load as loadAmap } from '@amap/amap-jsapi-loader';
import { useEffect, useRef, useState } from 'react';
import './amap-js-prototype.css';

declare global {
  interface Window {
    _AMapSecurityConfig?: {
      securityJsCode: string;
    };
  }
}

interface AmapMapInstance {
  destroy(): void;
}

interface AmapNamespace {
  Map: new (
    container: HTMLElement,
    options: {
      center: [number, number];
      features: string[];
      mapStyle: string;
      viewMode: '2D';
      zoom: number;
    },
  ) => AmapMapInstance;
}

const WEIHAI_CENTER: [number, number] = [122.12042, 37.51307];

export default function AmapJsPrototype() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const apiKey = import.meta.env.VITE_MEMORY_RECALL_AMAP_JS_API_KEY?.trim() ?? '';
    const securityJsCode = import.meta.env.VITE_MEMORY_RECALL_AMAP_JS_SECURITY_CODE?.trim() ?? '';
    let cancelled = false;
    let map: AmapMapInstance | null = null;

    if (!apiKey || !securityJsCode) {
      setStatus('error');
      setErrorMessage(
        '缺少 VITE_MEMORY_RECALL_AMAP_JS_API_KEY 或 VITE_MEMORY_RECALL_AMAP_JS_SECURITY_CODE。',
      );
      return () => undefined;
    }

    window._AMapSecurityConfig = { securityJsCode };

    void loadAmap({
      key: apiKey,
      version: '2.0',
    }).then((loadedNamespace: unknown) => {
      if (cancelled || !containerRef.current) return;
      const AMap = loadedNamespace as AmapNamespace;
      const nextMap = new AMap.Map(containerRef.current, {
        center: WEIHAI_CENTER,
        zoom: 10,
        viewMode: '2D',
        mapStyle: 'amap://styles/whitesmoke',
        features: ['bg', 'road', 'point'],
      });
      if (cancelled) {
        nextMap.destroy();
        return;
      }
      map = nextMap;
      setStatus('ready');
    }).catch((error: unknown) => {
      if (cancelled) return;
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : '高德 JS API 2.0 加载失败。');
    });

    return () => {
      cancelled = true;
      map?.destroy();
      map = null;
    };
  }, []);

  return (
    <main className="amap-js-prototype" aria-label="高德 JS API 2.0 纯底图测试">
      <div ref={containerRef} className="amap-js-prototype__map" />
      {status === 'loading' && (
        <div className="amap-js-prototype__notice" role="status">
          正在加载高德 JS API 2.0 纯底图…
        </div>
      )}
      {status === 'error' && (
        <div className="amap-js-prototype__notice amap-js-prototype__notice--error" role="alert">
          <strong>高德 JS API 测试页无法启动</strong>
          <span>{errorMessage}</span>
        </div>
      )}
      {status === 'ready' && <span className="amap-js-prototype__ready">AMap JS API 2.0 · 纯底图</span>}
    </main>
  );
}
