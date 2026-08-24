import React from 'react';
import { StyleSheet } from 'react-native';
import {
  BlurMask,
  Canvas,
  Group,
  LinearGradient,
  Path,
  Rect,
  RoundedRect,
  usePathValue,
  vec,
} from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import {
  CRYSTAL_LENS_HEIGHT,
  CRYSTAL_LENS_RADIUS,
  CRYSTAL_LENS_WIDTH,
  CRYSTAL_RAIL_CENTER_Y,
  CRYSTAL_RAIL_CORE_HEIGHT,
  CRYSTAL_RAIL_HEIGHT,
  CRYSTAL_RAIL_Y,
} from './crystalTimelineGeometry';

interface Props {
  width: number;
  centerX: number;
  pressProgress: SharedValue<number>;
  snapProgress: SharedValue<number>;
  highlightOffsetX: SharedValue<number>;
}

export default function CrystalRailCanvas({
  width,
  centerX,
  pressProgress,
  snapProgress,
  highlightOffsetX,
}: Props) {
  const lensWidth = useDerivedValue(() => CRYSTAL_LENS_WIDTH * (
    1 + pressProgress.value * 0.04 - snapProgress.value * 0.02
  ));
  const lensHeight = useDerivedValue(() => CRYSTAL_LENS_HEIGHT * (
    1 - pressProgress.value * 0.015 - snapProgress.value * 0.025
  ));
  const lensX = useDerivedValue(() => centerX - lensWidth.value / 2);
  const lensY = useDerivedValue(() => CRYSTAL_RAIL_CENTER_Y - lensHeight.value / 2);
  const shadowY = useDerivedValue(() => lensY.value + 2.2);
  const lensInsetX = useDerivedValue(() => lensX.value + 1);
  const lensInsetY = useDerivedValue(() => lensY.value + 1);
  const lensInsetWidth = useDerivedValue(() => Math.max(0, lensWidth.value - 2));
  const upperWashHeight = useDerivedValue(() => Math.max(0, lensHeight.value * 0.48));
  const lowerWashY = useDerivedValue(() => lensY.value + lensHeight.value * 0.48);
  const lowerWashHeight = useDerivedValue(() => Math.max(0, lensHeight.value * 0.49));
  const shadowOpacity = useDerivedValue(() => 0.14 + pressProgress.value * 0.06);
  const highlightX = useDerivedValue(() => centerX - 20 + highlightOffsetX.value);
  const lowerCausticX = useDerivedValue(() => centerX - 18 - highlightOffsetX.value * 0.45);
  const leftRimX = useDerivedValue(() => lensX.value + 2.8 + highlightOffsetX.value * 0.16);
  const leftRimY = useDerivedValue(() => lensY.value + 7.5);
  const leftRimHeight = useDerivedValue(() => Math.max(8, lensHeight.value * 0.43));
  const liquidContour = usePathValue((builder) => {
    'worklet';
    const widthNow = lensWidth.value;
    const heightNow = lensHeight.value;
    const left = centerX - widthNow / 2;
    const right = centerX + widthNow / 2;
    const top = CRYSTAL_RAIL_CENTER_Y - heightNow / 2;
    const bottom = CRYSTAL_RAIL_CENTER_Y + heightNow / 2;
    const flow = highlightOffsetX.value * 0.46;
    const pressed = pressProgress.value;
    const snapped = snapProgress.value;

    builder.moveTo(centerX + flow * 0.2, top + pressed * 0.35);
    builder.cubicTo(
      centerX + widthNow * 0.29 + flow * 0.18,
      top - snapped * 0.35,
      right - widthNow * 0.03 + flow * 0.22,
      top + heightNow * 0.13,
      right + flow * 0.12,
      CRYSTAL_RAIL_CENTER_Y - flow * 0.12,
    );
    builder.cubicTo(
      right - widthNow * 0.015 - flow * 0.08,
      bottom - heightNow * 0.14,
      centerX + widthNow * 0.3 - flow * 0.18,
      bottom + snapped * 0.75,
      centerX - flow * 0.18,
      bottom - pressed * 0.2,
    );
    builder.cubicTo(
      centerX - widthNow * 0.3 - flow * 0.18,
      bottom + snapped * 0.55,
      left + widthNow * 0.015 + flow * 0.08,
      bottom - heightNow * 0.14,
      left + flow * 0.12,
      CRYSTAL_RAIL_CENTER_Y + flow * 0.12,
    );
    builder.cubicTo(
      left + widthNow * 0.03 + flow * 0.22,
      top + heightNow * 0.13,
      centerX - widthNow * 0.29 + flow * 0.18,
      top - snapped * 0.25,
      centerX + flow * 0.2,
      top + pressed * 0.35,
    );
    builder.close();
  });

  return (
    <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Group opacity={0.16}>
        <RoundedRect
          x={-18}
          y={CRYSTAL_RAIL_Y + 2.2}
          width={width + 36}
          height={CRYSTAL_RAIL_HEIGHT}
          r={CRYSTAL_RAIL_HEIGHT / 2}
          color="#765d48"
        >
          <BlurMask blur={3.2} style="normal" />
        </RoundedRect>
      </Group>
      <RoundedRect
        x={-18}
        y={CRYSTAL_RAIL_Y}
        width={width + 36}
        height={CRYSTAL_RAIL_HEIGHT}
        r={CRYSTAL_RAIL_HEIGHT / 2}
      >
        <LinearGradient
          start={vec(0, CRYSTAL_RAIL_Y)}
          end={vec(0, CRYSTAL_RAIL_Y + CRYSTAL_RAIL_HEIGHT)}
          colors={[
            'rgba(255,255,252,0.78)',
            'rgba(255,249,239,0.38)',
            'rgba(225,207,184,0.2)',
            'rgba(137,106,77,0.12)',
          ]}
          positions={[0, 0.34, 0.72, 1]}
        />
      </RoundedRect>
      <Rect x={-18} y={CRYSTAL_RAIL_Y + 0.35} width={width + 36} height={0.65} color="rgba(255,255,255,0.86)" />
      <Rect x={-18} y={CRYSTAL_RAIL_Y + CRYSTAL_RAIL_HEIGHT - 0.65} width={width + 36} height={0.55} color="rgba(255,248,238,0.2)" />
      <Rect
        x={-18}
        y={CRYSTAL_RAIL_CENTER_Y - CRYSTAL_RAIL_CORE_HEIGHT / 2}
        width={width + 36}
        height={CRYSTAL_RAIL_CORE_HEIGHT}
        color="rgba(151,88,26,0.86)"
      />

      <Group opacity={shadowOpacity}>
        <RoundedRect
          x={lensX}
          y={shadowY}
          width={lensWidth}
          height={lensHeight}
          r={CRYSTAL_LENS_RADIUS}
          color="#69513e"
        >
          <BlurMask blur={5} style="normal" />
        </RoundedRect>
      </Group>
      <Path path={liquidContour}>
        <LinearGradient
          start={vec(centerX - CRYSTAL_LENS_WIDTH / 2, CRYSTAL_RAIL_CENTER_Y - CRYSTAL_LENS_HEIGHT / 2)}
          end={vec(centerX + CRYSTAL_LENS_WIDTH / 2, CRYSTAL_RAIL_CENTER_Y + CRYSTAL_LENS_HEIGHT / 2)}
          colors={[
            'rgba(255,255,252,0.88)',
            'rgba(255,253,248,0.62)',
            'rgba(219,196,168,0.38)',
            'rgba(255,250,239,0.7)',
          ]}
          positions={[0, 0.34, 0.7, 1]}
        />
      </Path>

      <RoundedRect
        x={lensInsetX}
        y={lensInsetY}
        width={lensInsetWidth}
        height={upperWashHeight}
        r={CRYSTAL_LENS_RADIUS - 1}
      >
        <LinearGradient
          start={vec(centerX, CRYSTAL_RAIL_CENTER_Y - 18)}
          end={vec(centerX, CRYSTAL_RAIL_CENTER_Y + 1)}
          colors={['rgba(255,255,255,0.62)', 'rgba(255,255,255,0.02)']}
        />
      </RoundedRect>

      <RoundedRect
        x={lensInsetX}
        y={lowerWashY}
        width={lensInsetWidth}
        height={lowerWashHeight}
        r={CRYSTAL_LENS_RADIUS - 1}
      >
        <LinearGradient
          start={vec(centerX, CRYSTAL_RAIL_CENTER_Y)}
          end={vec(centerX, CRYSTAL_RAIL_CENTER_Y + 18)}
          colors={['rgba(255,252,246,0.01)', 'rgba(202,145,86,0.25)']}
        />
      </RoundedRect>

      <Group opacity={0.2} transform={[{ rotate: -0.18 }]} origin={vec(centerX - 7, CRYSTAL_RAIL_CENTER_Y)}>
        <RoundedRect
          x={centerX - 10}
          y={CRYSTAL_RAIL_CENTER_Y - 12}
          width={4.5}
          height={24}
          r={2.25}
          color="rgba(255,255,255,0.78)"
        >
          <BlurMask blur={1.2} style="normal" />
        </RoundedRect>
      </Group>
      <Group opacity={0.15} transform={[{ rotate: 0.16 }]} origin={vec(centerX + 11, CRYSTAL_RAIL_CENTER_Y)}>
        <RoundedRect
          x={centerX + 9}
          y={CRYSTAL_RAIL_CENTER_Y - 10}
          width={3.2}
          height={20}
          r={1.6}
          color="rgba(139,101,69,0.56)"
        />
      </Group>

      <RoundedRect
        x={lensX}
        y={CRYSTAL_RAIL_Y + 0.4}
        width={lensWidth}
        height={CRYSTAL_RAIL_HEIGHT - 0.8}
        r={(CRYSTAL_RAIL_HEIGHT - 0.8) / 2}
      >
        <LinearGradient
          start={vec(centerX - 26, CRYSTAL_RAIL_Y)}
          end={vec(centerX + 26, CRYSTAL_RAIL_Y + CRYSTAL_RAIL_HEIGHT)}
          colors={[
            'rgba(255,255,252,0.54)',
            'rgba(255,249,239,0.22)',
            'rgba(255,255,255,0.38)',
          ]}
          positions={[0, 0.58, 1]}
        />
      </RoundedRect>
      <Rect
        x={lensX}
        y={CRYSTAL_RAIL_CENTER_Y - CRYSTAL_RAIL_CORE_HEIGHT / 2}
        width={lensWidth}
        height={CRYSTAL_RAIL_CORE_HEIGHT}
        color="rgba(137,76,22,0.76)"
      />

      <Path
        path={liquidContour}
        color="rgba(126,96,71,0.24)"
        style="stroke"
        strokeWidth={0.65}
      />

      <RoundedRect
        x={leftRimX}
        y={leftRimY}
        width={1.15}
        height={leftRimHeight}
        r={0.58}
        color="rgba(255,255,255,0.5)"
      >
        <BlurMask blur={0.8} style="normal" />
      </RoundedRect>

      <RoundedRect
        x={highlightX}
        y={CRYSTAL_RAIL_CENTER_Y - 13.1}
        width={23}
        height={2.7}
        r={1.35}
        color="rgba(255,255,255,0.76)"
      >
        <BlurMask blur={1.1} style="normal" />
      </RoundedRect>
      <RoundedRect
        x={highlightX}
        y={CRYSTAL_RAIL_CENTER_Y - 12.25}
        width={14}
        height={0.75}
        r={0.38}
        color="rgba(255,255,255,0.94)"
      />
      <RoundedRect
        x={lowerCausticX}
        y={CRYSTAL_RAIL_CENTER_Y + 15.7}
        width={36}
        height={2.4}
        r={1.1}
        color="rgba(187,112,38,0.28)"
      >
        <BlurMask blur={1.8} style="normal" />
      </RoundedRect>
      <RoundedRect
        x={centerX - 13}
        y={CRYSTAL_RAIL_CENTER_Y + 16.35}
        width={26}
        height={0.65}
        r={0.33}
        color="rgba(255,248,232,0.54)"
      />
    </Canvas>
  );
}
