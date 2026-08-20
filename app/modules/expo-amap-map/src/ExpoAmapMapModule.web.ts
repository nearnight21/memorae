import { registerWebModule, NativeModule } from 'expo';

// ExpoAmapMapModule is not available on the web platform.
class ExpoAmapMapModule extends NativeModule<{}> {}

export default registerWebModule(ExpoAmapMapModule, 'ExpoAmapMapModule');
