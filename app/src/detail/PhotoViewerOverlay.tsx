import { useRef, useState } from 'react';
import {
  Image,
  type LayoutChangeEvent,
  StyleSheet,
  View,
} from 'react-native';
import ResumableZoom from 'react-native-zoom-toolkit/lib/module/components/resumable/ResumableZoom';
import type { ResumableZoomRefType, TapGestureEvent } from 'react-native-zoom-toolkit';

interface Props {
  previewUri: string;
  originalUri: string | null;
  onClose: () => void;
}

export default function PhotoViewerOverlay({ previewUri, originalUri, onClose }: Props) {
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [loadedOriginalUri, setLoadedOriginalUri] = useState<string | null>(null);
  const previewSize = useRef({ width: 0, height: 0 });
  const zoomRef = useRef<ResumableZoomRefType | null>(null);

  const onCanvasLayout = (event: LayoutChangeEvent) => {
    setCanvasSize({
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height,
    });
  };
  const onPreviewLoad = (event: { nativeEvent: { source: { width: number; height: number } } }) => {
    previewSize.current = event.nativeEvent.source;
  };
  const onTap = (event: TapGestureEvent) => {
    if ((zoomRef.current?.getState().scale ?? 1) > 1.01) return;
    const { width: canvasWidth, height: canvasHeight } = canvasSize;
    const { width: imageWidth, height: imageHeight } = previewSize.current;
    if (canvasWidth <= 0 || canvasHeight <= 0 || imageWidth <= 0 || imageHeight <= 0) return;
    const fit = Math.min(canvasWidth / imageWidth, canvasHeight / imageHeight);
    const fittedWidth = imageWidth * fit;
    const fittedHeight = imageHeight * fit;
    const left = (canvasWidth - fittedWidth) / 2;
    const top = (canvasHeight - fittedHeight) / 2;
    if (event.x < left || event.x > left + fittedWidth || event.y < top || event.y > top + fittedHeight) {
      onClose();
    }
  };

  return (
    <View style={styles.root} accessibilityViewIsModal>
      <View style={styles.canvas} onLayout={onCanvasLayout}>
        {canvasSize.width > 0 && canvasSize.height > 0 && (
          <ResumableZoom
            ref={zoomRef}
            style={styles.zoom}
            minScale={1}
            maxScale={4}
            panMode="clamp"
            scaleMode="clamp"
            pinchMode="clamp"
            decay={false}
            allowPinchPanning
            onTap={onTap}
          >
            <View style={{ width: canvasSize.width, height: canvasSize.height }}>
              <Image source={{ uri: previewUri }} style={styles.image} resizeMode="contain" onLoad={onPreviewLoad} />
              {originalUri && (
                <Image
                  source={{ uri: originalUri }}
                  style={[
                    styles.image,
                    styles.originalImage,
                    loadedOriginalUri === originalUri && styles.originalVisible,
                  ]}
                  resizeMode="contain"
                  onLoad={() => setLoadedOriginalUri(originalUri)}
                />
              )}
            </View>
          </ResumableZoom>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
    elevation: 100,
    backgroundColor: '#000',
  },
  canvas: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  zoom: { flex: 1 },
  image: {
    width: '100%',
    height: '100%',
  },
  originalImage: {
    ...StyleSheet.absoluteFill,
    opacity: 0,
  },
  originalVisible: { opacity: 1 },
});
