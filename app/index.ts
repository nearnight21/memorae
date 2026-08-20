import { registerRootComponent } from 'expo';

import App from './App';
import MapVerticalSliceApp from './src/map/MapVerticalSliceApp';

const RootComponent = process.env.EXPO_PUBLIC_AMAP_VERTICAL_SLICE === '1'
  ? MapVerticalSliceApp
  : App;

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(RootComponent);
