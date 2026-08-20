import type { MutableRefObject } from 'react';

import type {
  ClusterConfig,
  ExpoAmapMapViewRef,
  LatLng,
  MapCamera,
  MapDiagnostics,
  PhotoMapMarker,
  ScreenPoint,
} from '../../modules/expo-amap-map/src/ExpoAmapMap.types';

export interface MapProvider {
  moveCamera(camera: MapCamera): Promise<void>;
  animateCamera(camera: MapCamera): Promise<void>;
  setMarkers(markers: PhotoMapMarker[]): Promise<void>;
  setClusters(config: ClusterConfig): Promise<void>;
  latLngToScreen(coordinate: LatLng): Promise<ScreenPoint>;
  screenToLatLng(point: ScreenPoint): Promise<LatLng>;
  getDiagnostics(): Promise<MapDiagnostics>;
}

export function createNativeMapProvider(
  nativeViewRef: MutableRefObject<ExpoAmapMapViewRef | null>,
): MapProvider {
  function current(): ExpoAmapMapViewRef {
    if (!nativeViewRef.current) throw new Error('高德地图尚未就绪。');
    return nativeViewRef.current;
  }

  return {
    moveCamera: (camera) => current().moveCamera(camera),
    animateCamera: (camera) => current().animateCamera(camera),
    setMarkers: (markers) => current().setMarkers(markers),
    setClusters: (config) => current().setClusters(config),
    latLngToScreen: (coordinate) => current().latLngToScreen(coordinate),
    screenToLatLng: (point) => current().screenToLatLng(point),
    getDiagnostics: () => current().getDiagnostics(),
  };
}
