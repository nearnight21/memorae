import { Platform } from 'react-native';

import AndroidNativeMemoraeMapAdapter from './AndroidNativeMemoraeMapAdapter';
import WebViewMemoraeMapAdapter from './WebViewMemoraeMapAdapter';
import type { MemoraeMapProps } from './MemoraeMap.types';
import { selectMemoraeMapRenderer } from './mapRendererSelection';

const renderer = selectMemoraeMapRenderer(
  Platform.OS,
  process.env.EXPO_PUBLIC_MEMORAE_MAP_RENDERER,
);

export default function MemoraeMap(props: MemoraeMapProps) {
  if (renderer === 'native-amap') {
    return <AndroidNativeMemoraeMapAdapter {...props} />;
  }
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
