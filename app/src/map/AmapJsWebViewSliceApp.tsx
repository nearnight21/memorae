import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';

import { TEST_CITIES } from './mapTestMarkers';

type MarkerCount = 100 | 1000;

interface RuntimeMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;
}

type RuntimeEvent =
  | { type: 'ready' }
  | { type: 'markerPressed'; id: string }
  | { type: 'mapPressed'; lat: number; lng: number }
  | { type: 'cameraIdle' }
  | { type: 'error'; message: string };

const RUNTIME_URL = process.env.EXPO_PUBLIC_AMAP_WEB_RUNTIME_URL
  || 'https://memorae.cn/?amap-runtime=1';

function buildRuntimeMarkers(count: MarkerCount): RuntimeMarker[] {
  const cities = Object.entries(TEST_CITIES);
  return Array.from({ length: count }, (_, index) => {
    const [city, center] = cities[index % cities.length];
    const ring = Math.floor(index / cities.length);
    const angle = (ring * 0.71) % (Math.PI * 2);
    const radius = 0.03 + (ring % 40) * 0.002;
    return {
      id: `webview-${count}-${index}`,
      lat: center.latitude + Math.sin(angle) * radius,
      lng: center.longitude + Math.cos(angle) * radius,
      title: `${city} · WebView 测试点 ${index + 1}`,
    };
  });
}

interface WebViewHandle {
  postMessage(message: string): void;
  reload(): void;
}

function post(webView: WebViewHandle | null, message: Record<string, unknown>): void {
  webView?.postMessage(JSON.stringify(message));
}

export default function AmapJsWebViewSliceApp() {
  const webViewRef = useRef<any>(null);
  const [markerCount, setMarkerCount] = useState<MarkerCount>(100);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [cameraIdleCount, setCameraIdleCount] = useState(0);
  const [status, setStatus] = useState('正在连接 AMap JS Runtime…');
  const markers = useMemo(() => buildRuntimeMarkers(markerCount), [markerCount]);

  const sendMarkers = useCallback(() => {
    post(webViewRef.current, { type: 'setMarkers', markers });
    setStatus(`已发送 ${markers.length} 个地点；拖动期间不发送逐帧消息。`);
  }, [markers]);

  useEffect(() => {
    if (runtimeReady) sendMarkers();
  }, [runtimeReady, sendMarkers]);

  function handleMessage(event: WebViewMessageEvent): void {
    let message: RuntimeEvent;
    try {
      message = JSON.parse(event.nativeEvent.data) as RuntimeEvent;
    } catch {
      setStatus('收到无法解析的 Runtime 消息。');
      return;
    }
    if (message.type === 'ready') {
      setRuntimeReady(true);
      setStatus('Runtime 已就绪，等待地点数据。');
    } else if (message.type === 'markerPressed') {
      setSelectedMarkerId(message.id);
      post(webViewRef.current, { type: 'setSelected', id: message.id });
      setStatus(`点击地点：${message.id}`);
    } else if (message.type === 'mapPressed') {
      setStatus(`地图点击：${message.lat.toFixed(4)}, ${message.lng.toFixed(4)}`);
    } else if (message.type === 'cameraIdle') {
      setCameraIdleCount((count) => count + 1);
    } else if (message.type === 'error') {
      setStatus(`Runtime 错误：${message.message}`);
    }
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <WebView
        ref={webViewRef}
        source={{ uri: RUNTIME_URL }}
        originWhitelist={['https://*', 'http://*']}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        onMessage={handleMessage}
        onLoadEnd={() => setStatus('Runtime 页面已加载，等待地图 ready。')}
        onError={({ nativeEvent }) => setStatus(`WebView 加载失败：${nativeEvent.description}`)}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.panel}>
          <Text style={styles.eyebrow}>RN · WEBVIEW · AMAP JS API 2.0</Text>
          <Text style={styles.title}>所忆 · WebView 地图垂直切片</Text>
          <Text numberOfLines={2} style={styles.status}>{status}</Text>
          <View style={styles.row}>
            {([100, 1000] as const).map((count) => (
              <Pressable
                key={count}
                style={[styles.chip, markerCount === count && styles.chipActive]}
                onPress={() => {
                  setMarkerCount(count);
                  setSelectedMarkerId(null);
                  setTimeout(() => post(webViewRef.current, {
                    type: 'setMarkers', markers: buildRuntimeMarkers(count),
                  }), 0);
                }}
              ><Text style={styles.chipText}>{count} 点 + 聚类</Text></Pressable>
            ))}
            <Pressable style={styles.chip} onPress={() => webViewRef.current?.reload()}>
              <Text style={styles.chipText}>重建 WebView</Text>
            </Pressable>
          </View>
          <Text style={styles.metrics}>
            bridge: ready={runtimeReady ? 'yes' : 'no'} · cameraIdle={cameraIdleCount}
            {selectedMarkerId ? ` · selected=${selectedMarkerId}` : ''}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#e7e3d9' },
  overlay: { ...StyleSheet.absoluteFill },
  panel: {
    position: 'absolute', top: 42, left: 12, right: 12, padding: 12, gap: 8,
    borderRadius: 18, backgroundColor: 'rgba(250,248,241,0.94)',
    borderWidth: 1, borderColor: 'rgba(92,78,61,0.22)',
  },
  eyebrow: { fontSize: 9, letterSpacing: 1, fontWeight: '700', color: '#726553' },
  title: { marginTop: 2, fontSize: 18, fontWeight: '800', color: '#27231e' },
  status: { color: '#5a5145', fontSize: 12, lineHeight: 17 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: '#e8e2d6' },
  chipActive: { backgroundColor: '#b9c9ad' },
  chipText: { color: '#342f28', fontSize: 11, fontWeight: '700' },
  metrics: { fontSize: 10, color: '#756b5d' },
});
