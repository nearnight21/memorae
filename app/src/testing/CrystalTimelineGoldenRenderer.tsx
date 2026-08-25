import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  BlurMask,
  Canvas,
  Group,
  LinearGradient,
  Path,
  Rect,
  RoundedRect,
  vec,
} from '@shopify/react-native-skia';
import {
  generateCrystalPath,
  generateSurfaceArcPath,
  insetCrystalGeometry,
} from './crystalTimelineGoldenGeometry';
import type {
  GoldenCrystalGeometry,
  GoldenCrystalLighting,
  GoldenCrystalPreset,
  GoldenLayerKey,
  GoldenLayerState,
} from './crystalTimelineGoldenPreset';

interface Props {
  width: number;
  height: number;
  preset: GoldenCrystalPreset;
  geometry: GoldenCrystalGeometry;
  lighting: GoldenCrystalLighting;
  layers: GoldenLayerState;
}

function visibleOpacity(layers: GoldenLayerState, key: GoldenLayerKey): number {
  return layers[key].enabled ? layers[key].opacity : 0;
}

export function CrystalTimelineGoldenRenderer({
  width,
  height,
  preset,
  geometry,
  lighting,
  layers,
}: Props) {
  const scale = width / preset.referenceViewport.width;
  const centerX = width / 2;
  const centerY = height * preset.track.centerYRatio;
  const scaledGeometry = useMemo<GoldenCrystalGeometry>(() => ({
    ...geometry,
    width: geometry.width * scale,
    height: geometry.height * scale,
    leftBulge: geometry.leftBulge * scale,
    rightBulge: geometry.rightBulge * scale,
    verticalAsymmetry: geometry.verticalAsymmetry * scale,
  }), [geometry, scale]);
  const outline = useMemo(() => generateCrystalPath({
    ...scaledGeometry,
    centerX,
    centerY,
  }), [centerX, centerY, scaledGeometry]);
  const innerOutline = useMemo(() => generateCrystalPath({
    ...insetCrystalGeometry(scaledGeometry, 2.8 * scale),
    centerX: centerX + 0.15 * scale,
    centerY: centerY + 0.35 * scale,
  }), [centerX, centerY, scale, scaledGeometry]);
  const softHighlight = useMemo(() => generateSurfaceArcPath(
    centerX - 1.6 * scale,
    centerY,
    scaledGeometry.width * 0.62,
    lighting.softHighlightY * scale,
    2.2 * scale,
  ), [centerX, centerY, lighting.softHighlightY, scale, scaledGeometry.width]);
  const specularHighlight = useMemo(() => generateSurfaceArcPath(
    centerX - 5.4 * scale,
    centerY,
    scaledGeometry.width * 0.38,
    lighting.specularY * scale,
    1.1 * scale,
  ), [centerX, centerY, lighting.specularY, scale, scaledGeometry.width]);
  const lowerShade = useMemo(() => generateSurfaceArcPath(
    centerX + 0.8 * scale,
    centerY,
    scaledGeometry.width * 0.72,
    lighting.lowerShadeY * scale,
    -1.5 * scale,
  ), [centerX, centerY, lighting.lowerShadeY, scale, scaledGeometry.width]);
  const trackHeight = preset.track.glassHeight * scale;
  const trackTop = centerY - trackHeight / 2;
  const lineWidth = preset.track.lineWidth * scale;
  const tickHeight = preset.track.tickHeight * scale;

  return (
    <View
      accessibilityLabel="Crystal Timeline Golden Frame Render"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    >
      <Canvas style={StyleSheet.absoluteFill}>
        <Group opacity={visibleOpacity(layers, 'track')}>
          <RoundedRect
            x={-12 * scale}
            y={trackTop}
            width={width + 24 * scale}
            height={trackHeight}
            r={trackHeight / 2}
          >
            <LinearGradient
              start={vec(0, trackTop)}
              end={vec(0, trackTop + trackHeight)}
              colors={[
                'rgba(255,255,252,0.19)',
                'rgba(255,250,241,0.07)',
                'rgba(220,186,142,0.025)',
                'rgba(138,97,57,0.035)',
              ]}
              positions={[0, 0.32, 0.7, 1]}
            />
          </RoundedRect>
          <Rect
            x={-12 * scale}
            y={trackTop + 0.45 * scale}
            width={width + 24 * scale}
            height={0.5 * scale}
            color="rgba(255,255,255,0.38)"
          />
          <Rect
            x={-12 * scale}
            y={trackTop + trackHeight - 0.85 * scale}
            width={width + 24 * scale}
            height={0.45 * scale}
            color="rgba(171,117,68,0.13)"
          />
          <Rect
            x={-12 * scale}
            y={centerY - lineWidth / 2}
            width={width + 24 * scale}
            height={lineWidth}
            color="rgba(157,88,20,0.92)"
          />
        </Group>

        <Group opacity={visibleOpacity(layers, 'ticks')}>
          {preset.yearOffsets.map((offset, index) => index === 3 ? null : (
            <Rect
              key={preset.years[index]}
              x={centerX + offset * scale - preset.track.tickWidth * scale / 2}
              y={centerY - tickHeight / 2}
              width={preset.track.tickWidth * scale}
              height={tickHeight}
              color="rgba(143,77,17,0.86)"
            />
          ))}
        </Group>

        <Group opacity={visibleOpacity(layers, 'body')} clip={outline}>
          <Path path={outline}>
            <LinearGradient
              start={vec(centerX - scaledGeometry.width / 2, centerY - scaledGeometry.height / 2)}
              end={vec(centerX + scaledGeometry.width / 2, centerY + scaledGeometry.height / 2)}
              colors={[
                'rgba(255,255,252,0.46)',
                'rgba(255,251,243,0.13)',
                'rgba(230,197,153,0.035)',
                'rgba(255,247,231,0.18)',
              ]}
              positions={[0, 0.36, 0.69, 1]}
            />
          </Path>
          <Rect
            x={centerX - scaledGeometry.width / 2}
            y={centerY - trackHeight * 0.48}
            width={scaledGeometry.width}
            height={trackHeight * 0.96}
          >
            <LinearGradient
              start={vec(centerX, centerY - trackHeight / 2)}
              end={vec(centerX, centerY + trackHeight / 2)}
              colors={['rgba(255,255,255,0.12)', 'rgba(214,169,112,0.035)', 'rgba(255,255,255,0.08)']}
              positions={[0, 0.55, 1]}
            />
          </Rect>
        </Group>

        <Group opacity={visibleOpacity(layers, 'outerRim')}>
          <Path
            path={outline}
            color="rgba(102,72,49,0.3)"
            style="stroke"
            strokeWidth={0.72 * scale}
          />
          <Path
            path={outline}
            color="rgba(255,255,252,0.62)"
            style="stroke"
            strokeWidth={1.45 * scale}
          >
            <BlurMask blur={0.65 * scale} style="normal" />
          </Path>
        </Group>

        <Group opacity={visibleOpacity(layers, 'innerRim')}>
          <Path
            path={innerOutline}
            color="rgba(248,235,216,0.84)"
            style="stroke"
            strokeWidth={0.58 * scale}
          />
        </Group>

        <Group opacity={visibleOpacity(layers, 'softHighlight')} clip={outline}>
          <Path
            path={softHighlight}
            color="rgba(255,255,255,0.82)"
            style="stroke"
            strokeWidth={3.1 * scale}
            strokeCap="round"
          >
            <BlurMask blur={lighting.softHighlightBlur * scale} style="normal" />
          </Path>
        </Group>

        <Group opacity={visibleOpacity(layers, 'specularHighlight')} clip={outline}>
          <Path
            path={specularHighlight}
            color="rgba(255,255,255,0.94)"
            style="stroke"
            strokeWidth={0.78 * scale}
            strokeCap="round"
          />
        </Group>

        <Group opacity={visibleOpacity(layers, 'lowerShade')} clip={outline}>
          <Path
            path={lowerShade}
            color="rgba(154,91,31,0.5)"
            style="stroke"
            strokeWidth={1.8 * scale}
            strokeCap="round"
          >
            <BlurMask blur={lighting.lowerShadeBlur * scale} style="normal" />
          </Path>
        </Group>
      </Canvas>

      {layers.years.enabled && (
        <View style={[StyleSheet.absoluteFill, { opacity: layers.years.opacity }]}>
          {preset.years.map((year, index) => index === 3 ? null : (
            <Text
              key={year}
              style={[
                styles.year,
                {
                  left: centerX + preset.yearOffsets[index] * scale - 28 * scale,
                  top: centerY + 10.5 * scale,
                  width: 56 * scale,
                  fontSize: 9 * scale,
                  lineHeight: 14 * scale,
                },
              ]}
            >
              {year}
            </Text>
          ))}
        </View>
      )}

      {layers.label.enabled && (
        <Text
          style={[
            styles.label,
            {
              opacity: layers.label.opacity,
              left: centerX - scaledGeometry.width * 0.42,
              top: centerY - 10 * scale,
              width: scaledGeometry.width * 0.84,
              fontSize: 13.5 * scale,
              lineHeight: 20 * scale,
            },
          ]}
        >
          {preset.label}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  year: {
    position: 'absolute',
    color: '#745e49',
    fontWeight: '400',
    textAlign: 'center',
  },
  label: {
    position: 'absolute',
    color: '#3b2b21',
    fontWeight: '500',
    letterSpacing: 0.12,
    textAlign: 'center',
  },
});

export default CrystalTimelineGoldenRenderer;
