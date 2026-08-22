import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import AmapJsWebViewMap, { type AmapWebViewMarker } from './AmapJsWebViewMap';
import { TEST_CITIES } from './mapTestMarkers';

type MarkerCount = 100 | 1000;

function buildRuntimeMarkers(count: MarkerCount): AmapWebViewMarker[] {
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
    };
  });
}

export default function AmapJsWebViewSliceApp() {
  const [markerCount, setMarkerCount] = useState<MarkerCount>(100);
  const markers = useMemo(() => buildRuntimeMarkers(markerCount), [markerCount]);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <AmapJsWebViewMap markers={markers} />
      <View pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.panel}>
          <Text style={styles.eyebrow}>RN · LOCAL WEBVIEW · AMAP JS API 2.0</Text>
          <Text style={styles.title}>所忆 · 本地地图 Runtime</Text>
          <View style={styles.row}>
            {([100, 1000] as const).map((count) => (
              <Pressable
                key={count}
                style={[styles.chip, markerCount === count && styles.chipActive]}
                onPress={() => setMarkerCount(count)}
              ><Text style={styles.chipText}>{count} 点 + 聚类</Text></Pressable>
            ))}
          </View>
          <Text style={styles.metrics}>Runtime 随 APK 打包；测试点不进入正式密文库。</Text>
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
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: '#e8e2d6' },
  chipActive: { backgroundColor: '#b9c9ad' },
  chipText: { color: '#342f28', fontSize: 11, fontWeight: '700' },
  metrics: { fontSize: 10, color: '#756b5d' },
});
