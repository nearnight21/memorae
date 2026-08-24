import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';
import {
  AMAP_RUNTIME_LOCAL_ORIGIN,
  buildAmapRuntimeHtml,
  createAmapRuntimeConfig,
} from './amapRuntimeHtml';

export interface AmapWebViewMarker {
  id: string;
  lat: number;
  lng: number;
  thumbnailRef?: string;
  country?: string;
  province?: string;
  city?: string;
}

export interface AmapMapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface AmapMapClusterPress {
  lat: number;
  lng: number;
  ids: string[];
  count: number;
  scope?: 'country' | 'province' | 'city';
  label?: string;
}

type RuntimeEvent =
  | { type: 'runtimeStarted' }
  | { type: 'ready' }
  | { type: 'markersApplied'; count: number }
  | { type: 'markerPressed'; id: string }
  | ({ type: 'clusterPressed' } & AmapMapClusterPress)
  | { type: 'mapPressed'; lat: number; lng: number }
  | { type: 'cameraIdle'; lat: number; lng: number; zoom?: number; bounds?: AmapMapBounds }
  | { type: 'error'; message: string };

function parseBounds(value: unknown): AmapMapBounds | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const bounds = value as Record<string, unknown>;
  if (!['north', 'south', 'east', 'west'].every((key) => (
    typeof bounds[key] === 'number' && Number.isFinite(bounds[key])
  ))) return undefined;
  return {
    north: bounds.north as number,
    south: bounds.south as number,
    east: bounds.east as number,
    west: bounds.west as number,
  };
}

function parseRuntimeEvent(value: unknown): RuntimeEvent | null {
  if (!value || typeof value !== 'object' || !('type' in value)) return null;
  const message = value as Record<string, unknown>;
  if (message.type === 'runtimeStarted' || message.type === 'ready') {
    return { type: message.type };
  }
  if (
    message.type === 'cameraIdle'
    && typeof message.lat === 'number' && Number.isFinite(message.lat)
    && typeof message.lng === 'number' && Number.isFinite(message.lng)
  ) {
    const bounds = parseBounds(message.bounds);
    return {
      type: 'cameraIdle',
      lat: message.lat,
      lng: message.lng,
      ...(typeof message.zoom === 'number' && Number.isFinite(message.zoom) ? { zoom: message.zoom } : {}),
      ...(bounds ? { bounds } : {}),
    };
  }
  if (message.type === 'markersApplied' && typeof message.count === 'number' && Number.isFinite(message.count)) {
    return { type: message.type, count: Math.max(0, Math.floor(message.count)) };
  }
  if (message.type === 'markerPressed' && typeof message.id === 'string') {
    return { type: message.type, id: message.id };
  }
  if (
    message.type === 'clusterPressed'
    && typeof message.lat === 'number' && Number.isFinite(message.lat)
    && typeof message.lng === 'number' && Number.isFinite(message.lng)
  ) {
    return {
      type: message.type,
      lat: message.lat,
      lng: message.lng,
      ids: Array.isArray(message.ids) ? message.ids.filter((id): id is string => typeof id === 'string') : [],
      count: typeof message.count === 'number' && Number.isFinite(message.count)
        ? Math.max(1, Math.floor(message.count))
        : 1,
      scope: message.scope === 'country' || message.scope === 'province' || message.scope === 'city'
        ? message.scope
        : undefined,
      label: typeof message.label === 'string' ? message.label : undefined,
    };
  }
  if (
    message.type === 'mapPressed'
    && typeof message.lat === 'number' && Number.isFinite(message.lat)
    && typeof message.lng === 'number' && Number.isFinite(message.lng)
  ) {
    return { type: message.type, lat: message.lat, lng: message.lng };
  }
  if (message.type === 'error' && typeof message.message === 'string') {
    return { type: message.type, message: message.message };
  }
  return null;
}

interface Props {
  markers: AmapWebViewMarker[];
  onMarkerPressed?: (id: string) => void;
  onClusterPressed?: (cluster: AmapMapClusterPress) => void;
  onMapPressed?: (coordinates: { lat: number; lng: number }) => void;
  onCameraIdle?: (coordinates: AmapMapCamera) => void;
  initialCamera?: AmapMapCamera;
  cameraTarget?: AmapMapCamera | null;
  markerUpdatesPaused?: boolean;
  showStatus?: boolean;
}

export interface AmapMapCamera {
  lat: number;
  lng: number;
  zoom?: number;
  bounds?: AmapMapBounds;
}

interface WebViewHandle {
  postMessage(message: string): void;
  reload(): void;
}

const WEBVIEW_DEBUGGING_ENABLED = process.env.EXPO_PUBLIC_AMAP_WEBVIEW_DEBUG === '1';

function extractRuntimeScript(html: string): string {
  const startTag = '<script>';
  const start = html.indexOf(startTag);
  const end = html.lastIndexOf('</script>');
  if (start < 0 || end <= start) return 'true;';
  return `${html.slice(start + startTag.length, end)}\ntrue;`;
}

function post(webView: WebViewHandle | null, message: Record<string, unknown>): void {
  webView?.postMessage(JSON.stringify(message));
}

function validMarkers(markers: AmapWebViewMarker[]): AmapWebViewMarker[] {
  return markers.filter((marker) => (
    typeof marker.id === 'string'
    && Number.isFinite(marker.lat) && marker.lat >= -90 && marker.lat <= 90
    && Number.isFinite(marker.lng) && marker.lng >= -180 && marker.lng <= 180
  )).map((marker) => ({
    id: marker.id,
    lat: marker.lat,
    lng: marker.lng,
    ...(typeof marker.thumbnailRef === 'string' ? { thumbnailRef: marker.thumbnailRef } : {}),
    ...(typeof marker.country === 'string' ? { country: marker.country } : {}),
    ...(typeof marker.province === 'string' ? { province: marker.province } : {}),
    ...(typeof marker.city === 'string' ? { city: marker.city } : {}),
  }));
}

export default function AmapJsWebViewMap({
  markers,
  onMarkerPressed,
  onClusterPressed,
  onMapPressed,
  onCameraIdle,
  initialCamera,
  cameraTarget,
  markerUpdatesPaused = false,
  showStatus = true,
}: Props) {
  const webViewRef = useRef<WebViewHandle | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('正在加载本地地图 Runtime…');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const config = useMemo(() => createAmapRuntimeConfig(), []);
  const html = useMemo(
    () => buildAmapRuntimeHtml(config.apiKey, config.securityJsCode),
    [config.apiKey, config.securityJsCode],
  );
  const injectedRuntimeScript = useMemo(() => extractRuntimeScript(html), [html]);
  const safeMarkers = useMemo(() => validMarkers(markers), [markers]);
  const initialCameraKey = useMemo(() => JSON.stringify(initialCamera ?? null), [initialCamera]);
  const cameraTargetKey = useMemo(() => JSON.stringify(cameraTarget ?? null), [cameraTarget]);
  const initialCameraApplied = useRef(false);

  const sendMarkers = useCallback(() => {
    post(webViewRef.current, { type: 'setMarkers', markers: safeMarkers });
  }, [safeMarkers]);

  useEffect(() => {
    if (ready && !markerUpdatesPaused) sendMarkers();
  }, [ready, markerUpdatesPaused, sendMarkers]);

  useEffect(() => {
    if (!ready) {
      initialCameraApplied.current = false;
      return;
    }
    if (!initialCamera || initialCameraApplied.current) return;
    initialCameraApplied.current = true;
    post(webViewRef.current, { type: 'setCamera', ...initialCamera });
  }, [ready, initialCameraKey, initialCamera]);

  useEffect(() => {
    if (!ready || !cameraTarget) return;
    post(webViewRef.current, { type: 'setCamera', ...cameraTarget });
  }, [ready, cameraTargetKey]);

  useEffect(() => () => {
    post(webViewRef.current, { type: 'clearSensitiveData' });
  }, []);

  useEffect(() => {
    if (!safeMarkers.some((marker) => marker.id === selectedId)) {
      setSelectedId(null);
      if (ready) post(webViewRef.current, { type: 'setSelected', id: null });
    }
  }, [ready, safeMarkers, selectedId]);

  function handleMessage(event: WebViewMessageEvent): void {
    let message: RuntimeEvent | null;
    try {
      message = parseRuntimeEvent(JSON.parse(event.nativeEvent.data));
    } catch {
      setStatus('地图 Runtime 消息无效。');
      return;
    }
    if (!message) {
      setStatus('地图 Runtime 消息无效。');
      return;
    }
    if (message.type === 'runtimeStarted') {
      setStatus('地图 Runtime 已启动，正在加载高德脚本…');
    } else if (message.type === 'ready') {
      setReady(true);
      setStatus(`地图已就绪：${safeMarkers.length} 个地点。`);
      console.warn('[memory-diagnostics]', JSON.stringify({
        stage: 'webview-ready',
        mapDtoCount: safeMarkers.length,
      }));
    } else if (message.type === 'markersApplied') {
      console.warn('[memory-diagnostics]', JSON.stringify({
        stage: 'webview-marker-bridge',
        webViewMarkerCount: message.count,
      }));
    } else if (message.type === 'markerPressed') {
      setSelectedId(message.id);
      post(webViewRef.current, { type: 'setSelected', id: message.id });
      onMarkerPressed?.(message.id);
    } else if (message.type === 'clusterPressed') {
      onClusterPressed?.(message);
    } else if (message.type === 'mapPressed') {
      setStatus(`已选择地图坐标：${message.lat.toFixed(5)}, ${message.lng.toFixed(5)}。`);
      onMapPressed?.({ lat: message.lat, lng: message.lng });
    } else if (message.type === 'cameraIdle') {
      setStatus(`地图已停稳：${message.lat.toFixed(5)}, ${message.lng.toFixed(5)}。`);
      onCameraIdle?.({
        lat: message.lat,
        lng: message.lng,
        zoom: message.zoom,
        ...(message.bounds ? { bounds: message.bounds } : {}),
      });
    } else if (message.type === 'error') {
      setReady(false);
      setStatus(`地图错误：${message.message}`);
    }
  }

  return (
    <View style={styles.root}>
      <WebView
        ref={(value) => { webViewRef.current = value as WebViewHandle | null; }}
        source={{ html, baseUrl: AMAP_RUNTIME_LOCAL_ORIGIN }}
        originWhitelist={['https://memorae.cn']}
        javaScriptEnabled
        injectedJavaScript={injectedRuntimeScript}
        webviewDebuggingEnabled={WEBVIEW_DEBUGGING_ENABLED}
        androidLayerType="hardware"
        domStorageEnabled={false}
        cacheEnabled={false}
        setSupportMultipleWindows={false}
        onMessage={handleMessage}
        onLoadEnd={() => setStatus('本地地图 Runtime 已加载。')}
        onHttpError={({ nativeEvent }) => {
          if (/amap|autonavi/i.test(nativeEvent.url)) {
            setStatus(`高德请求失败：HTTP ${nativeEvent.statusCode}。`);
          }
        }}
        onError={({ nativeEvent }) => setStatus(`地图页面加载失败：${nativeEvent.description}`)}
        style={[StyleSheet.absoluteFill, styles.webView]}
      />
      {showStatus && <View pointerEvents="none" style={styles.status}><Text style={styles.statusText}>{status}</Text></View>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    minHeight: 360, overflow: 'hidden', borderRadius: 14, backgroundColor: 'transparent',
  },
  webView: { backgroundColor: 'transparent' },
  status: { position: 'absolute', left: 10, right: 10, bottom: 10, padding: 8, borderRadius: 10, backgroundColor: 'rgba(250,248,241,0.9)' },
  statusText: { color: '#5a5145', fontSize: 11 },
});
