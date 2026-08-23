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
  photoCount?: number;
  thumbnailRefs?: string[];
  scale?: number;
}

type RuntimeEvent =
  | { type: 'runtimeStarted' }
  | { type: 'ready' }
  | { type: 'markerPressed'; id: string }
  | { type: 'clusterPressed'; id?: string; lat: number; lng: number }
  | { type: 'mapPressed'; lat: number; lng: number }
  | { type: 'cameraIdle' }
  | { type: 'error'; message: string };

function parseRuntimeEvent(value: unknown): RuntimeEvent | null {
  if (!value || typeof value !== 'object' || !('type' in value)) return null;
  const message = value as Record<string, unknown>;
  if (message.type === 'runtimeStarted' || message.type === 'ready' || message.type === 'cameraIdle') {
    return { type: message.type };
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
      id: typeof message.id === 'string' ? message.id : undefined,
      lat: message.lat,
      lng: message.lng,
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
  onClusterPressed?: (coordinates: { lat: number; lng: number; id?: string }) => void;
  onMapPressed?: (coordinates: { lat: number; lng: number }) => void;
  showStatus?: boolean;
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
    ...(Number.isFinite(marker.photoCount) ? { photoCount: Math.max(0, Math.floor(marker.photoCount!)) } : {}),
    ...(Array.isArray(marker.thumbnailRefs) ? { thumbnailRefs: marker.thumbnailRefs.slice(0, 3) } : {}),
    ...(Number.isFinite(marker.scale) ? { scale: Math.max(0.72, Math.min(1.35, marker.scale!)) } : {}),
  }));
}

export default function AmapJsWebViewMap({ markers, onMarkerPressed, onClusterPressed, onMapPressed, showStatus = true }: Props) {
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

  const sendMarkers = useCallback(() => {
    post(webViewRef.current, { type: 'setMarkers', markers: safeMarkers });
  }, [safeMarkers]);

  useEffect(() => {
    if (ready) sendMarkers();
  }, [ready, sendMarkers]);

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
    } else if (message.type === 'markerPressed') {
      setSelectedId(message.id);
      post(webViewRef.current, { type: 'setSelected', id: message.id });
      onMarkerPressed?.(message.id);
    } else if (message.type === 'clusterPressed') {
      onClusterPressed?.({ lat: message.lat, lng: message.lng, id: message.id });
    } else if (message.type === 'mapPressed') {
      setStatus(`已选择地图坐标：${message.lat.toFixed(5)}, ${message.lng.toFixed(5)}。`);
      onMapPressed?.({ lat: message.lat, lng: message.lng });
    } else if (message.type === 'cameraIdle') {
      setStatus(`地图已停稳：${safeMarkers.length} 个地点。`);
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
