import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import ExpoAmapMapView from '../../modules/expo-amap-map/src/ExpoAmapMapView';
import type {
  CameraIdlePayload,
  ClusterPressPayload,
  NativeErrorPayload,
} from '../../modules/expo-amap-map/src/ExpoAmapMap.types';
import type { CameraState, MemoraeMapProps, MemoryMapMarker } from './MemoraeMap.types';
import { nativeAmapPrivacyConsentEnabled } from './mapRendererSelection';
import {
  fromNativeCameraIdle,
  fromNativeClusterPress,
  fromNativeMarkerPress,
  nativeCameraStatesEqual,
  toNativeMapCamera,
  toNativeMapMarker,
  type NativeMapMarker,
} from './nativeMapAdapterModel';
import {
  materializeNativeMapThumbnail,
  pruneNativeMapThumbnailFiles,
  resetNativeMapThumbnailFiles,
} from './nativeMapThumbnailStore';

const PRIVACY_CONSENT_GRANTED = nativeAmapPrivacyConsentEnabled(
  process.env.EXPO_PUBLIC_MEMORAE_NATIVE_AMAP_PRIVACY_CONSENT,
);

function materializeMarkers(markers: readonly MemoryMapMarker[]): NativeMapMarker[] {
  const activeCacheKeys = new Set(markers.flatMap((marker) => (
    marker.thumbnail ? [marker.thumbnail.cacheKey] : []
  )));
  pruneNativeMapThumbnailFiles(activeCacheKeys);
  return markers.map((marker) => toNativeMapMarker(marker, materializeNativeMapThumbnail));
}

export default function AndroidNativeMemoraeMapAdapter({
  markers,
  initialCamera,
  camera,
  updatesPaused = false,
  showStatus = true,
  onMarkerPress,
  onClusterPress,
  onCameraIdle,
}: MemoraeMapProps) {
  const [nativeMarkers, setNativeMarkers] = useState<NativeMapMarker[]>(() => (
    updatesPaused ? [] : materializeMarkers(markers)
  ));
  const [status, setStatus] = useState(
    PRIVACY_CONSENT_GRANTED ? '正在初始化原生地图…' : '原生地图等待隐私同意。',
  );
  const pendingMarkers = useRef<readonly MemoryMapMarker[] | null>(updatesPaused ? markers : null);
  const lastCamera = useRef<CameraState | null>(initialCamera ?? null);
  const nativeMapMountStartedAt = useRef(performance.now());

  useEffect(() => {
    if (__DEV__) console.info('[memorae-map-performance]', JSON.stringify({ event: 'home_native_map_mounted' }));
  }, []);

  useEffect(() => {
    if (updatesPaused) {
      pendingMarkers.current = markers;
      return;
    }
    const latest = pendingMarkers.current ?? markers;
    pendingMarkers.current = null;
    setNativeMarkers(materializeMarkers(latest));
  }, [markers, updatesPaused]);

  useEffect(() => () => {
    pendingMarkers.current = null;
    resetNativeMapThumbnailFiles();
  }, []);

  const cameraTarget = useMemo(() => (
    camera && !nativeCameraStatesEqual(camera, lastCamera.current)
      ? toNativeMapCamera(camera)
      : null
  ), [camera]);

  function handleCameraIdle(payload: CameraIdlePayload): void {
    const event = fromNativeCameraIdle(payload);
    lastCamera.current = event.camera;
    onCameraIdle?.(event);
  }

  function handleClusterPress(payload: ClusterPressPayload): void {
    onClusterPress?.(fromNativeClusterPress(payload));
  }

  function handleNativeError(error: NativeErrorPayload): void {
    setStatus(`${error.code}: ${error.message}`);
  }

  return (
    <View style={styles.root}>
      <ExpoAmapMapView
        style={StyleSheet.absoluteFill}
        privacyConsentGranted={PRIVACY_CONSENT_GRANTED}
        statePersistenceKey="memorae-product-map"
        worldMapEnabled
        initialCamera={initialCamera ? toNativeMapCamera(initialCamera) : undefined}
        camera={cameraTarget}
        markers={nativeMarkers}
        markerUpdatesPaused={updatesPaused}
        onMapReady={({ nativeEvent }) => {
          if (__DEV__) {
            console.info('[memorae-map-performance]', JSON.stringify({
              event: 'home_amap_ready',
              homeToReadyMs: Math.round(performance.now() - nativeMapMountStartedAt.current),
              mapViewCreateMs: nativeEvent.mapViewCreateMs,
              mapReadyMs: nativeEvent.mapReadyMs,
              firstVisibleFrameMs: nativeEvent.firstVisibleFrameMs,
            }));
          }
          setStatus('原生地图已就绪');
        }}
        onMarkerPress={({ nativeEvent }) => onMarkerPress?.(fromNativeMarkerPress(nativeEvent.id))}
        onClusterPress={({ nativeEvent }) => handleClusterPress(nativeEvent)}
        onCameraIdle={({ nativeEvent }) => handleCameraIdle(nativeEvent)}
        onNativeError={({ nativeEvent }) => handleNativeError(nativeEvent)}
      />
      {showStatus && (
        <View pointerEvents="none" style={styles.status}>
          <Text style={styles.statusText}>{status}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#20231f' },
  status: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 12,
    alignItems: 'center',
  },
  statusText: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(20,22,20,0.62)',
    color: '#f5f3ed',
    fontSize: 11,
  },
});
