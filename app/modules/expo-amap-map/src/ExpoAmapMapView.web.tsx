import * as React from 'react';

import type {
  ExpoAmapMapViewProps,
  ExpoAmapMapViewRef,
} from './ExpoAmapMap.types';

const ExpoAmapMapView = React.forwardRef<ExpoAmapMapViewRef, ExpoAmapMapViewProps>(
  function ExpoAmapMapView() {
    throw new Error('高德 Native Map 垂直切片仅支持 Android Development/Release Build。');
  },
);

export default ExpoAmapMapView;
