import { load as loadAmap } from '@amap/amap-jsapi-loader';
import { useEffect, useRef, useState } from 'react';
import './amap-js-prototype.css';

declare global {
  interface Window {
    _AMapSecurityConfig?: { securityJsCode: string };
    ReactNativeWebView?: { postMessage(message: string): void };
  }
}

interface MapInstance {
  destroy(): void;
  on(event: string, callback: (event?: unknown) => void): void;
}

interface MarkerInstance {
  on(event: string, callback: () => void): void;
  setMap(map: MapInstance | null): void;
}

interface ClusterInstance {
  setMap?(map: MapInstance | null): void;
}

interface AmapNamespace {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => MapInstance;
  Marker: new (options: Record<string, unknown>) => MarkerInstance;
  MarkerCluster?: new (map: MapInstance, markers: MarkerInstance[], options: Record<string, unknown>) => ClusterInstance;
}

interface RuntimeMarker {
  id: string;
  lat: number;
  lng: number;
  selected?: boolean;
  title?: string;
}

type RuntimeMessage =
  | { type: 'setMarkers'; markers: RuntimeMarker[] }
  | { type: 'setSelected'; id: string | null };

const CENTER: [number, number] = [122.12042, 37.51307];

function post(message: Record<string, unknown>): void {
  window.ReactNativeWebView?.postMessage(JSON.stringify(message));
}

function parseMessage(event: MessageEvent): RuntimeMessage | null {
  try {
    const value = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    if (!value || typeof value !== 'object' || typeof value.type !== 'string') return null;
    return value as RuntimeMessage;
  } catch {
    return null;
  }
}

export default function AmapJsRuntime() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const amapRef = useRef<AmapNamespace | null>(null);
  const markersRef = useRef<MarkerInstance[]>([]);
  const clusterRef = useRef<ClusterInstance | null>(null);
  const markerDataRef = useRef<RuntimeMarker[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [markerCount, setMarkerCount] = useState(0);

  useEffect(() => {
    const apiKey = import.meta.env.VITE_MEMORY_RECALL_AMAP_JS_API_KEY?.trim() ?? '';
    const securityJsCode = import.meta.env.VITE_MEMORY_RECALL_AMAP_JS_SECURITY_CODE?.trim() ?? '';
    let cancelled = false;
    if (!apiKey || !securityJsCode) {
      setStatus('error');
      post({ type: 'error', message: '缺少高德 JS API Key 或 securityJsCode。' });
      return () => undefined;
    }
    window._AMapSecurityConfig = { securityJsCode };
    const onMessage = (event: MessageEvent) => {
      const message = parseMessage(event);
      if (message?.type === 'setMarkers') {
        markerDataRef.current = message.markers.filter(
          (marker) => Number.isFinite(marker.lat) && Number.isFinite(marker.lng),
        );
        setMarkerCount(markerDataRef.current.length);
        renderMarkers();
      } else if (message?.type === 'setSelected') {
        markerDataRef.current = markerDataRef.current.map((marker) => ({
          ...marker,
          selected: marker.id === message.id,
        }));
        renderMarkers();
      }
    };
    window.addEventListener('message', onMessage);
    const renderMarkers = () => {
      const map = mapRef.current;
      const AMap = amapRef.current;
      if (!map || !AMap) return;
      clusterRef.current?.setMap?.(null);
      clusterRef.current = null;
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = markerDataRef.current.map((data) => {
        const marker = new AMap.Marker({
          anchor: 'center',
          content: `<span class="amap-runtime-marker${data.selected ? ' is-selected' : ''}"></span>`,
          position: [data.lng, data.lat],
          title: data.title ?? data.id,
        });
        marker.on('click', () => post({ type: 'markerPressed', id: data.id }));
        return marker;
      });
      if (AMap.MarkerCluster && markersRef.current.length > 40) {
        clusterRef.current = new AMap.MarkerCluster(map, markersRef.current, {
          gridSize: 80,
          maxZoom: 16,
          renderClusterMarker: (context: { count: number; marker: MarkerInstance }) => {
            context.marker.setMap(map);
          },
        });
      } else {
        markersRef.current.forEach((marker) => marker.setMap(map));
      }
    };
    void loadAmap({ key: apiKey, version: '2.0', plugins: ['AMap.MarkerCluster'] })
      .then((loadedNamespace: unknown) => {
        if (cancelled || !containerRef.current) return;
        const AMap = loadedNamespace as AmapNamespace;
        const map = new AMap.Map(containerRef.current, {
          center: CENTER,
          zoom: 5,
          viewMode: '2D',
          mapStyle: 'amap://styles/whitesmoke',
          features: ['bg', 'road', 'point'],
        });
        mapRef.current = map;
        amapRef.current = AMap;
        map.on('click', (event) => {
          const value = event as { lnglat?: { getLng(): number; getLat(): number } };
          if (value.lnglat) post({ type: 'mapPressed', lat: value.lnglat.getLat(), lng: value.lnglat.getLng() });
        });
        map.on('moveend', () => post({ type: 'cameraIdle' }));
        setStatus('ready');
        post({ type: 'ready' });
        renderMarkers();
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus('error');
        post({ type: 'error', message: error instanceof Error ? error.message : '高德地图加载失败。' });
      });
    return () => {
      cancelled = true;
      window.removeEventListener('message', onMessage);
      clusterRef.current?.setMap?.(null);
      markersRef.current.forEach((marker) => marker.setMap(null));
      mapRef.current?.destroy();
      mapRef.current = null;
      amapRef.current = null;
    };
  }, []);

  return (
    <main className="amap-js-prototype" aria-label="RN WebView 高德 JS API 2.0 Runtime">
      <div ref={containerRef} className="amap-js-prototype__map" />
      {status === 'loading' && <div className="amap-js-prototype__notice" role="status">正在加载地图 Runtime…</div>}
      {status === 'error' && <div className="amap-js-prototype__notice amap-js-prototype__notice--error" role="alert">高德地图 Runtime 无法启动</div>}
      {status === 'ready' && <span className="amap-js-prototype__ready">RN WebView · AMap 2.0 · {markerCount} 点</span>}
    </main>
  );
}
