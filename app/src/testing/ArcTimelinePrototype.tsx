import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Canvas, Path } from '@shopify/react-native-skia';
import Animated, {
  cancelAnimation,
  Extrapolation,
  interpolate,
  ReduceMotion,
  useFrameCallback,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
  ARC_TIMELINE_PIXELS_PER_YEAR,
  arcTimelineIndexFromDrag,
  nearestCyclicArcTimelineIndex,
  projectedArcTimelineIndex,
  visualArcTimelineDragOffset,
  wrapArcTimelineIndex,
} from './arcTimelineModel';

const ARC_RADIUS_RATIO = 0.54;
const ARC_STEP_RADIANS = 0.32;
const ARC_TIMELINE_EDGE_SCROLL_YEARS_PER_SECOND = 1;
const SPRING_CONFIG = {
  stiffness: 250,
  damping: 28,
  mass: 0.78,
  energyThreshold: 0.001,
  reduceMotion: ReduceMotion.System,
} as const;

interface Props {
  years: readonly string[];
  selectedIndex?: number;
  onSelect?: (year: string) => void;
}

interface YearNodeProps {
  year: string;
  index: number;
  width: number;
  scrollIndex: SharedValue<number>;
  itemCount: number;
}

function YearNode({ year, index, width, scrollIndex, itemCount }: YearNodeProps) {
  const animatedStyle = useAnimatedStyle(() => {
    let distance = index - scrollIndex.value;
    if (itemCount > 0) {
      distance = (((distance + itemCount / 2) % itemCount) + itemCount) % itemCount - itemCount / 2;
    }
    const angle = distance * ARC_STEP_RADIANS;
    const radius = Math.min(220, width * ARC_RADIUS_RATIO);
    const x = Math.sin(angle) * radius;
    const y = radius * (1 - Math.cos(angle));
    const normalizedDistance = Math.abs(distance);
    return {
      opacity: interpolate(normalizedDistance, [0, 1.8, 3.4], [1, 0.72, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: x },
        { translateY: y },
        { scale: interpolate(normalizedDistance, [0, 1, 2.4], [1.12, 0.92, 0.72], Extrapolation.CLAMP) },
      ],
    };
  }, [index, itemCount, width]);

  return (
    <Animated.View accessibilityLabel={`${year} 年`} style={[styles.yearNode, animatedStyle]}>
      <Text style={styles.yearText}>{year}</Text>
    </Animated.View>
  );
}

export default function ArcTimelinePrototype({ years, selectedIndex = 0, onSelect }: Props) {
  const { width } = useWindowDimensions();
  const safeIndex = Math.max(0, Math.min(Math.max(0, years.length - 1), selectedIndex));
  const scrollIndex = useSharedValue(safeIndex);
  const gestureStartIndex = useSharedValue(safeIndex);
  const dragOffsetYears = useSharedValue(0);
  const edgeDirection = useSharedValue(0);
  const isDragging = useSharedValue(0);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const nextIndex = wrapArcTimelineIndex(selectedIndex, years.length);
    if (years.length === 0) return;
    const targetIndex = nearestCyclicArcTimelineIndex(nextIndex, scrollIndex.value, years.length);
    scrollIndex.value = withSpring(targetIndex, SPRING_CONFIG);
    dragOffsetYears.value = withSpring(0, SPRING_CONFIG);
  }, [dragOffsetYears, scrollIndex, selectedIndex, years.length]);

  const commitIndex = useCallback((index: number) => {
    const nextIndex = wrapArcTimelineIndex(Math.round(index), years.length);
    const year = years[nextIndex];
    if (year) onSelectRef.current?.(year);
  }, [years]);

  const animateToIndex = useCallback((index: number) => {
    const nextIndex = wrapArcTimelineIndex(Math.round(index), years.length);
    const targetIndex = nearestCyclicArcTimelineIndex(nextIndex, scrollIndex.value, years.length);
    scrollIndex.value = withSpring(targetIndex, SPRING_CONFIG);
    dragOffsetYears.value = withSpring(0, SPRING_CONFIG);
    commitIndex(nextIndex);
  }, [commitIndex, dragOffsetYears, scrollIndex, years.length]);

  useFrameCallback((frame) => {
    if (isDragging.value === 0 || edgeDirection.value === 0) return;
    const elapsedSeconds = Math.min(frame.timeSincePreviousFrame ?? 16, 32) / 1000;
    scrollIndex.value += edgeDirection.value * ARC_TIMELINE_EDGE_SCROLL_YEARS_PER_SECOND * elapsedSeconds;
  });

  const gesture = useMemo(() => Gesture.Pan()
    .activeOffsetX([-6, 6])
    .failOffsetY([-18, 18])
    .onBegin(() => {
      cancelAnimation(scrollIndex);
      cancelAnimation(dragOffsetYears);
      gestureStartIndex.value = scrollIndex.value;
      dragOffsetYears.value = 0;
      edgeDirection.value = 0;
      isDragging.value = 1;
    })
    .onUpdate((event) => {
      const dragYears = event.translationX / ARC_TIMELINE_PIXELS_PER_YEAR;
      dragOffsetYears.value = dragYears;
      scrollIndex.value = arcTimelineIndexFromDrag(
        gestureStartIndex.value,
        event.translationX,
        ARC_TIMELINE_PIXELS_PER_YEAR,
      );
      edgeDirection.value = dragYears > 1.15
        ? 1
        : dragYears < -1.15 ? -1 : 0;
    })
    .onEnd((event) => {
      const projectedIndex = projectedArcTimelineIndex(scrollIndex.value, event.velocityX, years.length);
      const nextIndex = wrapArcTimelineIndex(projectedIndex, years.length);
      const targetIndex = nearestCyclicArcTimelineIndex(nextIndex, scrollIndex.value, years.length);
      isDragging.value = 0;
      edgeDirection.value = 0;
      scrollIndex.value = withSpring(targetIndex, {
        ...SPRING_CONFIG,
        velocity: event.velocityX / ARC_TIMELINE_PIXELS_PER_YEAR,
      });
      dragOffsetYears.value = withSpring(0, {
        ...SPRING_CONFIG,
        velocity: event.velocityX / ARC_TIMELINE_PIXELS_PER_YEAR,
      });
      scheduleOnRN(commitIndex, nextIndex);
    }), [commitIndex, dragOffsetYears, edgeDirection, gestureStartIndex, isDragging, scrollIndex, years.length]);

  const lensStyle = useAnimatedStyle(() => {
    const fractionalIndex = visualArcTimelineDragOffset(dragOffsetYears.value);
    const radius = Math.min(220, width * ARC_RADIUS_RATIO);
    const angle = fractionalIndex * ARC_STEP_RADIANS;
    const distance = Math.abs(fractionalIndex);
    return {
      transform: [
        { translateX: Math.sin(angle) * radius },
        { translateY: radius * (1 - Math.cos(angle)) },
        { scale: interpolate(distance, [0, 0.5], [1, 0.94], Extrapolation.CLAMP) },
      ],
    };
  }, [dragOffsetYears, width]);

  if (years.length === 0) return null;

  return (
    <GestureDetector gesture={gesture}>
      <View accessibilityLabel="弧形时间轴原型" style={styles.root}>
        <View style={styles.arcViewport}>
          <Canvas style={StyleSheet.absoluteFill}>
            <Path
              color="rgba(255,255,252,0.72)"
              path={`M -24 146 Q ${width / 2} 22 ${width + 24} 146`}
              strokeWidth={4}
              style="stroke"
            />
            <Path
              color="rgba(151,98,49,0.7)"
              path={`M -24 146 Q ${width / 2} 22 ${width + 24} 146`}
              strokeWidth={1}
              style="stroke"
            />
          </Canvas>
          {years.map((year, index) => (
            <YearNode key={`${year}-${index}`} index={index} itemCount={years.length} scrollIndex={scrollIndex} width={width} year={year} />
          ))}
          <GestureDetector gesture={gesture}>
            <Animated.View
              accessible
              accessibilityActions={[
                { name: 'increment', label: '后一年度' },
                { name: 'decrement', label: '前一年度' },
              ]}
              accessibilityLabel="中心年份按钮"
              accessibilityRole="adjustable"
              accessibilityValue={{ text: `${years[safeIndex]} 年` }}
              onAccessibilityAction={({ nativeEvent }) => {
                if (nativeEvent.actionName === 'increment') animateToIndex(safeIndex + 1);
                if (nativeEvent.actionName === 'decrement') animateToIndex(safeIndex - 1);
              }}
              style={[styles.lens, lensStyle]}
            >
              <Text style={styles.lensYear}>{years[safeIndex]}</Text>
              <View style={styles.lensInner} />
            </Animated.View>
          </GestureDetector>
        </View>
        <View pointerEvents="none" style={styles.centerLabel}>
          <Text style={styles.centerYear}>{years[safeIndex]}</Text>
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    height: 220,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  arcViewport: {
    position: 'absolute',
    top: 26,
    left: 0,
    right: 0,
    height: 156,
    alignItems: 'center',
  },
  yearNode: {
    position: 'absolute',
    top: 4,
    left: '50%',
    width: 72,
    height: 34,
    marginLeft: -36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearText: {
    color: '#4b443a',
    fontSize: 16,
    lineHeight: 22,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  lens: {
    position: 'absolute',
    top: 54,
    left: '50%',
    width: 66,
    height: 66,
    marginLeft: -33,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(250, 244, 231, 0.94)',
    borderWidth: 2,
    borderColor: '#956033',
    shadowColor: '#4c301e',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  lensInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#a86b36',
    borderWidth: 2,
    borderColor: 'rgba(255, 249, 237, 0.82)',
  },
  lensYear: {
    color: '#50351f',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  centerLabel: {
    position: 'absolute',
    top: 151,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  centerYear: {
    color: '#7b5a3d',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
