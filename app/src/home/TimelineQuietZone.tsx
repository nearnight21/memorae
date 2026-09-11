import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

const TIMELINE_QUIET_ZONE_SCREEN_RATIO = 0.3;

export default function TimelineQuietZone() {
  const { width, height } = useWindowDimensions();
  const zoneHeight = Math.round(height * TIMELINE_QUIET_ZONE_SCREEN_RATIO);

  return (
    <View pointerEvents="none" style={[styles.root, { height: zoneHeight }]}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Rect height={zoneHeight} width={width} x={0} y={0}>
          <LinearGradient
            colors={[
              'rgba(231,242,252,0)',
              'rgba(231,242,252,0.12)',
              'rgba(231,242,252,0.48)',
              'rgba(231,242,252,0.76)',
              'rgba(231,242,252,0.56)',
            ]}
            end={vec(0, zoneHeight)}
            positions={[0, 0.24, 0.58, 0.86, 1]}
            start={vec(0, 0)}
          />
        </Rect>
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 3,
  },
});
