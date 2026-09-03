import React from 'react';
import { registerRootComponent } from 'expo';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import App from './App';
import MapVerticalSliceApp from './src/map/MapVerticalSliceApp';
import AmapJsWebViewSliceApp from './src/map/AmapJsWebViewSliceApp';
import { ArcTimelinePrototypeScreen } from './src/testing/ArcTimelinePrototypeScreen';

// Vertical slices remain available during development, while release/standalone
// builds always enter the account and private-space flow.
const RootComponent = __DEV__ && process.env.EXPO_PUBLIC_TIMELINE_PROTOTYPE === '1'
  ? ArcTimelinePrototypeScreen
  : __DEV__ && process.env.EXPO_PUBLIC_AMAP_WEBVIEW_SLICE === '1'
  ? AmapJsWebViewSliceApp
  : __DEV__ && process.env.EXPO_PUBLIC_AMAP_VERTICAL_SLICE === '1'
  ? MapVerticalSliceApp
  : App;

function ApplicationRoot() {
  return React.createElement(
    GestureHandlerRootView,
    { style: { flex: 1 } },
    React.createElement(
      SafeAreaProvider,
      null,
      React.createElement(RootComponent),
    ),
  );
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(ApplicationRoot);
