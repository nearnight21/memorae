import React from 'react';
import { StyleSheet } from 'react-native';
import { Canvas } from '@shopify/react-native-skia';

import {
  GoldenCrystalMaterialLayers,
  GoldenCrystalTrackLayers,
} from './GoldenCrystalVisual';
import { GOLDEN_CRYSTAL_PRESET } from './goldenCrystalPreset';
import { CRYSTAL_RAIL_CENTER_Y } from './crystalTimelineGeometry';

interface Props {
  width: number;
  centerX: number;
}

export default function CrystalRailCanvas({ width, centerX }: Props) {
  return (
    <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
      <GoldenCrystalTrackLayers
        centerX={centerX}
        centerY={CRYSTAL_RAIL_CENTER_Y}
        geometry={GOLDEN_CRYSTAL_PRESET.geometry}
        layers={GOLDEN_CRYSTAL_PRESET.layers}
        lighting={GOLDEN_CRYSTAL_PRESET.lighting}
        preset={GOLDEN_CRYSTAL_PRESET}
        scale={1}
        width={width}
      />
      <GoldenCrystalMaterialLayers
        centerX={centerX}
        centerY={CRYSTAL_RAIL_CENTER_Y}
        geometry={GOLDEN_CRYSTAL_PRESET.geometry}
        layers={GOLDEN_CRYSTAL_PRESET.layers}
        lighting={GOLDEN_CRYSTAL_PRESET.lighting}
        preset={GOLDEN_CRYSTAL_PRESET}
        scale={1}
        width={width}
      />
    </Canvas>
  );
}
