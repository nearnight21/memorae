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
  generateSurfaceArcPath,
  insetCrystalGeometry,
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

  return (
    <>
      <Group opacity={goldenLayerOpacity(layers, 'body')} clip={outline}>
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
            colors={[
              'rgba(255,255,255,0.12)',
              'rgba(214,169,112,0.035)',
              'rgba(255,255,255,0.08)',
            ]}
            positions={[0, 0.55, 1]}
          />
        </Rect>
      </Group>

      <Group opacity={goldenLayerOpacity(layers, 'innerVolume')} clip={outline}>
        <Path path={outline}>
          <LinearGradient
            start={vec(centerX - scaledGeometry.width / 2, centerY)}
            end={vec(centerX + scaledGeometry.width / 2, centerY)}
            colors={[
              'rgba(100,61,34,0.5)',
              'rgba(129,82,46,0.12)',
              'rgba(129,82,46,0)',
              'rgba(129,82,46,0)',
              'rgba(129,82,46,0.1)',
              'rgba(111,66,34,0.42)',
            ]}
            positions={[0, 0.12, 0.25, 0.72, 0.88, 1]}
          />
        </Path>
      </Group>

      <Group opacity={goldenLayerOpacity(layers, 'outerRim')}>
        <Path
          path={outline}
          style="stroke"
          strokeWidth={1.3 * scale}
        >
          <LinearGradient
            start={vec(centerX, centerY - scaledGeometry.height / 2)}
            end={vec(centerX, centerY + scaledGeometry.height / 2)}
            colors={[
              'rgba(103,67,39,0.08)',
              'rgba(116,75,43,0.46)',
              'rgba(103,61,31,0.98)',
            ]}
            positions={[0, 0.52, 1]}
          />
        </Path>
        <Path
          path={outline}
          style="stroke"
          strokeWidth={1.05 * scale}
        >
          <LinearGradient
            start={vec(centerX, centerY - scaledGeometry.height / 2)}
            end={vec(centerX, centerY + scaledGeometry.height / 2)}
            colors={[
              'rgba(255,255,252,1)',
              'rgba(255,247,232,0.92)',
              'rgba(255,252,245,0.36)',
              'rgba(255,250,240,0.03)',
            ]}
            positions={[0, 0.3, 0.68, 1]}
          />
        </Path>
      </Group>

      <Group opacity={goldenLayerOpacity(layers, 'innerRim')}>
        <Path
          path={innerOutline}
          style="stroke"
          strokeWidth={0.66 * scale}
        >
          <LinearGradient
            start={vec(centerX, centerY - scaledGeometry.height / 2)}
            end={vec(centerX, centerY + scaledGeometry.height / 2)}
            colors={[
              'rgba(255,252,245,0.88)',
              'rgba(229,201,169,0.56)',
              'rgba(126,82,49,0.68)',
            ]}
            positions={[0, 0.54, 1]}
          />
        </Path>
      </Group>

      <Group opacity={goldenLayerOpacity(layers, 'softHighlight')} clip={outline}>
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

      <Group opacity={goldenLayerOpacity(layers, 'specularHighlight')} clip={outline}>
        <Path
          path={specularHighlight}
          color="rgba(255,255,255,0.99)"
          style="stroke"
          strokeWidth={0.96 * scale}
          strokeCap="round"
        />
      </Group>

      <Group opacity={goldenLayerOpacity(layers, 'lowerShade')} clip={outline}>
        <Path
          path={lowerShade}
          color="rgba(135,77,29,0.82)"
          style="stroke"
          strokeWidth={1.8 * scale}
          strokeCap="round"
        >
          <BlurMask blur={lighting.lowerShadeBlur * scale * 0.55} style="normal" />
        </Path>
      </Group>
    </>
  );
}
