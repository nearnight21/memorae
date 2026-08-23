import { registerRootComponent } from 'expo';

import App from './App';
import MapVerticalSliceApp from './src/map/MapVerticalSliceApp';
import AmapJsWebViewSliceApp from './src/map/AmapJsWebViewSliceApp';

// Vertical slices remain available during development, while release/standalone
// builds always enter the account and private-space flow.
const RootComponent = __DEV__ && process.env.EXPO_PUBLIC_AMAP_WEBVIEW_SLICE === '1'
  ? AmapJsWebViewSliceApp
  : __DEV__ && process.env.EXPO_PUBLIC_AMAP_VERTICAL_SLICE === '1'
  ? MapVerticalSliceApp
  : App;

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(RootComponent);
