declare module 'react-native-zoom-toolkit/lib/module/components/resumable/ResumableZoom' {
  import type React from 'react';
  import type { ResumableZoomProps, ResumableZoomRefType } from 'react-native-zoom-toolkit';

  const ResumableZoom: React.ForwardRefExoticComponent<
    React.PropsWithoutRef<ResumableZoomProps> & React.RefAttributes<ResumableZoomRefType>
  >;

  export default ResumableZoom;
}
