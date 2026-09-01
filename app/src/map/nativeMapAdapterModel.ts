import type {
  CameraState,
  MapCameraIdleEvent,
  MapClusterPressEvent,
  MapMarkerPressEvent,
  MemoryMapMarker,
} from './MemoraeMap.types';

export interface NativeMapMarker {
  id: string;
  latitude: number;
  longitude: number;
  thumbnailKey?: string;
  thumbnailUri?: string;
  country?: string;
  province?: string;
  city?: string;
  selected?: boolean;
}

export interface NativeMapCamera {
  latitude: number;
  longitude: number;
  zoom: number;
}

export interface NativeCameraIdlePayload {
  camera: NativeMapCamera;
  bounds?: {
    northEast: { latitude: number; longitude: number };
    southWest: { latitude: number; longitude: number };
  };
}

export interface NativeClusterPressPayload {
  ids: string[];
  count: number;
  latitude: number;
  longitude: number;
  label?: string;
}

export interface NativeMarkerDiff {
  added: string[];
  removed: string[];
  coordinateUpdated: string[];
  thumbnailUpdated: string[];
  selectedUpdated: string[];
  unchanged: string[];
}

const COORDINATE_EPSILON = 0.000001;
const ZOOM_EPSILON = 0.001;

export function nativeCameraStatesEqual(
  left: CameraState | null | undefined,
  right: CameraState | null | undefined,
): boolean {
  if (!left || !right) return left === right;
  return Math.abs(left.latitude - right.latitude) < COORDINATE_EPSILON
    && Math.abs(left.longitude - right.longitude) < COORDINATE_EPSILON
    && Math.abs(left.zoom - right.zoom) < ZOOM_EPSILON;
}

export function isNativeThumbnailUri(uri: string | undefined): boolean {
  return typeof uri === 'string' && /^file:\/\//i.test(uri);
}

export function toNativeMapMarker(
  marker: MemoryMapMarker,
  resolveThumbnailUri: (marker: MemoryMapMarker) => string | undefined = () => undefined,
): NativeMapMarker {
  const thumbnailUri = resolveThumbnailUri(marker);
  return {
    id: marker.id,
    latitude: marker.latitude,
    longitude: marker.longitude,
    ...(marker.thumbnail ? { thumbnailKey: marker.thumbnail.cacheKey } : {}),
    ...(isNativeThumbnailUri(thumbnailUri) ? { thumbnailUri } : {}),
    ...(marker.region?.country ? { country: marker.region.country } : {}),
    ...(marker.region?.province ? { province: marker.region.province } : {}),
    ...(marker.region?.city ? { city: marker.region.city } : {}),
  };
}

export function toNativeMapCamera(camera: CameraState): NativeMapCamera {
  return { ...camera };
}

export function fromNativeCameraIdle(
  payload: NativeCameraIdlePayload,
): MapCameraIdleEvent {
  return {
    camera: { ...payload.camera },
    ...(payload.bounds ? {
      bounds: {
        northEast: { ...payload.bounds.northEast },
        southWest: { ...payload.bounds.southWest },
      },
    } : {}),
  };
}

export function fromNativeMarkerPress(id: string): MapMarkerPressEvent {
  return { markerId: id };
}

export function fromNativeClusterPress(
  payload: NativeClusterPressPayload,
): MapClusterPressEvent {
  return {
    markerIds: payload.ids,
    count: payload.count,
    coordinate: {
      latitude: payload.latitude,
      longitude: payload.longitude,
    },
    ...(payload.label ? { label: payload.label } : {}),
  };
}

export function diffNativeMarkers(
  current: readonly NativeMapMarker[],
  next: readonly NativeMapMarker[],
): NativeMarkerDiff {
  const currentById = new Map(current.map((marker) => [marker.id, marker]));
  const nextById = new Map(next.map((marker) => [marker.id, marker]));
  const diff: NativeMarkerDiff = {
    added: [],
    removed: [],
    coordinateUpdated: [],
    thumbnailUpdated: [],
    selectedUpdated: [],
    unchanged: [],
  };

  for (const id of currentById.keys()) {
    if (!nextById.has(id)) diff.removed.push(id);
  }
  for (const [id, marker] of nextById) {
    const existing = currentById.get(id);
    if (!existing) {
      diff.added.push(id);
      continue;
    }
    let changed = false;
    if (
      Math.abs(existing.latitude - marker.latitude) >= COORDINATE_EPSILON
      || Math.abs(existing.longitude - marker.longitude) >= COORDINATE_EPSILON
    ) {
      diff.coordinateUpdated.push(id);
      changed = true;
    }
    if (
      existing.thumbnailKey !== marker.thumbnailKey
      || existing.thumbnailUri !== marker.thumbnailUri
    ) {
      diff.thumbnailUpdated.push(id);
      changed = true;
    }
    if (existing.selected !== marker.selected) {
      diff.selectedUpdated.push(id);
      changed = true;
    }
    if (!changed) diff.unchanged.push(id);
  }
  return diff;
}

export function selectMarkersForUpdate<T>(
  applied: readonly T[],
  incoming: readonly T[],
  updatesPaused: boolean,
): { applied: readonly T[]; pending: readonly T[] | null } {
  return updatesPaused
    ? { applied, pending: incoming }
    : { applied: incoming, pending: null };
}
