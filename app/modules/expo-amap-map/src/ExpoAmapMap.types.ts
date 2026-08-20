import type { StyleProp, ViewStyle } from 'react-native';

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface MapCamera extends LatLng {
  zoom: number;
}

export interface MapBounds {
  northEast: LatLng;
  southWest: LatLng;
}

export interface PhotoMapMarker extends LatLng {
  id: string;
  title?: string;
  thumbnailKey?: string;
  thumbnailDataUri?: string;
  selected?: boolean;
}

export interface ClusterConfig {
  enabled: boolean;
  gridSizeDp: number;
  maxZoom: number;
}

export interface MapDiagnostics {
  inputMarkerCount: number;
  renderedMarkerCount: number;
  bitmapDecodeCount: number;
  bitmapBytes: number;
  nativeHeapBytes: number;
  runtimeUsedMemoryBytes: number;
  cameraIdleCount: number;
}

export interface FrameMetrics {
  durationMs: number;
  uiFps: number;
  slowFrames: number;
}

export interface CameraIdlePayload {
  camera: MapCamera;
  bounds: MapBounds;
  frameMetrics: FrameMetrics;
  diagnostics: MapDiagnostics;
}

export interface MapReadyPayload {
  sdkVersion: string;
  worldMapRequested: boolean;
  architecture: string;
}

export interface MarkerPressPayload {
  id: string;
}

export interface ClusterPressPayload extends LatLng {
  ids: string[];
  count: number;
}

export interface NativeErrorPayload {
  code: string;
  message: string;
}

export interface ExpoAmapMapViewRef {
  moveCamera(camera: MapCamera): Promise<void>;
  animateCamera(camera: MapCamera): Promise<void>;
  setMarkers(markers: PhotoMapMarker[]): Promise<void>;
  setClusters(config: ClusterConfig): Promise<void>;
  latLngToScreen(coordinate: LatLng): Promise<ScreenPoint>;
  screenToLatLng(point: ScreenPoint): Promise<LatLng>;
  getDiagnostics(): Promise<MapDiagnostics>;
}

type NativeEvent<T> = { nativeEvent: T };

export interface ExpoAmapMapViewProps {
  privacyConsentGranted: boolean;
  worldMapEnabled?: boolean;
  onMapReady?: (event: NativeEvent<MapReadyPayload>) => void;
  onMapPress?: (event: NativeEvent<LatLng>) => void;
  onMarkerPress?: (event: NativeEvent<MarkerPressPayload>) => void;
  onClusterPress?: (event: NativeEvent<ClusterPressPayload>) => void;
  onCameraIdle?: (event: NativeEvent<CameraIdlePayload>) => void;
  onNativeError?: (event: NativeEvent<NativeErrorPayload>) => void;
  style?: StyleProp<ViewStyle>;
}
