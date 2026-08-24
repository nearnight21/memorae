import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Extrapolation,
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import CrystalRailCanvas from './CrystalRailCanvas';
import {
  CRYSTAL_LENS_HEIGHT,
  CRYSTAL_LENS_VIEWPORT_WIDTH,
  CRYSTAL_RAIL_CENTER_Y,
  CRYSTAL_TIMELINE_HEIGHT,
} from './crystalTimelineGeometry';
import {
  buildTimelineItems,
  clampTimelineIndex,
  commitTimelineSelection,
  projectedTimelineIndex,
  resistedTimelineOffset,
  timelineIndexForSelection,
  timelineOffsetForIndex,
  TIMELINE_EDGE_RESISTANCE,
  TIMELINE_ITEM_WIDTH,
  TIMELINE_VELOCITY_PROJECTION_SECONDS,
  type TimelineItem,
} from './timelineModel';

interface Props {
  years: string[];
  selectedYear: string | null;
  onSelect: (year: string | null) => void;
}

interface MovingYearProps {
  item: TimelineItem;
  index: number;
  width: number;
  translateX: SharedValue<number>;
}

const SPRING_CONFIG = {
  stiffness: 245,
  damping: 27,
  mass: 0.78,
  energyThreshold: 0.001,
  reduceMotion: ReduceMotion.System,
} as const;

function MovingYear({ item, index, width, translateX }: MovingYearProps) {
  const animatedLabel = useAnimatedStyle(() => {
    const distance = Math.abs(index * TIMELINE_ITEM_WIDTH + translateX.value);
    const edge = Math.max(TIMELINE_ITEM_WIDTH * 2.5, width / 2);
    return {
      opacity: interpolate(
        distance,
        [0, TIMELINE_ITEM_WIDTH * 0.36, TIMELINE_ITEM_WIDTH, TIMELINE_ITEM_WIDTH * 2, edge],
        [0, 0, 0.72, 0.44, 0.12],
        Extrapolation.CLAMP,
      ),
      transform: [{
        scale: interpolate(
          distance,
          [0, TIMELINE_ITEM_WIDTH, TIMELINE_ITEM_WIDTH * 2, edge],
          [1.04, 1, 0.9, 0.8],
          Extrapolation.CLAMP,
        ),
      }],
    };
  }, [index, width]);
  const animatedTick = useAnimatedStyle(() => {
    const distance = Math.abs(index * TIMELINE_ITEM_WIDTH + translateX.value);
    return {
      opacity: interpolate(
        distance,
        [0, TIMELINE_ITEM_WIDTH * 0.38, TIMELINE_ITEM_WIDTH, width / 2],
        [0, 0.12, 0.82, 0.16],
        Extrapolation.CLAMP,
      ),
      transform: [{
        scaleY: interpolate(
          distance,
          [0, TIMELINE_ITEM_WIDTH, width / 2],
          [0.82, 1, 0.72],
          Extrapolation.CLAMP,
        ),
      }],
    };
  }, [index, width]);

  return (
    <View style={styles.yearCell}>
      <Animated.View style={[styles.tick, animatedTick]} />
      <Animated.Text numberOfLines={1} style={[styles.yearLabel, animatedLabel]}>
        {item.label}
      </Animated.Text>
    </View>
  );
}

function LensYear({ item, index, translateX }: Omit<MovingYearProps, 'width'>) {
  const animatedLabel = useAnimatedStyle(() => {
    const distance = Math.abs(index * TIMELINE_ITEM_WIDTH + translateX.value);
    return {
      opacity: interpolate(
        distance,
        [0, TIMELINE_ITEM_WIDTH * 0.38, TIMELINE_ITEM_WIDTH * 0.72],
        [1, 0.46, 0],
        Extrapolation.CLAMP,
      ),
      transform: [{
        scale: interpolate(
          distance,
          [0, TIMELINE_ITEM_WIDTH * 0.7],
          [1, 0.86],
          Extrapolation.CLAMP,
        ),
      }],
    };
  }, [index]);

  return (
    <View style={styles.lensYearCell}>
      <Animated.Text numberOfLines={1} style={[styles.lensYear, animatedLabel]}>
        {item.label}
      </Animated.Text>
    </View>
  );
}

export default function CrystalTimeline({ years, selectedYear, onSelect }: Props) {
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const items = useMemo(() => buildTimelineItems(years), [years]);
  const selectedIndex = timelineIndexForSelection(items, selectedYear);
  const translateX = useSharedValue(timelineOffsetForIndex(selectedIndex, TIMELINE_ITEM_WIDTH));
  const gestureStartOffset = useSharedValue(translateX.value);
  const pressProgress = useSharedValue(0);
  const snapProgress = useSharedValue(0);
  const highlightOffsetX = useSharedValue(0);
  const currentValueRef = useRef<string | null>(selectedYear);
  const pendingSelectionIndex = useRef<number | null>(null);

  const fireSelectionHaptic = useCallback(() => {
    void Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const commitIndex = useCallback((index: number) => {
    const nextIndex = clampTimelineIndex(index, items.length);
    const nextValue = items[nextIndex]?.value ?? null;
    pendingSelectionIndex.current = nextIndex;
    const committed = commitTimelineSelection(currentValueRef.current, nextValue, onSelect);
    if (committed) currentValueRef.current = nextValue;
  }, [items, onSelect]);

  useEffect(() => {
    currentValueRef.current = selectedYear;
    if (items.length === 0) return;
    if (pendingSelectionIndex.current === selectedIndex) {
      pendingSelectionIndex.current = null;
      return;
    }
    translateX.value = withSpring(
      timelineOffsetForIndex(selectedIndex, TIMELINE_ITEM_WIDTH),
      SPRING_CONFIG,
    );
  }, [items.length, selectedIndex, selectedYear, translateX]);

  const animateFromAccessibility = useCallback((index: number) => {
    if (items.length === 0) return;
    const nextIndex = clampTimelineIndex(index, items.length);
    pendingSelectionIndex.current = nextIndex;
    commitIndex(nextIndex);
    translateX.value = withSpring(
      timelineOffsetForIndex(nextIndex, TIMELINE_ITEM_WIDTH),
      SPRING_CONFIG,
      (finished) => {
        if (finished) scheduleOnRN(fireSelectionHaptic);
      },
    );
  }, [commitIndex, fireSelectionHaptic, items.length, translateX]);

  const gesture = useMemo(() => {
    const resetDuration = reduceMotion ? 0 : 190;
    const pressDuration = reduceMotion ? 0 : 85;
    const snapDuration = reduceMotion ? 0 : 65;
    const pan = Gesture.Pan()
      .activeOffsetX([-8, 8])
      .failOffsetY([-13, 13])
      .onBegin(() => {
        cancelAnimation(translateX);
        gestureStartOffset.value = translateX.value;
        pressProgress.value = withTiming(1, { duration: pressDuration, reduceMotion: ReduceMotion.System });
      })
      .onUpdate((event) => {
        translateX.value = resistedTimelineOffset(
          gestureStartOffset.value + event.translationX,
          items.length,
          TIMELINE_ITEM_WIDTH,
          TIMELINE_EDGE_RESISTANCE,
        );
        highlightOffsetX.value = Math.max(-3, Math.min(3, event.velocityX / 420));
      })
      .onEnd((event) => {
        const nextIndex = projectedTimelineIndex(
          translateX.value,
          event.velocityX,
          items.length,
          TIMELINE_ITEM_WIDTH,
          TIMELINE_VELOCITY_PROJECTION_SECONDS,
        );
        snapProgress.value = withSequence(
          ReduceMotion.System,
          withTiming(1, { duration: snapDuration, reduceMotion: ReduceMotion.System }),
          withSpring(0, SPRING_CONFIG),
        );
        translateX.value = withSpring(
          timelineOffsetForIndex(nextIndex, TIMELINE_ITEM_WIDTH),
          { ...SPRING_CONFIG, velocity: event.velocityX },
          (finished) => {
            if (finished) scheduleOnRN(fireSelectionHaptic);
          },
        );
        scheduleOnRN(commitIndex, nextIndex);
      })
      .onFinalize(() => {
        pressProgress.value = withTiming(0, { duration: resetDuration, reduceMotion: ReduceMotion.System });
        highlightOffsetX.value = withTiming(0, { duration: resetDuration, reduceMotion: ReduceMotion.System });
      });

    const tap = Gesture.Tap()
      .maxDistance(8)
      .onEnd((event, success) => {
        if (!success) return;
        const tappedIndex = clampTimelineIndex(
          (event.x - width / 2 - translateX.value) / TIMELINE_ITEM_WIDTH,
          items.length,
        );
        snapProgress.value = withSequence(
          ReduceMotion.System,
          withTiming(1, { duration: snapDuration, reduceMotion: ReduceMotion.System }),
          withSpring(0, SPRING_CONFIG),
        );
        translateX.value = withSpring(
          timelineOffsetForIndex(tappedIndex, TIMELINE_ITEM_WIDTH),
          SPRING_CONFIG,
          (finished) => {
            if (finished) scheduleOnRN(fireSelectionHaptic);
          },
        );
        scheduleOnRN(commitIndex, tappedIndex);
      });

    return Gesture.Exclusive(pan, tap);
  }, [
    commitIndex,
    fireSelectionHaptic,
    gestureStartOffset,
    highlightOffsetX,
    items.length,
    pressProgress,
    reduceMotion,
    snapProgress,
    translateX,
    width,
  ]);

  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  if (items.length === 0) return null;

  const trackWidth = items.length * TIMELINE_ITEM_WIDTH;
  const centerX = width / 2;

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="记忆年份时间轴"
        accessibilityHint="左右滑动，或使用增加和减少操作切换年份"
        accessibilityValue={{ text: selectedYear ? `${selectedYear} 年` : '全部时间' }}
        accessibilityActions={[
          { name: 'increment', label: '增加年份' },
          { name: 'decrement', label: '减少年份' },
        ]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === 'increment') animateFromAccessibility(selectedIndex + 1);
          if (nativeEvent.actionName === 'decrement') animateFromAccessibility(selectedIndex - 1);
        }}
        style={styles.root}
      >
        <CrystalRailCanvas
          width={width}
          centerX={centerX}
          pressProgress={pressProgress}
          snapProgress={snapProgress}
          highlightOffsetX={highlightOffsetX}
        />

        <Animated.View
          pointerEvents="none"
          style={[
            styles.track,
            { left: centerX - TIMELINE_ITEM_WIDTH / 2, width: trackWidth },
            trackStyle,
          ]}
        >
          {items.map((item, index) => (
            <MovingYear
              key={item.key}
              item={item}
              index={index}
              width={width}
              translateX={translateX}
            />
          ))}
        </Animated.View>

        <View
          pointerEvents="none"
          style={[
            styles.lensViewport,
            { left: centerX - CRYSTAL_LENS_VIEWPORT_WIDTH / 2 },
          ]}
        >
          <Animated.View
            style={[
              styles.lensTrack,
              {
                left: CRYSTAL_LENS_VIEWPORT_WIDTH / 2 - TIMELINE_ITEM_WIDTH / 2,
                width: trackWidth,
              },
              trackStyle,
            ]}
          >
            {items.map((item, index) => (
              <LensYear key={item.key} item={item} index={index} translateX={translateX} />
            ))}
          </Animated.View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    height: CRYSTAL_TIMELINE_HEIGHT,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  track: {
    position: 'absolute',
    top: 0,
    height: CRYSTAL_TIMELINE_HEIGHT,
    flexDirection: 'row',
  },
  yearCell: {
    width: TIMELINE_ITEM_WIDTH,
    height: CRYSTAL_TIMELINE_HEIGHT,
    alignItems: 'center',
  },
  tick: {
    position: 'absolute',
    top: 27,
    width: 1.2,
    height: 16,
    borderRadius: 1,
    backgroundColor: '#9f6228',
  },
  yearLabel: {
    position: 'absolute',
    top: 50,
    minWidth: 58,
    color: '#745f4e',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
    textAlign: 'center',
  },
  lensViewport: {
    position: 'absolute',
    top: CRYSTAL_RAIL_CENTER_Y - CRYSTAL_LENS_HEIGHT / 2,
    width: CRYSTAL_LENS_VIEWPORT_WIDTH,
    height: CRYSTAL_LENS_HEIGHT,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lensTrack: {
    position: 'absolute',
    top: 0,
    height: CRYSTAL_LENS_HEIGHT,
    flexDirection: 'row',
  },
  lensYearCell: {
    width: TIMELINE_ITEM_WIDTH,
    height: CRYSTAL_LENS_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lensYear: {
    minWidth: TIMELINE_ITEM_WIDTH,
    color: '#35291f',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '500',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
});
