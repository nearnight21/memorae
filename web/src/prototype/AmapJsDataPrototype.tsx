import { load as loadAmap } from '@amap/amap-jsapi-loader';
import { useEffect, useRef, useState } from 'react';
import type { Memory } from '../types';
import './amap-js-prototype.css';

declare global {
  interface Window {
    _AMapSecurityConfig?: { securityJsCode: string };
  }
}

interface AmapMarkerInstance {
  setMap(map: AmapMapInstance | null): void;
}

interface AmapMapInstance {
  destroy(): void;
}

interface AmapNamespace {
  Map: new (container: HTMLElement, options: {
    center: [number, number];
    features: string[];
    mapStyle: string;
    viewMode: '2D';
    zoom: number;
  }) => AmapMapInstance;
  Marker: new (options: {
    anchor: 'center';
    content: string;
    position: [number, number];
    title: string;
  }) => AmapMarkerInstance;
}

const WEIHAI_CENTER: [number, number] = [122.12042, 37.51307];

function locationLabel(memory: Memory): string {
  return [memory.country, memory.city, memory.location?.name]
    .map((value) => value?.trim())
    .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index)
    .join(' · ') || '未命名地点';
}

interface AmapJsDataPrototypeProps {
  memories: Memory[];
  onLock: () => void;
}

export default function AmapJsDataPrototype({ memories, onLock }: AmapJsDataPrototypeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const apiKey = import.meta.env.VITE_MEMORY_RECALL_AMAP_JS_API_KEY?.trim() ?? '';
    const securityJsCode = import.meta.env.VITE_MEMORY_RECALL_AMAP_JS_SECURITY_CODE?.trim() ?? '';
    let cancelled = false;
    let map: AmapMapInstance | null = null;
    let markers: AmapMarkerInstance[] = [];

    if (!apiKey || !securityJsCode) {
      setStatus('error');
      setErrorMessage(
        '缺少 VITE_MEMORY_RECALL_AMAP_JS_API_KEY 或 VITE_MEMORY_RECALL_AMAP_JS_SECURITY_CODE。',
      );
      return () => undefined;
    }

    window._AMapSecurityConfig = { securityJsCode };
    void loadAmap({ key: apiKey, version: '2.0' })
      .then((loadedNamespace: unknown) => {
        if (cancelled || !containerRef.current) return;
        const AMap = loadedNamespace as AmapNamespace;
        const coordinates = memories.filter(
          (memory): memory is Memory & { lat: number; lng: number } => (
            typeof memory.lat === 'number'
            && Number.isFinite(memory.lat)
            && typeof memory.lng === 'number'
            && Number.isFinite(memory.lng)
          ),
        );
        const center: [number, number] = coordinates.length > 0
          ? [coordinates[0].lng, coordinates[0].lat]
          : WEIHAI_CENTER;
        const nextMap = new AMap.Map(containerRef.current, {
          center,
          zoom: coordinates.length > 0 ? 5 : 10,
          viewMode: '2D',
          mapStyle: 'amap://styles/whitesmoke',
          features: ['bg', 'road', 'point'],
        });
        markers = coordinates.map((memory) => {
          const marker = new AMap.Marker({
            anchor: 'center',
            content: '<span class="amap-js-data-marker" aria-hidden="true"></span>',
            position: [memory.lng, memory.lat],
            title: `${memory.title} · ${locationLabel(memory)}`,
          });
          marker.setMap(nextMap);
          return marker;
        });
        if (cancelled) {
          markers.forEach((marker) => marker.setMap(null));
          nextMap.destroy();
          return;
        }
        map = nextMap;
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus('error');
        setErrorMessage(error instanceof Error ? error.message : '高德 JS API 2.0 加载失败。');
      });

    return () => {
      cancelled = true;
      markers.forEach((marker) => marker.setMap(null));
      map?.destroy();
      map = null;
      markers = [];
    };
  }, [memories]);

  const locatedCount = memories.filter(
    (memory) => typeof memory.lat === 'number' && Number.isFinite(memory.lat)
      && typeof memory.lng === 'number' && Number.isFinite(memory.lng),
  ).length;

  return (
    <main className="amap-js-prototype" aria-label="高德 JS API 2.0 真实地点数据测试">
      <div ref={containerRef} className="amap-js-prototype__map" />
      {status === 'loading' && (
        <div className="amap-js-prototype__notice" role="status">正在加载真实地点数据地图…</div>
      )}
      {status === 'error' && (
        <div className="amap-js-prototype__notice amap-js-prototype__notice--error" role="alert">
          <strong>高德 JS API 数据测试页无法启动</strong>
          <span>{errorMessage}</span>
        </div>
      )}
      {status === 'ready' && (
        <div className="amap-js-prototype__data-toolbar">
          <span>真实 MemoryV2 地点 · {locatedCount}/{memories.length}</span>
          <button type="button" onClick={onLock}>锁定并退出</button>
        </div>
      )}
    </main>
  );
}
