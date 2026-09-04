import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Canvas } from '@shopify/react-native-skia';

import {
  GoldenCrystalMaterialLayers,
  GoldenCrystalTrackLayers,
} from '../archive/crystal-timeline/GoldenCrystalVisual';
import type {
  GoldenCrystalGeometry,
  GoldenCrystalLighting,
  GoldenCrystalPreset,
  GoldenLayerState,
} from './crystalTimelineGoldenPreset';
import {
  CrystalThumbShaderPrototype,
  type CrystalShaderDebugMode,
  type CrystalThumbShaderParameters,
} from './CrystalThumbShaderPrototype';

export type GoldenCrystalRendererKind = 'legacy' | 'shaderPrototype';

interface Props {
  width: number;
  height: number;
  preset: GoldenCrystalPreset;
  geometry: GoldenCrystalGeometry;
  lighting: GoldenCrystalLighting;
  layers: GoldenLayerState;
  renderer: GoldenCrystalRendererKind;
  shaderDebugMode: CrystalShaderDebugMode;
  shaderParameters: CrystalThumbShaderParameters;
}

export function CrystalTimelineGoldenRenderer({
  width,
  height,
  preset,
  geometry,
  lighting,
  layers,
  renderer,
  shaderDebugMode,
  shaderParameters,
}: Props) {
  const scale = width / preset.referenceViewport.width;
  const centerX = width / 2;
  const centerY = height * preset.track.centerYRatio;
  const scaledGeometryWidth = geometry.width * scale;

  return (
    <View
      accessibilityLabel="Crystal Timeline Golden Frame Render"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    >
      <Canvas style={StyleSheet.absoluteFill}>
        <GoldenCrystalTrackLayers
          centerX={centerX}
          centerY={centerY}
          geometry={geometry}
          layers={layers}
          lighting={lighting}
          preset={preset}
          scale={scale}
          showStaticTicks
          width={width}
        />
        {renderer === 'legacy' ? (
          <GoldenCrystalMaterialLayers
            centerX={centerX}
            centerY={centerY}
            geometry={geometry}
            layers={layers}
            lighting={lighting}
            preset={preset}
            scale={scale}
            width={width}
          />
        ) : (
          <CrystalThumbShaderPrototype
            centerX={centerX}
            centerY={centerY}
            debugMode={shaderDebugMode}
            parameters={shaderParameters}
            scale={scale}
          />
        )}
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
              left: centerX - scaledGeometryWidth * 0.42,
              top: centerY - 10 * scale,
              width: scaledGeometryWidth * 0.84,
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
