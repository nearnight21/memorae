import { requireNativeView } from 'expo';
import * as React from 'react';

import type {
  ExpoAmapMapViewProps,
  ExpoAmapMapViewRef,
} from './ExpoAmapMap.types';

type NativeProps = ExpoAmapMapViewProps & React.RefAttributes<ExpoAmapMapViewRef>;

const NativeView: React.ComponentType<NativeProps> = requireNativeView('ExpoAmapMap');

const ExpoAmapMapView = React.forwardRef<ExpoAmapMapViewRef, ExpoAmapMapViewProps>(
  function ExpoAmapMapView(props, ref) {
    return <NativeView {...props} ref={ref} />;
  },
);

export default ExpoAmapMapView;
