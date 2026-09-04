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
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  useFrameCallback,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
  ARC_TIMELINE_GESTURE_SPEED,
  ARC_TIMELINE_PIXELS_PER_YEAR,
  arcTimelineButtonIndex,
  arcTimelineIndexFromDrag,
  arcTimelineMaxDragYears,
  clampArcTimelineIndex,
  buildTimelineItems,
  commitTimelineSelection,
  nearestCyclicArcTimelineIndex,
  projectedArcTimelineIndex,
  resolveArcTimelineEdgeDirection,
  visualArcTimelineDragOffset,
  timelineIndexForSelection,
  type TimelineItem,
  wrapArcTimelineYearIndex,
} from './timelineModel';

interface Props {
  years: string[];
  selectedYear: string | null;
  onSelect: (year: string | null) => void;
}

interface YearNodeProps {
  item: TimelineItem;
  index: number;
  width: number;
  scrollIndex: SharedValue<number>;
  highlightedIndex: SharedValue<number>;
  itemCount: number;
  firstYearIndex: number;
}

const ARC_RADIUS_RATIO = 0.54;
const ARC_STEP_RADIANS = 0.32;
const ARC_EDGE_SCROLL_YEARS_PER_SECOND = ARC_TIMELINE_GESTURE_SPEED;
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

function YearNode({ item, index, width, scrollIndex, highlightedIndex, itemCount, firstYearIndex }: YearNodeProps) {
  // “全部”由中心按钮承载，不参与年份拱形节点，避免回弹期间出现幽灵节点。
  if (item.value === null) return null;

  const animatedStyle = useAnimatedStyle(() => {
    let distance = index - scrollIndex.value;
    const yearCount = itemCount - firstYearIndex;
    if (index >= firstYearIndex && yearCount > 0) {
      const wrapped = (distance + yearCount / 2) % yearCount;
      distance = ((wrapped < 0 ? wrapped + yearCount : wrapped) - yearCount / 2);
    }
    const radius = Math.min(220, width * ARC_RADIUS_RATIO);
    const angle = distance * ARC_STEP_RADIANS;
    const normalizedDistance = Math.abs(distance);
    const isHighlighted = index === highlightedIndex.value;
    const baseScale = interpolate(normalizedDistance, [0, 1, 2.4], [1.12, 0.92, 0.72], Extrapolation.CLAMP);
    return {
      opacity: isHighlighted ? 1 : interpolate(normalizedDistance, [0, 1.8, 3.4], [1, 0.72, 0], Extrapolation.CLAMP),
      zIndex: isHighlighted ? 2 : 0,
      transform: [
        { translateX: Math.sin(angle) * radius },
        { translateY: radius * (1 - Math.cos(angle)) },
        { scale: baseScale * (isHighlighted ? 1.1 : 1) },
      ],
    };
  }, [firstYearIndex, highlightedIndex, index, itemCount, scrollIndex, width]);

  const highlightedTextStyle = useAnimatedStyle(() => {
    const isHighlighted = index === highlightedIndex.value;
    return {
      color: isHighlighted ? '#3f2b1d' : '#4b443a',
      fontWeight: isHighlighted ? '800' : '600',
    };
  }, [highlightedIndex, index]);

  return (
    <Animated.View accessibilityLabel={`${item.label} 年`} style={[styles.yearNode, animatedStyle]}>
      <Animated.Text style={[styles.yearText, highlightedTextStyle]}>{item.label}</Animated.Text>
    </Animated.View>
  );
}

export default function ArcTimeline({ years, selectedYear, onSelect }: Props) {
  const { width } = useWindowDimensions();
  const items = useMemo(() => buildTimelineItems(years), [years]);
  const selectedIndex = timelineIndexForSelection(items, selectedYear);
  const firstYearIndex = items.length > 1 ? 1 : 0;
  const maximumDragYears = useMemo(() => arcTimelineMaxDragYears(width), [width]);
  const [displayIndex, setDisplayIndex] = useState(selectedIndex);
  const scrollIndex = useSharedValue(selectedIndex);
  const gestureStartIndex = useSharedValue(selectedIndex);
  const dragOffsetYears = useSharedValue(0);
  const edgeScrollOffset = useSharedValue(0);
  const edgeDirection = useSharedValue(0);
  const isDragging = useSharedValue(0);
  const releaseProgress = useSharedValue(0);
  const releaseTargetIndex = useSharedValue(0);
  const releaseCommitted = useSharedValue(0);
  const highlightedIndex = useDerivedValue(
    () => firstYearIndex > 0 && scrollIndex.value === 0 && Math.abs(dragOffsetYears.value) < 0.5
      ? 0
      : arcTimelineButtonIndex(scrollIndex.value, dragOffsetYears.value, items.length, maximumDragYears, firstYearIndex),
    [dragOffsetYears, firstYearIndex, items.length, maximumDragYears, scrollIndex],
  );
  const currentValueRef = useRef<string | null>(selectedYear);
  const pendingSelectionIndex = useRef<number | null>(null);

  const updateDisplayIndex = useCallback((index: number) => {
    setDisplayIndex((current) => current === index ? current : index);
  }, []);

  const commitIndex = useCallback((index: number) => {
    const nextIndex = wrapArcTimelineYearIndex(Math.round(index), items.length, firstYearIndex);
    const nextValue = items[nextIndex]?.value ?? null;
    pendingSelectionIndex.current = nextIndex;
    const committed = commitTimelineSelection(currentValueRef.current, nextValue, onSelect);
    if (committed) currentValueRef.current = nextValue;
  }, [firstYearIndex, items, onSelect]);

  useAnimatedReaction(
    () => highlightedIndex.value,
    (nextIndex, previousIndex) => {
      if (nextIndex !== previousIndex) scheduleOnRN(updateDisplayIndex, nextIndex);
    },
    [highlightedIndex, updateDisplayIndex],
  );

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

  useEffect(() => {
    currentValueRef.current = selectedYear;
    setDisplayIndex(selectedIndex);
    if (items.length === 0) return;
    if (pendingSelectionIndex.current === selectedIndex) {
      pendingSelectionIndex.current = null;
      cancelAnimation(scrollIndex);
      cancelAnimation(dragOffsetYears);
      scrollIndex.value = selectedIndex === 0
        ? 0
        : wrapArcTimelineYearIndex(selectedIndex, items.length, firstYearIndex);
      dragOffsetYears.value = 0;
      return;
    }
    cancelAnimation(scrollIndex);
    cancelAnimation(dragOffsetYears);
    const targetIndex = selectedIndex === 0
      ? 0
      : wrapArcTimelineYearIndex(selectedIndex, items.length, firstYearIndex);
    scrollIndex.value = withSpring(targetIndex, SPRING_CONFIG);
    dragOffsetYears.value = withSpring(0, SPRING_CONFIG);
  }, [dragOffsetYears, firstYearIndex, items.length, scrollIndex, selectedIndex, selectedYear]);

  const animateFromAccessibility = useCallback((index: number) => {
    if (items.length === 0) return;
    const nextIndex = wrapArcTimelineYearIndex(index, items.length, firstYearIndex);
    edgeScrollOffset.value = 0;
    pendingSelectionIndex.current = nextIndex;
    commitIndex(nextIndex);
    scrollIndex.value = withSpring(nearestCyclicArcTimelineIndex(nextIndex, scrollIndex.value, items.length, firstYearIndex), SPRING_CONFIG);
    dragOffsetYears.value = withSpring(0, SPRING_CONFIG);
  }, [commitIndex, dragOffsetYears, edgeScrollOffset, firstYearIndex, items.length, scrollIndex]);

  useFrameCallback((frame) => {
    if (isDragging.value === 0 || edgeDirection.value === 0) return;
    const elapsedSeconds = Math.min(frame.timeSincePreviousFrame ?? 16, 32) / 1000;
    edgeScrollOffset.value += edgeDirection.value * 2 * elapsedSeconds;
    scrollIndex.value = arcTimelineIndexFromDrag(gestureStartIndex.value, 0, 76, edgeScrollOffset.value);
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
      scrollIndex.value = arcTimelineIndexFromDrag(gestureStartIndex.value, 0, 76, edgeScrollOffset.value);
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
      const projectedIndex = projectedArcTimelineIndex(buttonIndex, releaseVelocity, items.length, 76, 0.12);
      const nextIndex = wrapArcTimelineYearIndex(projectedIndex, items.length, firstYearIndex);
      const targetIndex = nearestCyclicArcTimelineIndex(nextIndex, buttonIndex, items.length, firstYearIndex);
      isDragging.value = 0;
      edgeDirection.value = 0;
      edgeScrollOffset.value = 0;
      releaseTargetIndex.value = nextIndex;
      releaseCommitted.value = 0;
      releaseProgress.value = withTiming(1, RETURN_CONFIG);
      scrollIndex.value = withTiming(targetIndex, RETURN_CONFIG);
      dragOffsetYears.value = withTiming(0, RETURN_CONFIG);
    }), [dragOffsetYears, edgeDirection, edgeScrollOffset, firstYearIndex, gestureStartIndex, isDragging, items.length, maximumDragYears, releaseCommitted, releaseProgress, releaseTargetIndex, scrollIndex]);

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

  if (items.length === 0) return null;
  const safeDisplayIndex = clampArcTimelineIndex(displayIndex, items.length);

  return (
    <View accessibilityLabel="记忆年份时间轴" style={styles.root}>
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
        {items.map((item, index) => (
          <YearNode
            key={item.key}
            highlightedIndex={highlightedIndex}
            index={index}
            item={item}
            itemCount={items.length}
            firstYearIndex={firstYearIndex}
            scrollIndex={scrollIndex}
            width={width}
          />
        ))}
        <GestureDetector gesture={gesture}>
          <Animated.View
            accessible
            accessibilityActions={[
              { name: 'increment', label: '增加年份' },
              { name: 'decrement', label: '减少年份' },
            ]}
            accessibilityLabel="中心年份按钮"
            accessibilityRole="adjustable"
            accessibilityValue={{ text: items[safeDisplayIndex]?.value ? `${items[safeDisplayIndex].label} 年` : '全部时间' }}
            onAccessibilityAction={({ nativeEvent }) => {
              if (nativeEvent.actionName === 'increment') animateFromAccessibility(safeDisplayIndex + 1);
              if (nativeEvent.actionName === 'decrement') animateFromAccessibility(safeDisplayIndex - 1);
            }}
            style={[styles.lens, lensStyle]}
          >
            <Text style={styles.lensYear}>{items[safeDisplayIndex]?.label}</Text>
            <View style={styles.lensInner} />
          </Animated.View>
        </GestureDetector>
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
});
