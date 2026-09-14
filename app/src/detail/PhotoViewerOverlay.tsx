import { useRef, useState } from 'react';
import {
  Image,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import ResumableZoom from 'react-native-zoom-toolkit/lib/module/components/resumable/ResumableZoom';
import type { ResumableZoomRefType } from 'react-native-zoom-toolkit';
import { useAppTopInset } from '../ui/layout';

interface Props {
  previewUri: string;
  originalUri: string | null;
  onClose: () => void;
}

export default function PhotoViewerOverlay({ previewUri, originalUri, onClose }: Props) {
  const topInset = useAppTopInset();
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
  const onTap = () => {
    if ((zoomRef.current?.getState().scale ?? 1) <= 1.01) {
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="返回详情"
        onPress={onClose}
        style={[styles.backButton, { top: topInset + 12 }]}
      >
        <Text style={styles.backText}>‹</Text>
      </Pressable>
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
  backButton: {
    position: 'absolute',
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(30, 26, 22, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  backText: {
    color: '#FAF6EE',
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '300',
    marginTop: -2,
  },
});
