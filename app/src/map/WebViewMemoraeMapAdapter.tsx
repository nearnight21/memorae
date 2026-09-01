import { useEffect, useMemo, useRef, useState } from 'react';
import AmapJsWebViewMap, { type AmapWebViewMarker } from './AmapJsWebViewMap';
import type { CameraState, MemoraeMapProps } from './MemoraeMap.types';
import { resolveMapThumbnail } from './mapThumbnailCache';
import {
  cameraStatesEqual,
  fromWebViewCamera,
  toClusterPressEvent,
  toMarkerPressEvent,
  toWebViewCamera,
  toWebViewMarker,
} from './webViewMapAdapterModel';

export default function WebViewMemoraeMapAdapter({
  markers,
  initialCamera,
  camera,
  updatesPaused = false,
  showStatus = true,
  onMarkerPress,
  onClusterPress,
  onCameraIdle,
}: MemoraeMapProps) {
  const [webViewMarkers, setWebViewMarkers] = useState<AmapWebViewMarker[]>(
    () => markers.map((marker) => toWebViewMarker(marker)),
  );
  const thumbnailCache = useRef(new Map<string, { uri: string; dataUri: string }>());
  const lastCamera = useRef<CameraState | null>(initialCamera ?? null);

  useEffect(() => {
    const liveCacheKeys = new Set(markers.flatMap((marker) => (
      marker.thumbnail ? [marker.thumbnail.cacheKey] : []
    )));
    for (const key of thumbnailCache.current.keys()) {
      if (!liveCacheKeys.has(key)) thumbnailCache.current.delete(key);
    }

    setWebViewMarkers(markers.map((marker) => {
      const thumbnail = marker.thumbnail;
      if (!thumbnail) return toWebViewMarker(marker);
      const cached = thumbnailCache.current.get(thumbnail.cacheKey);
      if (cached?.uri === thumbnail.uri) return toWebViewMarker(marker, cached.dataUri);
      const dataUri = resolveMapThumbnail(thumbnail);
      if (!dataUri) return toWebViewMarker(marker);
      thumbnailCache.current.set(thumbnail.cacheKey, { uri: thumbnail.uri, dataUri });
      return toWebViewMarker(marker, dataUri);
    }));
  }, [markers]);

  useEffect(() => () => thumbnailCache.current.clear(), []);

  const cameraTarget = useMemo(() => (
    camera && !cameraStatesEqual(camera, lastCamera.current)
      ? toWebViewCamera(camera)
      : null
  ), [camera]);

  return (
    <AmapJsWebViewMap
      markers={webViewMarkers}
      initialCamera={initialCamera ? toWebViewCamera(initialCamera) : undefined}
      cameraTarget={cameraTarget}
      markerUpdatesPaused={updatesPaused}
      showStatus={showStatus}
      onMarkerPressed={(markerId) => onMarkerPress?.(toMarkerPressEvent(markerId))}
      onClusterPressed={(cluster) => onClusterPress?.(toClusterPressEvent(cluster))}
      onCameraIdle={(nextCamera) => {
        const event = fromWebViewCamera(nextCamera, lastCamera.current ?? initialCamera);
        lastCamera.current = event.camera;
        onCameraIdle?.(event);
      }}
    />
  );
}
