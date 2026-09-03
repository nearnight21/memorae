import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Canvas, Path } from '@shopify/react-native-skia';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  ReduceMotion,
  useFrameCallback,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
  ARC_TIMELINE_PIXELS_PER_YEAR,
  ARC_TIMELINE_GESTURE_SPEED,
  arcTimelineButtonIndex,
  arcTimelineIndexFromDrag,
  arcTimelineMaxDragYears,
  nearestCyclicArcTimelineIndex,
  projectedArcTimelineIndex,
  resolveArcTimelineEdgeDirection,
  visualArcTimelineDragOffset,
  wrapArcTimelineYearIndex,
} from './arcTimelineModel';

const ARC_RADIUS_RATIO = 0.54;
const ARC_STEP_RADIANS = 0.32;
const ARC_TIMELINE_EDGE_SCROLL_YEARS_PER_SECOND = ARC_TIMELINE_GESTURE_SPEED;
const SPRING_CONFIG = {
  stiffness: 250,
  damping: 28,
  mass: 0.78,
  energyThreshold: 0.001,
  reduceMotion: ReduceMotion.System,
} as const;
const RETURN_CONFIG = {
  duration: 260,
  easing: Easing.out(Easing.cubic),
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
  highlightedIndex: SharedValue<number>;
  itemCount: number;
}

function YearNode({ year, index, width, scrollIndex, highlightedIndex, itemCount }: YearNodeProps) {
  const animatedStyle = useAnimatedStyle(() => {
    let distance = index - scrollIndex.value;
    if (itemCount > 0) {
      const wrapped = (distance + itemCount / 2) % itemCount;
      distance = (wrapped < 0 ? wrapped + itemCount : wrapped) - itemCount / 2;
    }
    const angle = distance * ARC_STEP_RADIANS;
    const radius = Math.min(220, width * ARC_RADIUS_RATIO);
    const x = Math.sin(angle) * radius;
    const y = radius * (1 - Math.cos(angle));
    const normalizedDistance = Math.abs(distance);
    const isHighlighted = index === highlightedIndex.value;
    const baseScale = interpolate(normalizedDistance, [0, 1, 2.4], [1.12, 0.92, 0.72], Extrapolation.CLAMP);
    return {
      opacity: isHighlighted ? 1 : interpolate(normalizedDistance, [0, 1.8, 3.4], [1, 0.72, 0], Extrapolation.CLAMP),
      zIndex: isHighlighted ? 2 : 0,
      transform: [
        { translateX: x },
        { translateY: y },
        { scale: baseScale * (isHighlighted ? 1.1 : 1) },
      ],
    };
  }, [highlightedIndex, index, itemCount, scrollIndex, width]);

  const highlightedTextStyle = useAnimatedStyle(() => {
    const isHighlighted = index === highlightedIndex.value;
    return {
      color: isHighlighted ? '#3f2b1d' : '#4b443a',
      fontWeight: isHighlighted ? '800' : '600',
    };
  }, [highlightedIndex, index]);

  return (
    <Animated.View accessibilityLabel={`${year} 年`} style={[styles.yearNode, animatedStyle]}>
      <Animated.Text style={[styles.yearText, highlightedTextStyle]}>{year}</Animated.Text>
    </Animated.View>
  );
}

export default function ArcTimelinePrototype({ years, selectedIndex = 0, onSelect }: Props) {
  const { width } = useWindowDimensions();
  const maximumDragYears = useMemo(() => arcTimelineMaxDragYears(width), [width]);
  const safeIndex = Math.max(0, Math.min(Math.max(0, years.length - 1), selectedIndex));
  const [displayIndex, setDisplayIndex] = useState(safeIndex);
  const scrollIndex = useSharedValue(safeIndex);
  const gestureStartIndex = useSharedValue(safeIndex);
  const dragOffsetYears = useSharedValue(0);
  const edgeScrollOffset = useSharedValue(0);
  const edgeDirection = useSharedValue(0);
  const isDragging = useSharedValue(0);
  const releaseProgress = useSharedValue(0);
  const releaseTargetIndex = useSharedValue(0);
  const releaseCommitted = useSharedValue(0);
  const highlightedIndex = useDerivedValue(
    () => arcTimelineButtonIndex(scrollIndex.value, dragOffsetYears.value, years.length, maximumDragYears),
    [dragOffsetYears, maximumDragYears, scrollIndex, years.length],
  );
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const updateDisplayIndex = useCallback((index: number) => {
    setDisplayIndex((current) => current === index ? current : index);
  }, []);

  useAnimatedReaction(
    () => highlightedIndex.value,
    (nextIndex, previousIndex) => {
      if (nextIndex !== previousIndex) scheduleOnRN(updateDisplayIndex, nextIndex);
    },
    [highlightedIndex, updateDisplayIndex],
  );

  useEffect(() => {
    if (years.length === 0) return;
    const nextIndex = wrapArcTimelineYearIndex(selectedIndex, years.length, 0);
    const targetIndex = nearestCyclicArcTimelineIndex(nextIndex, scrollIndex.value, years.length, 0);
    scrollIndex.value = withSpring(targetIndex, SPRING_CONFIG);
    dragOffsetYears.value = withSpring(0, SPRING_CONFIG);
  }, [dragOffsetYears, scrollIndex, selectedIndex, years.length]);

  const commitIndex = useCallback((index: number) => {
    const nextIndex = wrapArcTimelineYearIndex(Math.round(index), years.length, 0);
    const year = years[nextIndex];
    if (year) onSelectRef.current?.(year);
  }, [years]);

  useAnimatedReaction(
    () => releaseProgress.value,
    (progress, previousProgress) => {
      if (progress >= 1 && (previousProgress === null || previousProgress < 1) && releaseCommitted.value === 0) {
        releaseCommitted.value = 1;
        scheduleOnRN(commitIndex, releaseTargetIndex.value);
      }
    },
    [commitIndex, releaseCommitted, releaseProgress, releaseTargetIndex],
  );

  const animateToIndex = useCallback((index: number) => {
    const nextIndex = wrapArcTimelineYearIndex(Math.round(index), years.length, 0);
    const targetIndex = nearestCyclicArcTimelineIndex(nextIndex, scrollIndex.value, years.length, 0);
    edgeScrollOffset.value = 0;
    scrollIndex.value = withSpring(targetIndex, SPRING_CONFIG);
    dragOffsetYears.value = withSpring(0, SPRING_CONFIG);
    commitIndex(nextIndex);
  }, [commitIndex, dragOffsetYears, edgeScrollOffset, scrollIndex, years.length]);

  useFrameCallback((frame) => {
    if (isDragging.value === 0 || edgeDirection.value === 0) return;
    const elapsedSeconds = Math.min(frame.timeSincePreviousFrame ?? 16, 32) / 1000;
    edgeScrollOffset.value += edgeDirection.value * 2 * elapsedSeconds;
    scrollIndex.value = arcTimelineIndexFromDrag(
      gestureStartIndex.value,
      0,
      76,
      edgeScrollOffset.value,
    );
  });

  const gesture = useMemo(() => Gesture.Pan()
    .activeOffsetX([-6, 6])
    .failOffsetY([-18, 18])
    .onBegin(() => {
      cancelAnimation(scrollIndex);
      cancelAnimation(dragOffsetYears);
      cancelAnimation(releaseProgress);
      gestureStartIndex.value = scrollIndex.value;
      dragOffsetYears.value = 0;
      edgeScrollOffset.value = 0;
      edgeDirection.value = 0;
      isDragging.value = 1;
      releaseProgress.value = 0;
    })
    .onUpdate((event) => {
      const dragYears = event.translationX / 76 * 2;
      dragOffsetYears.value = dragYears;
      scrollIndex.value = arcTimelineIndexFromDrag(
        gestureStartIndex.value,
        0,
        76,
        edgeScrollOffset.value,
      );
      edgeDirection.value = resolveArcTimelineEdgeDirection(
        edgeDirection.value,
        dragYears,
        maximumDragYears,
        maximumDragYears * 0.74,
      );
    })
    .onEnd((event) => {
      const wasEdgeScrolling = edgeDirection.value !== 0;
      const buttonIndex = scrollIndex.value + visualArcTimelineDragOffset(
        dragOffsetYears.value,
        maximumDragYears,
      );
      const releaseVelocity = wasEdgeScrolling ? 0 : event.velocityX * 2;
      const projectedIndex = projectedArcTimelineIndex(
        buttonIndex,
        releaseVelocity,
        years.length,
        76,
        0.12,
      );
      const nextIndex = wrapArcTimelineYearIndex(projectedIndex, years.length, 0);
      const targetIndex = nearestCyclicArcTimelineIndex(nextIndex, buttonIndex, years.length, 0);
      isDragging.value = 0;
      edgeDirection.value = 0;
      edgeScrollOffset.value = 0;
      releaseTargetIndex.value = nextIndex;
      releaseCommitted.value = 0;
      releaseProgress.value = withTiming(1, RETURN_CONFIG);
      scrollIndex.value = withTiming(targetIndex, RETURN_CONFIG);
      dragOffsetYears.value = withTiming(0, RETURN_CONFIG);
    }), [commitIndex, dragOffsetYears, edgeDirection, edgeScrollOffset, gestureStartIndex, isDragging, maximumDragYears, releaseCommitted, releaseProgress, releaseTargetIndex, scrollIndex, years.length]);

  const lensStyle = useAnimatedStyle(() => {
    const fractionalIndex = visualArcTimelineDragOffset(dragOffsetYears.value, maximumDragYears);
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
  }, [dragOffsetYears, maximumDragYears, width]);

  if (years.length === 0) return null;

  return (
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
            <YearNode
              key={`${year}-${index}`}
              highlightedIndex={highlightedIndex}
              index={index}
              itemCount={years.length}
              scrollIndex={scrollIndex}
              width={width}
              year={year}
            />
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
              accessibilityValue={{ text: `${years[displayIndex]} 年` }}
              onAccessibilityAction={({ nativeEvent }) => {
                if (nativeEvent.actionName === 'increment') animateToIndex(displayIndex + 1);
                if (nativeEvent.actionName === 'decrement') animateToIndex(displayIndex - 1);
              }}
              style={[styles.lens, lensStyle]}
            >
              <Text style={styles.lensYear}>{years[displayIndex]}</Text>
              <View style={styles.lensInner} />
            </Animated.View>
          </GestureDetector>
        </View>
        <View pointerEvents="none" style={styles.centerLabel}>
          <Text style={styles.centerYear}>{years[displayIndex]}</Text>
        </View>
    </View>
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
