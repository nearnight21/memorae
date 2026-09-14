import WebViewMemoraeMapAdapter from './WebViewMemoraeMapAdapter';
import type { MemoraeMapProps } from './MemoraeMap.types';

export default function MemoraeMap(props: MemoraeMapProps) {
  return <WebViewMemoraeMapAdapter {...props} />;
}

export type {
  CameraState,
  Coordinate,
  MapBounds,
  MapCameraIdleEvent,
  MapClusterPressEvent,
  MapMarkerPressEvent,
  MemoraeMapProps,
  MemoryMapMarker,
  MemoryMapRegion,
  MemoryMapThumbnail,
} from './MemoraeMap.types';
