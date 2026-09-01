export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface CameraState extends Coordinate {
  zoom: number;
}

export interface MapBounds {
  northEast: Coordinate;
  southWest: Coordinate;
}

export interface MapCameraIdleEvent {
  camera: CameraState;
  bounds?: MapBounds;
}

export interface MemoryMapThumbnail {
  uri: string;
  cacheKey: string;
}

export interface MemoryMapRegion {
  country?: string;
  province?: string;
  city?: string;
}

export interface MemoryMapMarker {
  id: string;
  latitude: number;
  longitude: number;
  thumbnail?: MemoryMapThumbnail;
  region?: MemoryMapRegion;
}

export interface MapMarkerPressEvent {
  markerId: string;
}

export interface MapClusterPressEvent {
  markerIds: readonly string[];
  count: number;
  coordinate: Coordinate;
  label?: string;
}

export interface MemoraeMapProps {
  markers: readonly MemoryMapMarker[];
  initialCamera?: CameraState;
  camera?: CameraState | null;
  updatesPaused?: boolean;
  showStatus?: boolean;
  onMarkerPress?: (event: MapMarkerPressEvent) => void;
  onClusterPress?: (event: MapClusterPressEvent) => void;
  onCameraIdle?: (event: MapCameraIdleEvent) => void;
}
