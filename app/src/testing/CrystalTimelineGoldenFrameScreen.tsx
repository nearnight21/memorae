import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  Canvas,
  Group,
  Image as SkiaImage,
  useImage,
} from '@shopify/react-native-skia';

import {
  GOLDEN_CRYSTAL_PRESET,
  GOLDEN_LAYER_LABELS,
  GOLDEN_LAYER_ORDER,
  clampGoldenOpacity,
  cloneGoldenLayerState,
  type GoldenCrystalGeometry,
  type GoldenCrystalLighting,
  type GoldenFrameMode,
  type GoldenLayerKey,
} from './crystalTimelineGoldenPreset';
import {
  CrystalTimelineGoldenRenderer,
  type GoldenCrystalRendererKind,
} from './CrystalTimelineGoldenRenderer';
import {
  CRYSTAL_SHADER_DEBUG_LABELS,
  CRYSTAL_SHADER_DEBUG_MODES,
  cloneCrystalThumbShaderParameters,
  type CrystalShaderDebugMode,
  type CrystalThumbShaderParameters,
} from './CrystalThumbShaderPrototype';

const REFERENCE_IMAGE = require('../../assets/archive/crystal-timeline/crystal-timeline-reference.png');

const MODE_LABELS: Record<GoldenFrameMode, string> = {
  reference: 'Reference',
  render: 'Render',
  overlay: 'Overlay',
};

const RENDERER_LABELS: Record<GoldenCrystalRendererKind, string> = {
  legacy: 'Legacy',
  shaderPrototype: 'Shader Prototype',
};

type NumberControlProps = {
  label: string;
  value: number;
  onDecrease: () => void;
  onIncrease: () => void;
  digits?: number;
};

function NumberControl({
  label,
  value,
  onDecrease,
  onIncrease,
  digits = 1,
}: NumberControlProps) {
  return (
    <View style={styles.valueRow}>
      <Text style={styles.valueLabel}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable accessibilityRole="button" onPress={onDecrease} style={styles.stepButton}>
          <Text style={styles.stepButtonText}>−</Text>
        </Pressable>
        <Text style={styles.valueText}>{value.toFixed(digits)}</Text>
        <Pressable accessibilityRole="button" onPress={onIncrease} style={styles.stepButton}>
          <Text style={styles.stepButtonText}>＋</Text>
        </Pressable>
      </View>
    </View>
  );
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function CrystalTimelineGoldenFrameScreen({ onExit }: { onExit: () => void }) {
  const { width, height } = useWindowDimensions();
  const referenceImage = useImage(REFERENCE_IMAGE);
  const [mode, setMode] = useState<GoldenFrameMode>('render');
  const [renderer, setRenderer] = useState<GoldenCrystalRendererKind>('shaderPrototype');
  const [debugVisible, setDebugVisible] = useState(false);
  const [referenceOpacity, setReferenceOpacity] = useState(0.5);
  const [layers, setLayers] = useState(() => cloneGoldenLayerState(GOLDEN_CRYSTAL_PRESET.layers));
  const [geometry, setGeometry] = useState<GoldenCrystalGeometry>(() => ({
    ...GOLDEN_CRYSTAL_PRESET.geometry,
  }));
  const [lighting, setLighting] = useState<GoldenCrystalLighting>(() => ({
    ...GOLDEN_CRYSTAL_PRESET.lighting,
  }));
  const [shaderDebugMode, setShaderDebugMode] = useState<CrystalShaderDebugMode>('final');
  const [shaderParameters, setShaderParameters] = useState<CrystalThumbShaderParameters>(
    cloneCrystalThumbShaderParameters,
  );

  const showReference = mode === 'reference' || mode === 'overlay';
  const showRender = mode === 'render' || mode === 'overlay';
  const resolvedReferenceOpacity = mode === 'reference' ? 1 : referenceOpacity;

  const geometryControls = useMemo(
    () => [
      { key: 'width', label: 'Width', step: 1, min: 70, max: 110, digits: 0 },
      { key: 'height', label: 'Height', step: 1, min: 44, max: 76, digits: 0 },
      { key: 'leftBulge', label: 'Left bulge', step: 0.2, min: 0, max: 5, digits: 1 },
      { key: 'rightBulge', label: 'Right bulge', step: 0.2, min: 0, max: 5, digits: 1 },
      {
        key: 'shoulderTightness',
        label: 'Shoulder',
        step: 0.01,
        min: 0.04,
        max: 0.22,
        digits: 2,
      },
      { key: 'topCurve', label: 'Top curve', step: 0.01, min: 0.08, max: 0.25, digits: 2 },
      { key: 'bottomCurve', label: 'Bottom curve', step: 0.01, min: 0.08, max: 0.25, digits: 2 },
      {
        key: 'verticalAsymmetry',
        label: 'Vertical asymmetry',
        step: 0.2,
        min: -4,
        max: 4,
        digits: 1,
      },
    ] as const,
    [],
  );

  const lightingControls = useMemo(
    () => [
      { key: 'softHighlightY', label: 'Soft highlight Y', step: 0.5, min: -28, max: -8 },
      { key: 'softHighlightBlur', label: 'Soft blur', step: 0.1, min: 0, max: 2.5 },
      { key: 'specularY', label: 'Specular Y', step: 0.5, min: -28, max: -8 },
      { key: 'lowerShadeY', label: 'Lower shade Y', step: 0.5, min: 10, max: 28 },
      { key: 'lowerShadeBlur', label: 'Lower blur', step: 0.1, min: 0, max: 2.5 },
    ] as const,
    [],
  );

  const shaderGeometryControls = useMemo(
    () => [
      { key: 'width', label: 'Width', step: 1, min: 70, max: 110, digits: 0 },
      { key: 'height', label: 'Height', step: 1, min: 44, max: 76, digits: 0 },
      { key: 'shoulder', label: 'Shoulder', step: 0.01, min: 0.02, max: 0.32, digits: 2 },
      { key: 'topFlatten', label: 'Top flatten', step: 0.05, min: 0, max: 1, digits: 2 },
      {
        key: 'bottomFlatten',
        label: 'Bottom flatten',
        step: 0.05,
        min: 0,
        max: 1,
        digits: 2,
      },
      {
        key: 'surfaceHeight',
        label: 'Surface height',
        step: 0.1,
        min: 0.5,
        max: 2,
        digits: 2,
      },
    ] as const,
    [],
  );

  const shaderLightingControls = useMemo(
    () => [
      { key: 'lightX', label: 'Light X', step: 0.1, min: -1, max: 1, digits: 2 },
      { key: 'lightY', label: 'Light Y', step: 0.1, min: -1, max: 1, digits: 2 },
      {
        key: 'specularPower',
        label: 'Specular power',
        step: 4,
        min: 8,
        max: 128,
        digits: 0,
      },
      {
        key: 'specularStrength',
        label: 'Specular strength',
        step: 0.1,
        min: 0,
        max: 2,
        digits: 2,
      },
      {
        key: 'fresnelPower',
        label: 'Fresnel power',
        step: 0.1,
        min: 0.5,
        max: 5,
        digits: 2,
      },
      {
        key: 'fresnelStrength',
        label: 'Fresnel strength',
        step: 0.1,
        min: 0,
        max: 2,
        digits: 2,
      },
    ] as const,
    [],
  );

  function updateLayer(key: GoldenLayerKey, patch: Partial<(typeof layers)[GoldenLayerKey]>) {
    setLayers((current) => ({
      ...current,
      [key]: { ...current[key], ...patch },
    }));
  }

  function updateGeometry(
    key: keyof GoldenCrystalGeometry,
    delta: number,
    minimum: number,
    maximum: number,
  ) {
    setGeometry((current) => ({
      ...current,
      [key]: clamp(current[key] + delta, minimum, maximum),
    }));
  }

  function updateLighting(
    key: keyof GoldenCrystalLighting,
    delta: number,
    minimum: number,
    maximum: number,
  ) {
    setLighting((current) => ({
      ...current,
      [key]: clamp(current[key] + delta, minimum, maximum),
    }));
  }

  function updateShaderParameter(
    key: keyof CrystalThumbShaderParameters,
    delta: number,
    minimum: number,
    maximum: number,
  ) {
    setShaderParameters((current) => ({
      ...current,
      [key]: clamp(current[key] + delta, minimum, maximum),
    }));
  }

  function resetPreset() {
    setReferenceOpacity(0.5);
    setLayers(cloneGoldenLayerState(GOLDEN_CRYSTAL_PRESET.layers));
    setGeometry({ ...GOLDEN_CRYSTAL_PRESET.geometry });
    setLighting({ ...GOLDEN_CRYSTAL_PRESET.lighting });
    setShaderDebugMode('final');
    setShaderParameters(cloneCrystalThumbShaderParameters());
  }

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {showReference ? (
          <Canvas style={StyleSheet.absoluteFill}>
            {referenceImage ? (
              <Group opacity={resolvedReferenceOpacity}>
                <SkiaImage
                  fit="fill"
                  height={height}
                  image={referenceImage}
                  width={width}
                  x={0}
                  y={0}
                />
              </Group>
            ) : null}
          </Canvas>
        ) : null}
        {showRender ? (
          <CrystalTimelineGoldenRenderer
            geometry={geometry}
            height={height}
            layers={layers}
            lighting={lighting}
            preset={GOLDEN_CRYSTAL_PRESET}
            renderer={renderer}
            shaderDebugMode={shaderDebugMode}
            shaderParameters={shaderParameters}
            width={width}
          />
        ) : null}
      </View>

      <View style={styles.topBar}>
        <Pressable
          accessibilityLabel="返回测试 App"
          accessibilityRole="button"
          onPress={onExit}
          style={styles.utilityButton}
        >
          <Text style={styles.utilityButtonText}>测试 App</Text>
        </Pressable>
        <View style={styles.modeSwitcher}>
          {(Object.keys(MODE_LABELS) as GoldenFrameMode[]).map((candidate) => (
            <Pressable
              accessibilityRole="button"
              key={candidate}
              onPress={() => setMode(candidate)}
              style={[styles.modeButton, mode === candidate && styles.modeButtonActive]}
            >
              <Text style={[styles.modeText, mode === candidate && styles.modeTextActive]}>
                {MODE_LABELS[candidate]}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          accessibilityLabel="Layer Debug"
          accessibilityRole="button"
          onPress={() => setDebugVisible((current) => !current)}
          style={[styles.utilityButton, debugVisible && styles.utilityButtonActive]}
        >
          <Text style={styles.utilityButtonText}>Layers</Text>
        </Pressable>
      </View>

      <View accessibilityLabel="Crystal renderer" style={styles.rendererBar}>
        {(Object.keys(RENDERER_LABELS) as GoldenCrystalRendererKind[]).map((candidate) => (
          <Pressable
            accessibilityRole="button"
            key={candidate}
            onPress={() => setRenderer(candidate)}
            style={[
              styles.rendererButton,
              renderer === candidate && styles.rendererButtonActive,
            ]}
          >
            <Text
              style={[
                styles.rendererText,
                renderer === candidate && styles.rendererTextActive,
              ]}
            >
              {RENDERER_LABELS[candidate]}
            </Text>
          </Pressable>
        ))}
      </View>

      {debugVisible ? (
        <View style={styles.debugPanel}>
          <ScrollView contentContainerStyle={styles.debugPanelContent}>
            <View style={styles.panelTitleRow}>
              <View>
                <Text style={styles.panelTitle}>Crystal Timeline Golden Frame</Text>
                <Text style={styles.panelSubtitle}>静态材质调试 · 固定 2021</Text>
              </View>
              <Pressable accessibilityRole="button" onPress={resetPreset} style={styles.resetButton}>
                <Text style={styles.resetText}>Reset</Text>
              </Pressable>
            </View>

            <Text style={styles.sectionTitle}>Overlay</Text>
            <NumberControl
              digits={2}
              label="Reference opacity"
              onDecrease={() => setReferenceOpacity((value) => clamp(value - 0.05, 0, 1))}
              onIncrease={() => setReferenceOpacity((value) => clamp(value + 0.05, 0, 1))}
              value={referenceOpacity}
            />
            <Text style={styles.panelNote}>
              Overlay 只用于几何与对齐；材质效果请在 Render 模式判断。
            </Text>

            {renderer === 'legacy' ? (
              <>
                <Text style={styles.sectionTitle}>Layer Debug</Text>
                {GOLDEN_LAYER_ORDER.map((key) => {
                  const layer = layers[key];
                  return (
                    <View key={key} style={styles.layerRow}>
                      <Pressable
                        accessibilityRole="switch"
                        accessibilityState={{ checked: layer.enabled }}
                        onPress={() => updateLayer(key, { enabled: !layer.enabled })}
                        style={[styles.layerToggle, layer.enabled && styles.layerToggleActive]}
                      >
                        <Text style={styles.layerToggleText}>{layer.enabled ? 'ON' : 'OFF'}</Text>
                      </Pressable>
                      <Text style={[styles.layerLabel, !layer.enabled && styles.layerLabelMuted]}>
                        {GOLDEN_LAYER_LABELS[key]}
                      </Text>
                      <View style={styles.layerOpacityControls}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() =>
                            updateLayer(key, { opacity: clampGoldenOpacity(layer.opacity - 0.05) })
                          }
                          style={styles.miniStepButton}
                        >
                          <Text style={styles.miniStepText}>−</Text>
                        </Pressable>
                        <Text style={styles.opacityText}>{layer.opacity.toFixed(2)}</Text>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() =>
                            updateLayer(key, { opacity: clampGoldenOpacity(layer.opacity + 0.05) })
                          }
                          style={styles.miniStepButton}
                        >
                          <Text style={styles.miniStepText}>＋</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}

                <Text style={styles.sectionTitle}>Geometry</Text>
                {geometryControls.map((control) => (
                  <NumberControl
                    digits={control.digits}
                    key={control.key}
                    label={control.label}
                    onDecrease={() =>
                      updateGeometry(control.key, -control.step, control.min, control.max)
                    }
                    onIncrease={() =>
                      updateGeometry(control.key, control.step, control.min, control.max)
                    }
                    value={geometry[control.key]}
                  />
                ))}

                <Text style={styles.sectionTitle}>Lighting</Text>
                {lightingControls.map((control) => (
                  <NumberControl
                    key={control.key}
                    label={control.label}
                    onDecrease={() =>
                      updateLighting(control.key, -control.step, control.min, control.max)
                    }
                    onIncrease={() =>
                      updateLighting(control.key, control.step, control.min, control.max)
                    }
                    value={lighting[control.key]}
                  />
                ))}
              </>
            ) : (
              <>
                <Text style={styles.sectionTitle}>Shader Debug View</Text>
                <View style={styles.debugModeGrid}>
                  {CRYSTAL_SHADER_DEBUG_MODES.map((candidate) => (
                    <Pressable
                      accessibilityRole="button"
                      key={candidate}
                      onPress={() => setShaderDebugMode(candidate)}
                      style={[
                        styles.debugModeButton,
                        shaderDebugMode === candidate && styles.debugModeButtonActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.debugModeText,
                          shaderDebugMode === candidate && styles.debugModeTextActive,
                        ]}
                      >
                        {CRYSTAL_SHADER_DEBUG_LABELS[candidate]}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.sectionTitle}>Geometry</Text>
                {shaderGeometryControls.map((control) => (
                  <NumberControl
                    digits={control.digits}
                    key={control.key}
                    label={control.label}
                    onDecrease={() =>
                      updateShaderParameter(control.key, -control.step, control.min, control.max)
                    }
                    onIncrease={() =>
                      updateShaderParameter(control.key, control.step, control.min, control.max)
                    }
                    value={shaderParameters[control.key]}
                  />
                ))}

                <Text style={styles.sectionTitle}>Lighting</Text>
                {shaderLightingControls.map((control) => (
                  <NumberControl
                    digits={control.digits}
                    key={control.key}
                    label={control.label}
                    onDecrease={() =>
                      updateShaderParameter(control.key, -control.step, control.min, control.max)
                    }
                    onIncrease={() =>
                      updateShaderParameter(control.key, control.step, control.min, control.max)
                    }
                    value={shaderParameters[control.key]}
                  />
                ))}

                <Text style={styles.sectionTitle}>Material Lock</Text>
                <Text style={styles.materialLockText}>
                  Body whitening / warm tint / volume / caustic 已锁定关闭。本轮只验证 Height →
                  Normal → Fresnel / Specular。
                </Text>
              </>
            )}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#eee9df',
  },
  topBar: {
    position: 'absolute',
    top: 12,
    left: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  utilityButton: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 11,
    borderRadius: 17,
    backgroundColor: 'rgba(35, 29, 22, 0.78)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 248, 233, 0.32)',
  },
  utilityButtonActive: {
    backgroundColor: 'rgba(133, 84, 26, 0.9)',
  },
  utilityButtonText: {
    color: '#fff8eb',
    fontSize: 11,
    fontWeight: '700',
  },
  modeSwitcher: {
    flex: 1,
    minHeight: 34,
    flexDirection: 'row',
    padding: 2,
    borderRadius: 17,
    backgroundColor: 'rgba(35, 29, 22, 0.76)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 248, 233, 0.32)',
  },
  modeButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
  },
  modeButtonActive: {
    backgroundColor: 'rgba(255, 248, 233, 0.92)',
  },
  modeText: {
    color: 'rgba(255, 248, 233, 0.72)',
    fontSize: 10,
    fontWeight: '600',
  },
  modeTextActive: {
    color: '#3a2b1b',
  },
  rendererBar: {
    position: 'absolute',
    top: 53,
    left: 70,
    right: 70,
    minHeight: 31,
    flexDirection: 'row',
    padding: 2,
    borderRadius: 16,
    backgroundColor: 'rgba(35, 29, 22, 0.82)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 248, 233, 0.32)',
  },
  rendererButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
  },
  rendererButtonActive: {
    backgroundColor: '#f5e3c2',
  },
  rendererText: {
    color: 'rgba(255, 248, 233, 0.7)',
    fontSize: 10,
    fontWeight: '700',
  },
  rendererTextActive: {
    color: '#3a2816',
  },
  debugPanel: {
    position: 'absolute',
    top: 91,
    left: 10,
    right: 10,
    maxHeight: '70%',
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: 'rgba(27, 23, 19, 0.94)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 241, 216, 0.28)',
  },
  debugPanelContent: {
    padding: 14,
    paddingBottom: 22,
  },
  panelTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  panelTitle: {
    color: '#fff8eb',
    fontSize: 14,
    fontWeight: '800',
  },
  panelSubtitle: {
    marginTop: 3,
    color: 'rgba(255, 248, 235, 0.55)',
    fontSize: 10,
  },
  resetButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: 'rgba(169, 105, 31, 0.28)',
  },
  resetText: {
    color: '#f1c985',
    fontSize: 11,
    fontWeight: '700',
  },
  sectionTitle: {
    marginTop: 17,
    marginBottom: 6,
    color: '#d7a95f',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  panelNote: {
    marginTop: 8,
    color: 'rgba(255, 248, 235, 0.47)',
    fontSize: 9,
    lineHeight: 14,
  },
  materialLockText: {
    color: 'rgba(255, 248, 235, 0.64)',
    fontSize: 10,
    lineHeight: 16,
  },
  debugModeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  debugModeButton: {
    minHeight: 27,
    justifyContent: 'center',
    paddingHorizontal: 9,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 248, 235, 0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 248, 235, 0.1)',
  },
  debugModeButtonActive: {
    backgroundColor: 'rgba(187, 121, 42, 0.72)',
    borderColor: 'rgba(255, 224, 173, 0.54)',
  },
  debugModeText: {
    color: 'rgba(255, 248, 235, 0.62)',
    fontSize: 9,
    fontWeight: '700',
  },
  debugModeTextActive: {
    color: '#fff8eb',
  },
  valueRow: {
    minHeight: 35,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 248, 235, 0.1)',
  },
  valueLabel: {
    flex: 1,
    color: 'rgba(255, 248, 235, 0.75)',
    fontSize: 11,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepButton: {
    width: 31,
    height: 27,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(255, 248, 235, 0.08)',
  },
  stepButtonText: {
    color: '#f5d49c',
    fontSize: 14,
    fontWeight: '700',
  },
  valueText: {
    width: 52,
    textAlign: 'center',
    color: '#fff8eb',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  layerRow: {
    minHeight: 35,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 248, 235, 0.1)',
  },
  layerToggle: {
    width: 36,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: 'rgba(255, 248, 235, 0.08)',
  },
  layerToggleActive: {
    backgroundColor: 'rgba(167, 103, 28, 0.72)',
  },
  layerToggleText: {
    color: '#fff8eb',
    fontSize: 8,
    fontWeight: '800',
  },
  layerLabel: {
    flex: 1,
    marginLeft: 9,
    color: 'rgba(255, 248, 235, 0.78)',
    fontSize: 11,
  },
  layerLabelMuted: {
    color: 'rgba(255, 248, 235, 0.32)',
  },
  layerOpacityControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  miniStepButton: {
    width: 27,
    height: 25,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    backgroundColor: 'rgba(255, 248, 235, 0.08)',
  },
  miniStepText: {
    color: '#f5d49c',
    fontSize: 13,
    fontWeight: '700',
  },
  opacityText: {
    width: 43,
    textAlign: 'center',
    color: '#fff8eb',
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
});
