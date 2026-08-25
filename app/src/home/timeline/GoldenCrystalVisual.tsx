import React, { useMemo } from 'react';
import {
  BlurMask,
  Group,
  LinearGradient,
  Path,
  Rect,
  RoundedRect,
  vec,
} from '@shopify/react-native-skia';

import {
  generateCrystalPath,
  generateInnerRimPath,
  generateSurfaceArcPath,
} from './goldenCrystalGeometry';
import type {
  GoldenCrystalGeometry,
  GoldenCrystalLighting,
  GoldenCrystalPreset,
  GoldenLayerKey,
  GoldenLayerState,
} from './goldenCrystalPreset';

interface GoldenVisualProps {
  width: number;
  centerX: number;
  centerY: number;
  scale: number;
  preset: GoldenCrystalPreset;
  geometry: GoldenCrystalGeometry;
  lighting: GoldenCrystalLighting;
  layers: GoldenLayerState;
}

interface GoldenTrackLayersProps extends GoldenVisualProps {
  showStaticTicks?: boolean;
}

export function goldenLayerOpacity(layers: GoldenLayerState, key: GoldenLayerKey): number {
  return layers[key].enabled ? layers[key].opacity : 0;
}

export function GoldenCrystalTrackLayers({
  width,
  centerX,
  centerY,
  scale,
  preset,
  geometry: _geometry,
  lighting: _lighting,
  layers,
  showStaticTicks = false,
}: GoldenTrackLayersProps) {
  const trackHeight = preset.track.glassHeight * scale;
  const trackTop = centerY - trackHeight / 2;
  const lineWidth = preset.track.lineWidth * scale;
  const tickHeight = preset.track.tickHeight * scale;

  return (
    <>
      <Group opacity={goldenLayerOpacity(layers, 'track')}>
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
              'rgba(255,255,252,0.22)',
              'rgba(255,250,241,0.065)',
              'rgba(225,194,153,0.035)',
              'rgba(142,98,58,0.055)',
            ]}
            positions={[0, 0.32, 0.7, 1]}
          />
        </RoundedRect>
        <Rect
          x={-12 * scale}
          y={trackTop + 0.45 * scale}
          width={width + 24 * scale}
          height={0.5 * scale}
          color="rgba(255,255,255,0.42)"
        />
        <Rect
          x={-12 * scale}
          y={trackTop + trackHeight - 0.85 * scale}
          width={width + 24 * scale}
          height={0.45 * scale}
          color="rgba(171,117,68,0.16)"
        />
        <RoundedRect
          x={-12 * scale}
          y={centerY - 4.5 * scale}
          width={width + 24 * scale}
          height={9 * scale}
          r={4.5 * scale}
        >
          <LinearGradient
            start={vec(0, centerY - 4.5 * scale)}
            end={vec(0, centerY + 4.5 * scale)}
            colors={[
              'rgba(255,255,255,0.065)',
              'rgba(207,160,104,0.025)',
              'rgba(255,250,241,0.05)',
            ]}
            positions={[0, 0.52, 1]}
          />
        </RoundedRect>
        <Rect
          x={-12 * scale}
          y={centerY - lineWidth / 2}
          width={width + 24 * scale}
          height={lineWidth}
          color="rgba(157,88,20,0.92)"
        />
      </Group>

      {showStaticTicks ? (
        <Group opacity={goldenLayerOpacity(layers, 'ticks')}>
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
      ) : null}
    </>
  );
}

export function GoldenCrystalMaterialLayers({
  centerX,
  centerY,
  scale,
  preset,
  geometry,
  lighting,
  layers,
}: GoldenVisualProps) {
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
  const innerRim = useMemo(() => generateInnerRimPath({
    ...scaledGeometry,
    centerX,
    centerY,
  }), [centerX, centerY, scale, scaledGeometry]);
  const softHighlight = useMemo(() => generateSurfaceArcPath(
    centerX - 1.2 * scale,
    centerY,
    scaledGeometry.width * 0.7,
    lighting.softHighlightY * scale,
    1.8 * scale,
  ), [centerX, centerY, lighting.softHighlightY, scale, scaledGeometry.width]);
  const specularHighlight = useMemo(() => generateSurfaceArcPath(
    centerX - 7.8 * scale,
    centerY,
    scaledGeometry.width * 0.27,
    lighting.specularY * scale,
    0.75 * scale,
  ), [centerX, centerY, lighting.specularY, scale, scaledGeometry.width]);
  const lowerShade = useMemo(() => generateSurfaceArcPath(
    centerX + 0.8 * scale,
    centerY,
    scaledGeometry.width * 0.72,
    lighting.lowerShadeY * scale,
    -1.5 * scale,
  ), [centerX, centerY, lighting.lowerShadeY, scale, scaledGeometry.width]);
  const trackHeight = preset.track.glassHeight * scale;

  return (
    <>
      <Group opacity={goldenLayerOpacity(layers, 'body')} clip={outline}>
        <Path path={outline}>
          <LinearGradient
            start={vec(centerX - scaledGeometry.width / 2, centerY - scaledGeometry.height / 2)}
            end={vec(centerX + scaledGeometry.width / 2, centerY + scaledGeometry.height / 2)}
            colors={[
              'rgba(255,255,252,0.28)',
              'rgba(255,251,243,0.055)',
              'rgba(230,197,153,0.018)',
              'rgba(255,247,231,0.09)',
            ]}
            positions={[0, 0.36, 0.69, 1]}
          />
        </Path>
      </Group>

      <Group opacity={goldenLayerOpacity(layers, 'volume')} clip={outline}>
        <Path path={outline}>
          <LinearGradient
            start={vec(centerX - scaledGeometry.width / 2, centerY)}
            end={vec(centerX + scaledGeometry.width / 2, centerY)}
            colors={[
              'rgba(139,92,55,0.13)',
              'rgba(255,255,255,0.012)',
              'rgba(255,255,255,0.008)',
              'rgba(154,96,42,0.105)',
            ]}
            positions={[0, 0.28, 0.68, 1]}
          />
        </Path>
        <Rect
          x={centerX - scaledGeometry.width / 2}
          y={centerY - trackHeight * 0.4}
          width={scaledGeometry.width}
          height={trackHeight * 0.8}
        >
          <LinearGradient
            start={vec(centerX, centerY - trackHeight / 2)}
            end={vec(centerX, centerY + trackHeight / 2)}
            colors={[
              'rgba(255,255,255,0.095)',
              'rgba(214,169,112,0.02)',
              'rgba(255,255,255,0.055)',
            ]}
            positions={[0, 0.55, 1]}
          />
        </Rect>
      </Group>

      <Group opacity={goldenLayerOpacity(layers, 'outerRim')}>
        <Path
          path={outline}
          style="stroke"
          strokeWidth={1.05 * scale}
        >
          <LinearGradient
            start={vec(centerX - scaledGeometry.width / 2, centerY - scaledGeometry.height / 2)}
            end={vec(centerX + scaledGeometry.width / 2, centerY + scaledGeometry.height / 2)}
            colors={[
              'rgba(255,255,252,0.72)',
              'rgba(121,83,54,0.32)',
              'rgba(255,250,240,0.56)',
              'rgba(137,87,45,0.28)',
            ]}
            positions={[0, 0.3, 0.66, 1]}
          />
        </Path>
      </Group>

      <Group opacity={goldenLayerOpacity(layers, 'innerRim')}>
        <Path
          path={innerRim}
          color="rgba(244,224,198,0.72)"
          style="stroke"
          strokeWidth={0.62 * scale}
          strokeCap="round"
        />
      </Group>

      <Group opacity={goldenLayerOpacity(layers, 'softHighlight')} clip={outline}>
        <Path
          path={softHighlight}
          color="rgba(255,255,255,0.7)"
          style="stroke"
          strokeWidth={2.8 * scale}
          strokeCap="round"
        >
          <BlurMask blur={lighting.softHighlightBlur * scale} style="normal" />
        </Path>
      </Group>

      <Group opacity={goldenLayerOpacity(layers, 'specularHighlight')} clip={outline}>
        <Path
          path={specularHighlight}
          color="rgba(255,255,255,0.92)"
          style="stroke"
          strokeWidth={0.68 * scale}
          strokeCap="round"
        />
      </Group>

      <Group opacity={goldenLayerOpacity(layers, 'lowerShade')} clip={outline}>
        <Path
          path={lowerShade}
          color="rgba(145,84,30,0.42)"
          style="stroke"
          strokeWidth={1.45 * scale}
          strokeCap="round"
        >
          <BlurMask blur={lighting.lowerShadeBlur * scale} style="normal" />
        </Path>
      </Group>
    </>
  );
}
