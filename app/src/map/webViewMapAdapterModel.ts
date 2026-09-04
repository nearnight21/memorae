import type {
  CameraState,
  MapBounds,
  MapCameraIdleEvent,
  MapClusterPressEvent,
  MapMarkerPressEvent,
  MemoryMapMarker,
} from './MemoraeMap.types';
import type {
  AmapMapBounds,
  AmapMapCamera,
  AmapMapClusterPress,
  AmapWebViewMarker,
} from './AmapJsWebViewMap';

const COORDINATE_EPSILON = 0.000001;
const ZOOM_EPSILON = 0.001;
const DEFAULT_ZOOM = 5;

export function cameraStatesEqual(
  left: CameraState | null | undefined,
  right: CameraState | null | undefined,
): boolean {
  if (!left || !right) return left === right;
  return Math.abs(left.latitude - right.latitude) < COORDINATE_EPSILON
    && Math.abs(left.longitude - right.longitude) < COORDINATE_EPSILON
    && Math.abs(left.zoom - right.zoom) < ZOOM_EPSILON;
}

export function toWebViewCamera(camera: CameraState): AmapMapCamera {
  return {
    lat: camera.latitude,
    lng: camera.longitude,
    zoom: camera.zoom,
  };
}

function fromWebViewBounds(bounds: AmapMapBounds): MapBounds {
  return {
    northEast: { latitude: bounds.north, longitude: bounds.east },
    southWest: { latitude: bounds.south, longitude: bounds.west },
  };
}

export function fromWebViewCamera(
  camera: AmapMapCamera,
  fallback?: CameraState | null,
): MapCameraIdleEvent {
  return {
    camera: {
      latitude: camera.lat,
      longitude: camera.lng,
      zoom: Number.isFinite(camera.zoom) ? camera.zoom! : fallback?.zoom ?? DEFAULT_ZOOM,
    },
    ...(camera.bounds ? { bounds: fromWebViewBounds(camera.bounds) } : {}),
  };
}

export function toWebViewMarker(
  marker: MemoryMapMarker,
  thumbnailRef?: string,
): AmapWebViewMarker {
  return {
    id: marker.id,
    lat: marker.latitude,
    lng: marker.longitude,
    ...(thumbnailRef ? { thumbnailRef } : {}),
    ...(marker.region?.country ? { country: marker.region.country } : {}),
    ...(marker.region?.province ? { province: marker.region.province } : {}),
    ...(marker.region?.city ? { city: marker.region.city } : {}),
  };
}

export function toMarkerPressEvent(markerId: string): MapMarkerPressEvent {
  return { markerId };
}

export function toClusterPressEvent(cluster: AmapMapClusterPress): MapClusterPressEvent {
  return {
    markerIds: cluster.ids,
    count: cluster.count,
    coordinate: { latitude: cluster.lat, longitude: cluster.lng },
    ...(cluster.label ? { label: cluster.label } : {}),
  };
}
