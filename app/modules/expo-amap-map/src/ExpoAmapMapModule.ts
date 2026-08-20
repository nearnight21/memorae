import { NativeModule, requireNativeModule } from 'expo';

declare class ExpoAmapMapModule extends NativeModule<{}> {}

export default requireNativeModule<ExpoAmapMapModule>('ExpoAmapMap');
