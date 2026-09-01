import type { MemoraeMapProps } from './MemoraeMap.types';
import WebViewMemoraeMapAdapter from './WebViewMemoraeMapAdapter';

// Metro resolves the Android implementation from the sibling .android.tsx file.
// Other platforms retain the WebView renderer until their native adapters exist.
export default function AndroidNativeMemoraeMapAdapter(props: MemoraeMapProps) {
  return <WebViewMemoraeMapAdapter {...props} />;
}
