import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  tourStepCopy,
  tourStepProgress,
  type OnboardingTourState,
} from './onboardingTourModel';

interface Props {
  state: OnboardingTourState;
  replay?: boolean;
  onSkipStep: () => void;
  onCompleteTour: () => void;
  onDismissTour: () => void;
}

export default function InteractiveOnboardingTour({
  state,
  replay = false,
  onSkipStep,
  onCompleteTour,
  onDismissTour,
}: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;

  const copy = tourStepCopy(state);
  const progress = tourStepProgress(state.step);
  const isFinalStep = state.step === 'tour_completed';

  useEffect(() => {
    const bounceLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(bounceAnim, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    bounceLoop.start();
    pulseLoop.start();

    return () => {
      bounceLoop.stop();
      pulseLoop.stop();
    };
  }, [bounceAnim, pulseAnim]);

  const translateYBounce = bounceAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -7],
  });

  const translateYDownBounce = bounceAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 7],
  });

  const translateXHorizontal = bounceAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-6, 6],
  });

  const pulseScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.95, 1.35],
  });

  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.75, 0.4, 0],
  });

  // 根据当前步骤自适应卡片在屏幕上的纵向位置，避免遮挡交互热区
  let cardPositionStyle = styles.posAboveTimeline;
  if (state.step === 'guide_location') {
    cardPositionStyle = [styles.posCenter, { marginTop: insets.top + 80 }];
  } else if (state.step === 'pick_location') {
    cardPositionStyle = [styles.posTop, { top: insets.top + 70 }];
  } else if (state.step === 'edit_form') {
    cardPositionStyle = [styles.posTop, { top: insets.top + 55 }];
  } else if (state.step === 'detail_view') {
    cardPositionStyle = [styles.posBottom, { bottom: Math.max(32, insets.bottom + 16) }];
  } else {
    // 主界面时间轴上方
    cardPositionStyle = [styles.posAboveTimeline, { bottom: Math.max(260, insets.bottom + 230) }];
  }

  return (
    <View pointerEvents="box-none" style={styles.root}>
      {/* 视觉手势微动指引层（绝不拦截触摸） */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {state.step === 'pull_create' && (
          <View style={[styles.timelineCenterAnchor, { bottom: Math.max(155, insets.bottom + 125) }]}>
            <Animated.View style={[styles.pulseHalo, { transform: [{ scale: pulseScale }], opacity: pulseOpacity }]} />
            <Animated.View style={[styles.arrowContainer, { transform: [{ translateY: translateYBounce }] }]}>
              <Text style={styles.arrowIcon}>▲</Text>
              <Text style={styles.arrowLabel}>向上拉动</Text>
            </Animated.View>
          </View>
        )}

        {state.step === 'timeline_browse' && (
          <View style={[styles.timelineCenterAnchor, { bottom: Math.max(155, insets.bottom + 125) }]}>
            <Animated.View style={[styles.arrowContainer, { transform: [{ translateX: translateXHorizontal }] }]}>
              <Text style={styles.arrowHorizontalIcon}>◀ 左右滑动 ▶</Text>
            </Animated.View>
          </View>
        )}

        {state.step === 'timeline_now' && (
          <View style={[styles.timelineCenterAnchor, { bottom: Math.max(155, insets.bottom + 125) }]}>
            <Animated.View style={[styles.pulseHalo, { transform: [{ scale: pulseScale }], opacity: pulseOpacity }]} />
            <Animated.View style={[styles.doubleTapWrap, { transform: [{ translateY: translateYBounce }] }]}>
              <Text style={styles.doubleTapText}>双击中心</Text>
              <Text style={styles.arrowIcon}>▼</Text>
            </Animated.View>
          </View>
        )}

        {state.step === 'timeline_reset_map' && (
          <View style={[styles.timelineCenterAnchor, { bottom: Math.max(155, insets.bottom + 125) }]}>
            <Animated.View style={[styles.pulseHalo, { transform: [{ scale: pulseScale }], opacity: pulseOpacity }]} />
            <Animated.View style={[styles.arrowContainer, { transform: [{ translateY: translateYDownBounce }] }]}>
              <Text style={styles.arrowLabel}>向下拉动</Text>
              <Text style={styles.arrowIcon}>▼</Text>
            </Animated.View>
          </View>
        )}
      </View>

      {/* 引导卡片浮层（仅卡片本身响应点击） */}
      <View pointerEvents="box-none" style={[styles.cardContainer, cardPositionStyle]}>
        <View style={[styles.card, { maxWidth: Math.min(width - 32, 380) }]}>
          <View style={styles.cardHeader}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>{`步骤 ${progress.current}/${progress.total}`}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="退出使用引导"
              onPress={onDismissTour}
              style={styles.dismissButton}
              hitSlop={8}
            >
              <Text style={styles.dismissText}>退出引导</Text>
            </Pressable>
          </View>

          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.hint}>{copy.hint}</Text>

          <View style={styles.cardFooter}>
            {!isFinalStep ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="跳过此步"
                onPress={onSkipStep}
                style={styles.skipStepButton}
                hitSlop={6}
              >
                <Text style={styles.skipStepText}>跳过此步 ›</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="开始探索"
                onPress={onCompleteTour}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>开始探索</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 25,
  },
  cardContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  posAboveTimeline: {
    // 动态在 style 中注入 bottom
  },
  posTop: {
    // 动态在 style 中注入 top
  },
  posCenter: {
    // 动态在 style 中注入 marginTop
  },
  posBottom: {
    // 动态在 style 中注入 bottom
  },
  card: {
    width: '100%',
    backgroundColor: '#faf8f3',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(126,104,80,0.18)',
    shadowColor: '#28362d',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  stepBadge: {
    backgroundColor: 'rgba(92,118,103,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  stepBadgeText: {
    color: '#465a4e',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  dismissButton: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  dismissText: {
    color: '#7e8780',
    fontSize: 12,
  },
  title: {
    color: '#2a352e',
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 23,
  },
  hint: {
    marginTop: 6,
    color: '#5e6861',
    fontSize: 13,
    lineHeight: 19,
  },
  cardFooter: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  skipStepButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  skipStepText: {
    color: '#6e8073',
    fontSize: 12,
    fontWeight: '600',
  },
  primaryButton: {
    width: '100%',
    minHeight: 42,
    backgroundColor: '#44584b',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#fcfbf7',
    fontSize: 14,
    fontWeight: '700',
  },
  timelineCenterAnchor: {
    position: 'absolute',
    left: '50%',
    width: 120,
    marginLeft: -60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseHalo: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    borderColor: 'rgba(102,130,114,0.65)',
    backgroundColor: 'rgba(102,130,114,0.12)',
  },
  arrowContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  arrowIcon: {
    fontSize: 13,
    color: '#34463b',
  },
  arrowLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#34463b',
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  arrowHorizontalIcon: {
    fontSize: 11,
    fontWeight: '700',
    color: '#34463b',
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  doubleTapWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -56,
    gap: 2,
  },
  doubleTapText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#34463b',
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
});
