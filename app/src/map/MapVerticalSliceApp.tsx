import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import ExpoAmapMapView from '../../modules/expo-amap-map/src/ExpoAmapMapView';
import type {
  CameraIdlePayload,
  ExpoAmapMapViewRef,
  MapDiagnostics,
  NativeErrorPayload,
} from '../../modules/expo-amap-map/src/ExpoAmapMap.types';
import { bytesToBase64 } from '../crypto';
import {
  createJpegPhotoVariant,
  PHOTO_VARIANT_SPECS,
} from '../photos/photoVariants';
import { createNativeMapProvider } from './MapProvider';
import {
  buildMapTestMarkers,
  TEST_CITIES,
  type ThumbnailSource,
} from './mapTestMarkers';
import {
  selectVisibleOverseasCities,
  type OverseasCityLabelContext,
} from './overseasCityData';

const THUMBNAIL_SPEC = PHOTO_VARIANT_SPECS.find((spec) => spec.kind === 'thumbnail');

function formatMiB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export default function MapVerticalSliceApp() {
  const nativeMapRef = useRef<ExpoAmapMapViewRef | null>(null);
  const mapProvider = useMemo(() => createNativeMapProvider(nativeMapRef), []);
  const [privacyConsentGranted, setPrivacyConsentGranted] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [markerCount, setMarkerCount] = useState<20 | 100>(20);
  const [thumbnailSources, setThumbnailSources] = useState<ThumbnailSource[]>([]);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [filterEnabled, setFilterEnabled] = useState(false);
  const [timelineProgress, setTimelineProgress] = useState(0.72);
  const [status, setStatus] = useState('等待隐私确认后初始化高德地图。');
  const [lastCamera, setLastCamera] = useState<CameraIdlePayload | null>(null);
  const [diagnostics, setDiagnostics] = useState<MapDiagnostics | null>(null);
  const [cameraEventCount, setCameraEventCount] = useState(0);
  const [activeTestCity, setActiveTestCity] = useState<keyof typeof TEST_CITIES>('北京');
  const [cityLabelContext, setCityLabelContext] = useState<OverseasCityLabelContext | null>(null);
  const cityLabelRequest = useRef(0);

  const markers = useMemo(
    () => buildMapTestMarkers(markerCount, thumbnailSources, selectedMarkerId),
    [markerCount, thumbnailSources, selectedMarkerId],
  );
  const selectedMarker = markers.find((marker) => marker.id === selectedMarkerId) ?? null;

  useEffect(() => {
    if (!mapReady) return;
    void Promise.all([
      mapProvider.setClusters({ enabled: true, gridSizeDp: 88, maxZoom: 16 }),
      mapProvider.setMarkers(markers),
    ]).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : '设置地图照片点失败。');
    });
  }, [mapProvider, mapReady, markers]);

  useEffect(() => {
    if (!mapReady) return;
    const request = ++cityLabelRequest.current;
    const labels = lastCamera
      ? selectVisibleOverseasCities(lastCamera.camera.zoom, lastCamera.bounds, cityLabelContext)
      : [];
    void mapProvider
      .setCityLabels(labels)
      .then(() => mapProvider.getDiagnostics())
      .then((nextDiagnostics) => {
        if (request === cityLabelRequest.current) setDiagnostics(nextDiagnostics);
      })
      .catch((error: unknown) => {
        if (request === cityLabelRequest.current) {
          setStatus(error instanceof Error ? error.message : '设置城市标签失败。');
        }
      });
  }, [cityLabelContext, lastCamera, mapProvider, mapReady]);

  const timelinePanResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 2,
      onPanResponderGrant: (event) => {
        setTimelineProgress(clamp(event.nativeEvent.locationX / 300, 0, 1));
      },
      onPanResponderMove: (event) => {
        setTimelineProgress(clamp(event.nativeEvent.locationX / 300, 0, 1));
      },
    }),
    [],
  );

  async function chooseThumbnailPhotos(): Promise<void> {
    if (!THUMBNAIL_SPEC) throw new Error('缺少 thumbnail 规格。');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new Error('没有获得照片访问权限。');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      allowsMultipleSelection: true,
      selectionLimit: 4,
      quality: 1,
    });
    if (result.canceled) return;

    setStatus('只生成 thumbnail；不会生成或读取 preview/original。');
    const generated: ThumbnailSource[] = [];
    for (const [index, asset] of result.assets.entries()) {
      const bytes = await createJpegPhotoVariant(
        asset.uri,
        asset.width,
        asset.height,
        THUMBNAIL_SPEC,
      );
      try {
        generated.push({
          key: `${asset.assetId ?? asset.fileName ?? 'picked'}-${index}-${Date.now()}`,
          dataUri: `data:image/jpeg;base64,${bytesToBase64(bytes)}`,
        });
      } finally {
        bytes.fill(0);
      }
    }
    setThumbnailSources(generated);
    setStatus(`已生成 ${generated.length} 张 thumbnail；preview 0，original 0。`);
  }

  function runTask(task: () => Promise<void>): void {
    void task().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : '测试操作失败。';
      setStatus(message);
      Alert.alert('地图垂直切片', message);
    });
  }

  function onCameraIdle(payload: CameraIdlePayload): void {
    setLastCamera(payload);
    setDiagnostics(payload.diagnostics);
    setCameraEventCount((count) => count + 1);
  }

  function closeMemoryDetail(): void {
    setSelectedMarkerId(null);
    setCityLabelContext((context) => context?.kind === 'memory' ? null : context);
  }

  function openMemoryDetail(markerId: string): void {
    const marker = markers.find((candidate) => candidate.id === markerId);
    setSelectedMarkerId(markerId);
    if (!marker || marker.title?.startsWith('北京')) {
      setCityLabelContext(null);
      return;
    }
    setCityLabelContext({
      kind: 'memory',
      target: { latitude: marker.latitude, longitude: marker.longitude },
    });
    runTask(() => mapProvider.animateCamera({
      latitude: marker.latitude,
      longitude: marker.longitude,
      zoom: Math.max(lastCamera?.camera.zoom ?? 10, 10.5),
    }));
  }

  function enterLocationPicker(): void {
    if (activeTestCity === '北京') {
      setCityLabelContext(null);
      setStatus('北京使用高德底图原生地名，不注入自定义城市层。');
      return;
    }
    setSelectedMarkerId(null);
    setCityLabelContext({ kind: 'location-picker', target: TEST_CITIES[activeTestCity] });
    setStatus(`${activeTestCity}地点选取：按当前视野分级显示中文城市名。`);
  }

  function moveToTestCity(city: keyof typeof TEST_CITIES): void {
    setActiveTestCity(city);
    setSelectedMarkerId(null);
    setCityLabelContext(null);
    runTask(() => mapProvider.animateCamera(TEST_CITIES[city]));
  }

  async function checkProjection(): Promise<void> {
    const tokyo = TEST_CITIES.东京;
    const screen = await mapProvider.latLngToScreen(tokyo);
    const roundTrip = await mapProvider.screenToLatLng(screen);
    setStatus(
      `东京投影 (${screen.x}, ${screen.y})，反算 ${roundTrip.latitude.toFixed(4)}, ${roundTrip.longitude.toFixed(4)}`,
    );
  }

  function onNativeError(error: NativeErrorPayload): void {
    setMapReady(false);
    setStatus(`${error.code}: ${error.message}`);
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ExpoAmapMapView
        ref={nativeMapRef}
        style={StyleSheet.absoluteFill}
        privacyConsentGranted={privacyConsentGranted}
        worldMapEnabled
        onMapReady={({ nativeEvent }) => {
          setMapReady(true);
          setStatus(`地图已就绪：SDK ${nativeEvent.sdkVersion} · ${nativeEvent.architecture}`);
        }}
        onMapPress={({ nativeEvent }) => {
          closeMemoryDetail();
          setStatus(`地图点击：${nativeEvent.latitude.toFixed(5)}, ${nativeEvent.longitude.toFixed(5)}`);
        }}
        onMarkerPress={({ nativeEvent }) => openMemoryDetail(nativeEvent.id)}
        onClusterPress={({ nativeEvent }) => {
          setStatus(`点击聚类：${nativeEvent.count} 个照片点；原生层正在放大。`);
        }}
        onCameraIdle={({ nativeEvent }) => onCameraIdle(nativeEvent)}
        onNativeError={({ nativeEvent }) => onNativeError(nativeEvent)}
      />

      <View pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.topPanel}>
          <View style={styles.titleRow}>
            <View>
              <Text style={styles.eyebrow}>AMAP NATIVE VERTICAL SLICE</Text>
              <Text style={styles.title}>所忆 · 地图架构验证</Text>
            </View>
            <Pressable
              style={[styles.smallButton, filterEnabled && styles.smallButtonActive]}
              onPress={() => setFilterEnabled((enabled) => !enabled)}
            >
              <Text style={styles.smallButtonText}>{filterEnabled ? '筛选开' : '筛选'}</Text>
            </Pressable>
          </View>
          <Text numberOfLines={2} style={styles.status}>{status}</Text>
          <View style={styles.buttonRow}>
            <Pressable
              style={[styles.chip, markerCount === 20 && styles.chipActive]}
              onPress={() => setMarkerCount(20)}
            ><Text style={styles.chipText}>20 点</Text></Pressable>
            <Pressable
              style={[styles.chip, markerCount === 100 && styles.chipActive]}
              onPress={() => setMarkerCount(100)}
            ><Text style={styles.chipText}>100 点</Text></Pressable>
            <Pressable style={styles.chip} onPress={() => runTask(chooseThumbnailPhotos)}>
              <Text style={styles.chipText}>选择缩略图</Text>
            </Pressable>
            <Pressable style={styles.chip} onPress={() => runTask(checkProjection)}>
              <Text style={styles.chipText}>投影检查</Text>
            </Pressable>
          </View>
          <View style={styles.cityRow}>
            {Object.keys(TEST_CITIES).map((city) => (
              <Pressable
                key={city}
                style={[styles.cityButton, activeTestCity === city && styles.cityButtonActive]}
                onPress={() => moveToTestCity(city as keyof typeof TEST_CITIES)}
              ><Text style={styles.cityText}>{city}</Text></Pressable>
            ))}
          </View>
          <View style={styles.contextRow}>
            <Pressable
              style={[styles.contextButton, !cityLabelContext && styles.contextButtonActive]}
              onPress={() => {
                setSelectedMarkerId(null);
                setCityLabelContext(null);
              }}
            ><Text style={styles.contextText}>普通浏览</Text></Pressable>
            <Pressable
              style={[
                styles.contextButton,
                cityLabelContext?.kind === 'location-picker' && styles.contextButtonActive,
              ]}
              onPress={enterLocationPicker}
            ><Text style={styles.contextText}>地点选取</Text></Pressable>
            <Text style={styles.contextStatus}>
              {cityLabelContext?.kind === 'memory'
                ? '海外记忆'
                : cityLabelContext?.kind === 'location-picker' ? '海外选点' : '标签关闭'}
            </Text>
          </View>
          <Text style={styles.metrics}>
            idle→JS {cameraEventCount} · native markers {diagnostics?.renderedMarkerCount ?? 0}
            {' · '}city labels {diagnostics?.renderedCityLabelCount ?? 0}
            {' · '}bitmap decode {diagnostics?.bitmapDecodeCount ?? 0}
            {' · '}bitmap {formatMiB(diagnostics?.bitmapBytes ?? 0)}
          </Text>
          {lastCamera && (
            <Text style={styles.metrics}>
              zoom {lastCamera.camera.zoom.toFixed(1)} · UI {lastCamera.frameMetrics.uiFps.toFixed(1)} fps
              {' · '}slow {lastCamera.frameMetrics.slowFrames}
              {' · '}native heap {formatMiB(lastCamera.diagnostics.nativeHeapBytes)}
            </Text>
          )}
        </View>

        <View style={styles.timelinePanel} {...timelinePanResponder.panHandlers}>
          <Text style={styles.timelineLabel}>2007</Text>
          <View style={styles.timelineTrack}>
            <View style={[styles.timelineFill, { width: `${timelineProgress * 100}%` }]} />
            <View style={[styles.timelineKnob, { left: `${timelineProgress * 100}%` }]} />
          </View>
          <Text style={styles.timelineLabel}>2026</Text>
        </View>

        {selectedMarker && (
          <View style={styles.detailCard}>
            <Text style={styles.detailEyebrow}>RN TEST DETAIL</Text>
            <Text style={styles.detailTitle}>{selectedMarker.title}</Text>
            <Text style={styles.detailText}>
              地图组件保持挂载；关闭后 Camera 不会重建。照片点只使用 thumbnail。
            </Text>
            <Pressable style={styles.closeButton} onPress={closeMemoryDetail}>
              <Text style={styles.closeButtonText}>关闭详情</Text>
            </Pressable>
          </View>
        )}

        {!privacyConsentGranted && (
          <View style={styles.consentBackdrop}>
            <View style={styles.consentCard}>
              <Text style={styles.consentTitle}>高德地图架构测试</Text>
              <Text style={styles.consentText}>
                同意后才初始化高德地图 SDK。本测试不调用高德原生逆地理编码或地点搜索。
              </Text>
              <Pressable
                style={styles.consentButton}
                onPress={() => setPrivacyConsentGranted(true)}
              >
                <Text style={styles.consentButtonText}>同意并初始化地图</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#e7e3d9' },
  overlay: { ...StyleSheet.absoluteFill },
  topPanel: {
    position: 'absolute', top: Platform.OS === 'android' ? 42 : 58, left: 12, right: 12,
    padding: 12, gap: 8, borderRadius: 18, backgroundColor: 'rgba(250,248,241,0.94)',
    borderWidth: 1, borderColor: 'rgba(92,78,61,0.22)',
  },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { fontSize: 9, letterSpacing: 1.1, fontWeight: '700', color: '#726553' },
  title: { marginTop: 2, fontSize: 19, fontWeight: '800', color: '#27231e' },
  status: { color: '#5a5145', fontSize: 12, lineHeight: 17 },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: '#e8e2d6' },
  chipActive: { backgroundColor: '#b9c9ad' },
  chipText: { color: '#342f28', fontSize: 11, fontWeight: '700' },
  smallButton: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: '#e8e2d6' },
  smallButtonActive: { backgroundColor: '#b9c9ad' },
  smallButtonText: { color: '#342f28', fontSize: 11, fontWeight: '700' },
  cityRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  cityButton: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 9, backgroundColor: '#f4f0e8' },
  cityButtonActive: { backgroundColor: '#d8dfd0' },
  cityText: { fontSize: 11, color: '#494136', fontWeight: '700' },
  contextRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  contextButton: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9, backgroundColor: '#f4f0e8' },
  contextButtonActive: { backgroundColor: '#d8dfd0' },
  contextText: { fontSize: 10, color: '#494136', fontWeight: '700' },
  contextStatus: { marginLeft: 'auto', fontSize: 10, color: '#756b5d' },
  metrics: { fontSize: 10, color: '#756b5d' },
  timelinePanel: {
    position: 'absolute', left: 18, right: 18, bottom: 24, height: 68, borderRadius: 34,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12,
    backgroundColor: 'rgba(250,250,247,0.92)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)',
  },
  timelineLabel: { fontSize: 11, color: '#5d5549', fontWeight: '700' },
  timelineTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#c9c4ba' },
  timelineFill: { height: 4, borderRadius: 2, backgroundColor: '#7b8f6c' },
  timelineKnob: {
    position: 'absolute', top: -8, width: 20, height: 20, marginLeft: -10,
    borderRadius: 10, backgroundColor: '#fdfcf8', borderWidth: 2, borderColor: '#788c69',
  },
  detailCard: {
    position: 'absolute', left: 20, right: 20, bottom: 108, padding: 18, gap: 8,
    borderRadius: 20, backgroundColor: 'rgba(251,248,239,0.98)',
    borderWidth: 1, borderColor: '#d7cec0',
  },
  detailEyebrow: { fontSize: 9, letterSpacing: 1, color: '#786b58', fontWeight: '700' },
  detailTitle: { fontSize: 22, color: '#28231d', fontWeight: '800' },
  detailText: { fontSize: 13, lineHeight: 20, color: '#5f564a' },
  closeButton: { alignSelf: 'flex-end', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, backgroundColor: '#6d7d60' },
  closeButtonText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  consentBackdrop: {
    ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center',
    padding: 24, backgroundColor: 'rgba(38,34,29,0.54)',
  },
  consentCard: { width: '100%', padding: 22, gap: 14, borderRadius: 22, backgroundColor: '#fbf8ef' },
  consentTitle: { fontSize: 22, color: '#29241e', fontWeight: '800' },
  consentText: { color: '#5f564a', fontSize: 14, lineHeight: 22 },
  consentButton: { alignItems: 'center', paddingVertical: 13, borderRadius: 14, backgroundColor: '#68785d' },
  consentButtonText: { color: '#fff', fontWeight: '800' },
});
