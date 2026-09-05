import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Canvas, Path } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
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
  ARC_TIMELINE_GESTURE_CREATE,
  ARC_TIMELINE_GESTURE_HORIZONTAL,
  ARC_TIMELINE_GESTURE_PENDING,
  ARC_TIMELINE_GESTURE_RESET_MAP,
  ARC_TIMELINE_GESTURE_SPEED,
  ARC_TIMELINE_PIXELS_PER_YEAR,
  CREATE_PULL_ACTIVATION_DISTANCE,
  CREATE_PULL_INTENT_THRESHOLD,
  CREATE_PULL_MAX_DISTANCE,
  arcTimelineButtonIndex,
  arcTimelineIndexFromDrag,
  arcTimelineMaxDragYears,
  clampArcTimelineIndex,
  buildTimelineItems,
  commitTimelineSelection,
  createPullDisplayDistance,
  createPullProgress as resolveCreatePullProgress,
  isCreatePullArmed,
  isResetPullArmed,
  nearestCyclicArcTimelineIndex,
  projectedArcTimelineIndex,
  resolveArcTimelineGestureMode,
  resolveArcTimelineEdgeDirection,
  resolveCreatePullRelease,
  resolveResetPullRelease,
  resetPullDisplayDistance,
  resetPullProgress as resolveResetPullProgress,
  visualArcTimelineDragOffset,
  timelineIndexForSelection,
  type ArcTimelineGestureMode,
  type TimelineItem,
  wrapArcTimelineYearIndex,
} from './timelineModel';

interface Props {
  years: string[];
  selectedYear: string | null;
  onSelect: (year: string | null) => void;
  onCreateMemory?: () => void;
  createPullProgress: SharedValue<number>;
  onResetMapView?: () => void;
  resetPullProgress: SharedValue<number>;
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
const CREATE_CONFIRM_CONFIG = {
  duration: 110,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.System,
} as const;
const CREATE_OVERLAY_RETURN_CONFIG = {
  duration: 170,
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

export default function ArcTimeline({
  years,
  selectedYear,
  onSelect,
  onCreateMemory,
  createPullProgress,
  onResetMapView,
  resetPullProgress,
}: Props) {
  const { width } = useWindowDimensions();
  const items = useMemo(() => buildTimelineItems(years), [years]);
  const currentYear = String(new Date().getFullYear());
  const currentYearIndex = timelineIndexForSelection(items, currentYear);
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
  const gestureMode = useSharedValue<ArcTimelineGestureMode>(ARC_TIMELINE_GESTURE_PENDING);
  const createPullOffsetY = useSharedValue(0);
  const createPullArmed = useSharedValue(0);
  const createHapticTriggered = useSharedValue(0);
  const createCommitted = useSharedValue(0);
  const resetPullOffsetY = useSharedValue(0);
  const resetPullArmed = useSharedValue(0);
  const resetHapticTriggered = useSharedValue(0);
  const resetCommitted = useSharedValue(0);
  const doubleTapScale = useSharedValue(1);
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

  const triggerCreateOnce = useCallback(() => {
    onCreateMemory?.();
  }, [onCreateMemory]);

  const triggerCreateHaptic = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }, []);

  const triggerResetOnce = useCallback(() => {
    onResetMapView?.();
  }, [onResetMapView]);

  const selectCurrentYear = useCallback(() => {
    pendingSelectionIndex.current = currentYearIndex;
    currentValueRef.current = currentYear;
    onSelect(currentYear);
  }, [currentYear, currentYearIndex, onSelect]);

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

  useEffect(() => () => {
    createPullProgress.value = 0;
    resetPullProgress.value = 0;
  }, [createPullProgress, resetPullProgress]);

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
    edgeScrollOffset.value += edgeDirection.value * ARC_EDGE_SCROLL_YEARS_PER_SECOND * elapsedSeconds;
    scrollIndex.value = arcTimelineIndexFromDrag(gestureStartIndex.value, 0, 76, edgeScrollOffset.value);
  });

  const panGesture = useMemo(() => Gesture.Pan()
    .minDistance(CREATE_PULL_INTENT_THRESHOLD)
    .onStart(() => {
      cancelAnimation(scrollIndex);
      cancelAnimation(dragOffsetYears);
      cancelAnimation(releaseProgress);
      cancelAnimation(createPullOffsetY);
      cancelAnimation(createPullProgress);
      cancelAnimation(resetPullOffsetY);
      cancelAnimation(resetPullProgress);
      gestureStartIndex.value = scrollIndex.value;
      dragOffsetYears.value = 0;
      edgeScrollOffset.value = 0;
      edgeDirection.value = 0;
      isDragging.value = 0;
      releaseProgress.value = 0;
      gestureMode.value = ARC_TIMELINE_GESTURE_PENDING;
      createPullOffsetY.value = 0;
      createPullProgress.value = 0;
      createPullArmed.value = 0;
      createHapticTriggered.value = 0;
      createCommitted.value = 0;
      resetPullOffsetY.value = 0;
      resetPullProgress.value = 0;
      resetPullArmed.value = 0;
      resetHapticTriggered.value = 0;
      resetCommitted.value = 0;
    })
    .onUpdate((event) => {
      const nextMode = resolveArcTimelineGestureMode(
        gestureMode.value,
        event.translationX,
        event.translationY,
      );
      gestureMode.value = nextMode;
      if (nextMode === ARC_TIMELINE_GESTURE_CREATE) {
        isDragging.value = 0;
        edgeDirection.value = 0;
        edgeScrollOffset.value = 0;
        dragOffsetYears.value = 0;
        createPullOffsetY.value = -createPullDisplayDistance(event.translationY);
        createPullProgress.value = resolveCreatePullProgress(nextMode, event.translationY);
        const nextArmed = isCreatePullArmed(nextMode, event.translationY) ? 1 : 0;
        if (nextArmed === 1 && createHapticTriggered.value === 0) {
          createHapticTriggered.value = 1;
          scheduleOnRN(triggerCreateHaptic);
        }
        createPullArmed.value = nextArmed;
        return;
      }
      if (nextMode === ARC_TIMELINE_GESTURE_RESET_MAP) {
        isDragging.value = 0;
        edgeDirection.value = 0;
        edgeScrollOffset.value = 0;
        dragOffsetYears.value = 0;
        resetPullOffsetY.value = resetPullDisplayDistance(event.translationY);
        resetPullProgress.value = resolveResetPullProgress(nextMode, event.translationY);
        const nextArmed = isResetPullArmed(nextMode, event.translationY) ? 1 : 0;
        if (nextArmed === 1 && resetHapticTriggered.value === 0) {
          resetHapticTriggered.value = 1;
          scheduleOnRN(triggerCreateHaptic);
        }
        resetPullArmed.value = nextArmed;
        return;
      }
      if (nextMode !== ARC_TIMELINE_GESTURE_HORIZONTAL) return;
      isDragging.value = 1;
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
      const resolvedMode = gestureMode.value;
      const wasEdgeScrolling = edgeDirection.value !== 0;
      gestureMode.value = ARC_TIMELINE_GESTURE_PENDING;
      isDragging.value = 0;
      edgeDirection.value = 0;
      edgeScrollOffset.value = 0;
      if (resolvedMode === ARC_TIMELINE_GESTURE_CREATE) {
        const releaseAction = resolveCreatePullRelease(
          resolvedMode,
          createPullArmed.value === 1,
          createCommitted.value !== 0,
        );
        if (releaseAction === 'create') {
          createCommitted.value = 1;
          createPullArmed.value = 1;
          scheduleOnRN(triggerCreateOnce);
          createPullProgress.value = withTiming(1, CREATE_CONFIRM_CONFIG);
          createPullOffsetY.value = withTiming(
            -Math.min(CREATE_PULL_MAX_DISTANCE, CREATE_PULL_ACTIVATION_DISTANCE + 8),
            CREATE_CONFIRM_CONFIG,
            () => {
              createPullOffsetY.value = withSpring(0, SPRING_CONFIG);
              createPullProgress.value = withTiming(0, CREATE_OVERLAY_RETURN_CONFIG);
              createPullArmed.value = 0;
            },
          );
          return;
        }
        createPullOffsetY.value = withSpring(0, SPRING_CONFIG);
        createPullProgress.value = withTiming(0, CREATE_OVERLAY_RETURN_CONFIG);
        createPullArmed.value = 0;
        return;
      }
      if (resolvedMode === ARC_TIMELINE_GESTURE_RESET_MAP) {
        const releaseAction = resolveResetPullRelease(
          resolvedMode,
          resetPullArmed.value === 1,
          resetCommitted.value !== 0,
        );
        if (releaseAction === 'reset') {
          resetCommitted.value = 1;
          scheduleOnRN(triggerResetOnce);
        }
        resetPullOffsetY.value = withSpring(0, SPRING_CONFIG);
        resetPullProgress.value = withTiming(0, CREATE_OVERLAY_RETURN_CONFIG);
        resetPullArmed.value = 0;
        return;
      }
      if (resolvedMode !== ARC_TIMELINE_GESTURE_HORIZONTAL) {
        createPullOffsetY.value = withSpring(0, SPRING_CONFIG);
        createPullProgress.value = withTiming(0, CREATE_OVERLAY_RETURN_CONFIG);
        createPullArmed.value = 0;
        resetPullOffsetY.value = withSpring(0, SPRING_CONFIG);
        resetPullProgress.value = withTiming(0, CREATE_OVERLAY_RETURN_CONFIG);
        resetPullArmed.value = 0;
        return;
      }
      const buttonIndex = scrollIndex.value + visualArcTimelineDragOffset(
        dragOffsetYears.value,
        maximumDragYears,
      );
      const releaseVelocity = wasEdgeScrolling ? 0 : event.velocityX * 2;
      const projectedIndex = projectedArcTimelineIndex(buttonIndex, releaseVelocity, items.length, 76, 0.12);
      const nextIndex = wrapArcTimelineYearIndex(projectedIndex, items.length, firstYearIndex);
      const targetIndex = nearestCyclicArcTimelineIndex(nextIndex, buttonIndex, items.length, firstYearIndex);
      releaseTargetIndex.value = nextIndex;
      releaseCommitted.value = 0;
      releaseProgress.value = withTiming(1, RETURN_CONFIG);
      scrollIndex.value = withTiming(targetIndex, RETURN_CONFIG);
      dragOffsetYears.value = withTiming(0, RETURN_CONFIG);
    })
    .onFinalize((_event, success) => {
      if (success) return;
      gestureMode.value = ARC_TIMELINE_GESTURE_PENDING;
      isDragging.value = 0;
      edgeDirection.value = 0;
      edgeScrollOffset.value = 0;
      dragOffsetYears.value = withSpring(0, SPRING_CONFIG);
      createPullOffsetY.value = withSpring(0, SPRING_CONFIG);
      createPullProgress.value = withTiming(0, CREATE_OVERLAY_RETURN_CONFIG);
      createPullArmed.value = 0;
      resetPullOffsetY.value = withSpring(0, SPRING_CONFIG);
      resetPullProgress.value = withTiming(0, CREATE_OVERLAY_RETURN_CONFIG);
      resetPullArmed.value = 0;
    }), [createCommitted, createHapticTriggered, createPullArmed, createPullOffsetY, createPullProgress, dragOffsetYears, edgeDirection, edgeScrollOffset, firstYearIndex, gestureMode, gestureStartIndex, isDragging, items.length, maximumDragYears, onResetMapView, resetCommitted, resetHapticTriggered, resetPullArmed, resetPullOffsetY, resetPullProgress, releaseCommitted, releaseProgress, releaseTargetIndex, scrollIndex, triggerCreateHaptic, triggerCreateOnce, triggerResetOnce]);

  const doubleTapGesture = useMemo(() => Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(260)
    .maxDuration(220)
    .maxDistance(CREATE_PULL_INTENT_THRESHOLD)
    .onEnd((_event, success) => {
      if (!success || isDragging.value !== 0 || gestureMode.value !== ARC_TIMELINE_GESTURE_PENDING) return;
      cancelAnimation(scrollIndex);
      cancelAnimation(dragOffsetYears);
      cancelAnimation(releaseProgress);
      cancelAnimation(createPullOffsetY);
      cancelAnimation(createPullProgress);
      cancelAnimation(resetPullOffsetY);
      cancelAnimation(resetPullProgress);
      edgeDirection.value = 0;
      edgeScrollOffset.value = 0;
      createPullOffsetY.value = withSpring(0, SPRING_CONFIG);
      createPullProgress.value = withTiming(0, CREATE_OVERLAY_RETURN_CONFIG);
      resetPullOffsetY.value = withSpring(0, SPRING_CONFIG);
      resetPullProgress.value = withTiming(0, CREATE_OVERLAY_RETURN_CONFIG);
      resetPullArmed.value = 0;
      const currentYearTargetIndex = nearestCyclicArcTimelineIndex(
        currentYearIndex,
        scrollIndex.value,
        items.length,
        firstYearIndex,
      );
      scrollIndex.value = withSpring(currentYearTargetIndex, SPRING_CONFIG);
      dragOffsetYears.value = withSpring(0, SPRING_CONFIG);
      doubleTapScale.value = withTiming(0.94, { duration: 70 }, (finished) => {
        if (finished) doubleTapScale.value = withSpring(1, SPRING_CONFIG);
      });
      scheduleOnRN(selectCurrentYear);
    }), [createPullOffsetY, createPullProgress, currentYearIndex, doubleTapScale, dragOffsetYears, edgeDirection, edgeScrollOffset, firstYearIndex, gestureMode, isDragging, items.length, releaseProgress, resetPullArmed, resetPullOffsetY, resetPullProgress, scrollIndex, selectCurrentYear]);

  const gesture = Gesture.Exclusive(doubleTapGesture, panGesture);

  const lensStyle = useAnimatedStyle(() => {
    const fractionalIndex = visualArcTimelineDragOffset(dragOffsetYears.value, maximumDragYears);
    const radius = Math.min(220, width * ARC_RADIUS_RATIO);
    const angle = fractionalIndex * ARC_STEP_RADIANS;
    const distance = Math.abs(fractionalIndex);
    const createScale = interpolate(createPullProgress.value, [0, 1], [1, 1.035], Extrapolation.CLAMP)
      * (createPullArmed.value === 1 ? 1.025 : 1);
    return {
      transform: [
        { translateX: Math.sin(angle) * radius },
        { translateY: radius * (1 - Math.cos(angle)) + createPullOffsetY.value + resetPullOffsetY.value },
        { scale: interpolate(distance, [0, 0.5], [1, 0.94], Extrapolation.CLAMP) * createScale * doubleTapScale.value },
      ],
    };
  }, [createPullArmed, createPullOffsetY, createPullProgress, doubleTapScale, dragOffsetYears, maximumDragYears, resetPullOffsetY, width]);

  const trackStyle = useAnimatedStyle(() => ({
    opacity: interpolate(createPullProgress.value, [0, 0.35, 1], [1, 0.72, 0], Extrapolation.CLAMP),
  }), [createPullProgress]);

  if (items.length === 0) return null;
  const safeDisplayIndex = clampArcTimelineIndex(displayIndex, items.length);

  return (
    <View accessibilityLabel="记忆年份时间轴" style={styles.root}>
      <View style={styles.arcViewport}>
        <Animated.View pointerEvents="none" style={[styles.trackLayer, trackStyle]}>
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
        </Animated.View>
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
    overflow: 'visible',
    backgroundColor: 'transparent',
  },
  arcViewport: {
    position: 'absolute',
    top: 26,
    left: 0,
    right: 0,
    height: 156,
    alignItems: 'center',
    overflow: 'visible',
  },
  trackLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    overflow: 'hidden',
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
    zIndex: 3,
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
