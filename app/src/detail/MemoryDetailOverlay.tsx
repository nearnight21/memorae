import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  PixelRatio,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type { MemoryV2 } from '../memory/memoryV2';
import { androidTopInset } from '../ui/layout';
import { memoryHeroLayout } from '../ui/memoryOverlayLayout';
import {
  circularPhotoIndex,
  shouldDismissDetail,
  shouldStartDetailDismiss,
  shouldStartPhotoPaging,
} from './detailGestures';

export type DetailPhotoState = 'loading' | 'ready' | 'unavailable';

interface Props {
  memory: MemoryV2;
  photoUris: readonly (string | null)[];
  photoStates: readonly DetailPhotoState[];
  onClose: () => void;
  onMore: () => void;
  onPhotoDisplayed: (index: number) => void;
}

function formatDate(date: string): string {
  return date.replace(/-/g, ' · ');
}

function locationLabel(memory: MemoryV2): string {
  const location = memory.location;
  if (!location) return '未设置地点';
  return [location.city, location.district, location.name].filter(Boolean).join(' · ');
}

export default function MemoryDetailOverlay({
  memory,
  photoUris,
  photoStates,
  onClose,
  onMore,
  onPhotoDisplayed,
}: Props) {
  const { width, height } = useWindowDimensions();
  const [photoIndex, setPhotoIndex] = useState(0);

  // 物理手账动画状态
  const openProgress = useRef(new Animated.Value(0)).current;
  const dismissProgress = useRef(new Animated.Value(0)).current;
  const photoOffset = useRef(new Animated.Value(0)).current;
  const detailOffset = useRef(new Animated.Value(0)).current;
  const detailDismissing = useRef(false);

  const photoCount = memory.photos.length;
  const topInset = androidTopInset();
  const { width: heroWidth, height: heroHeight, top: heroTop } = memoryHeroLayout(
    width,
    height,
    topInset,
    PixelRatio.get(),
  );
  const currentUri = photoUris[photoIndex] ?? null;
  const currentState = photoStates[photoIndex] ?? (photoCount > 0 ? 'loading' : 'unavailable');

  // 入场展开动效：手帐画卷翻开、相纸舒展展开（从容舒展 420ms，带实体透视）
  useEffect(() => {
    Animated.timing(openProgress, {
      toValue: 1,
      duration: 420,
      easing: Easing.bezier(0.2, 0.9, 0.28, 1),
      useNativeDriver: true,
    }).start();
  }, [openProgress]);

  const movePhoto = (direction: -1 | 1) => {
    const next = circularPhotoIndex(photoIndex, direction, photoCount);
    if (next === photoIndex) {
      Animated.spring(photoOffset, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
      return;
    }
    setPhotoIndex(next);
    Animated.spring(photoOffset, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
  };

  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => shouldStartPhotoPaging(gesture.dx, gesture.dy),
    onPanResponderMove: (_, gesture) => photoOffset.setValue(gesture.dx),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dx < -48) movePhoto(1);
      else if (gesture.dx > 48) movePhoto(-1);
      else Animated.spring(photoOffset, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
    },
    onPanResponderTerminate: () => {
      Animated.spring(photoOffset, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
    },
  }), [photoIndex, photoCount, photoOffset]);

  const resetDetailPosition = useCallback(() => {
    Animated.spring(detailOffset, {
      toValue: 0,
      useNativeDriver: true,
      speed: 20,
      bounciness: 4,
    }).start();
  }, [detailOffset]);

  // 物理对折收起（Folio Fold）并加速吸回地图气泡
  const dismissDetail = useCallback((velocity = 0) => {
    if (detailDismissing.current) return;
    detailDismissing.current = true;

    const targetDistance = height * 0.56 + Math.min(Math.max(velocity, 0) * 120, 260);

    Animated.parallel([
      Animated.timing(dismissProgress, {
        toValue: 1,
        duration: 380,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
        useNativeDriver: true,
      }),
      Animated.timing(detailOffset, {
        toValue: targetDistance,
        duration: 380,
        easing: Easing.bezier(0.22, 0.95, 0.32, 1),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        onClose();
        return;
      }
      detailDismissing.current = false;
      resetDetailPosition();
    });
  }, [detailOffset, dismissProgress, height, onClose, resetDetailPosition]);

  const detailResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => shouldStartDetailDismiss(gesture.dx, gesture.dy),
    onPanResponderMove: (_, gesture) => detailOffset.setValue(Math.max(0, gesture.dy)),
    onPanResponderRelease: (_, gesture) => {
      if (shouldDismissDetail(gesture.dy, gesture.vy, height)) dismissDetail(gesture.vy);
      else resetDetailPosition();
    },
    onPanResponderTerminate: resetDetailPosition,
  }), [detailOffset, dismissDetail, height, resetDetailPosition]);

  // 蒙层平滑渐显与提前归零（彻底消除闪烁）
  const backdropFactor = Animated.multiply(
    openProgress,
    dismissProgress.interpolate({
      inputRange: [0, 0.8, 1],
      outputRange: [1, 0, 0],
      extrapolate: 'clamp',
    }),
  );
  const mapDimOpacity = backdropFactor.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.22],
  });
  const warmGradientOpacity = backdropFactor.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.78],
  });

  // 主手账卡片：入场升起 + 下滑微缩小 + 对折收缩后退 + 最终凝聚淡出
  const openTranslateY = openProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [110, 0],
    extrapolate: 'clamp',
  });
  const openScale = openProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.76, 1],
    extrapolate: 'clamp',
  });
  const openOpacity = openProgress.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0, 0.9, 1],
    extrapolate: 'clamp',
  });

  const gestureScale = detailOffset.interpolate({
    inputRange: [0, height * 0.45],
    outputRange: [1, 0.88],
    extrapolate: 'clamp',
  });
  const dismissScale = dismissProgress.interpolate({
    inputRange: [0, 0.38, 1],
    outputRange: [1, 0.60, 0.36],
    extrapolate: 'clamp',
  });
  const dismissOpacity = dismissProgress.interpolate({
    inputRange: [0, 0.68, 1],
    outputRange: [1, 0.88, 0],
    extrapolate: 'clamp',
  });

  // 3D 俯仰角透视（入场时 14deg -> 0deg 迎面展开；退出时 0deg -> 20deg 向内对折）
  const openAngleVal = openProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [14, 0],
    extrapolate: 'clamp',
  });
  const dismissAngleVal = dismissProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 20],
    extrapolate: 'clamp',
  });
  const combinedAngleVal = Animated.add(openAngleVal, dismissAngleVal);
  const cardRotateX = combinedAngleVal.interpolate({
    inputRange: [-360, 360],
    outputRange: ['-360deg', '360deg'],
  });

  const cardTranslateY = Animated.add(openTranslateY, detailOffset);
  const cardScale = Animated.multiply(openScale, Animated.multiply(gestureScale, dismissScale));
  const cardOpacity = Animated.multiply(openOpacity, dismissOpacity);

  // 拍立得相纸展开微旋转
  const rotateA = openProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '3.4deg'],
  });
  const rotateB = openProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-2.6deg'],
  });
  const rotateHero = openProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-0.4deg'],
  });

  const backA = photoCount > 1 ? photoUris[(photoIndex + photoCount - 1) % photoCount] : null;
  const backB = photoCount > 2 ? photoUris[(photoIndex + 1) % photoCount] : null;

  return (
    <View style={styles.root}>
      {/* 沉静暗色背景蒙层，点击外部随手合上手帐 */}
      <Animated.View style={[styles.mapDim, { opacity: mapDimOpacity }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="合上手帐返回地图"
          onPress={() => dismissDetail(0)}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.warmGradient,
          { top: height * 0.51, height: height * 0.49, opacity: warmGradientOpacity },
        ]}
      />

      {/* 实体手账卡片主层 */}
      <Animated.View
        style={[
          styles.cardFolio,
          {
            opacity: cardOpacity,
            transform: [
              { perspective: 1000 },
              { translateY: cardTranslateY },
              { scale: cardScale },
              { rotateX: cardRotateX },
            ],
          },
        ]}
        {...detailResponder.panHandlers}
      >
        <View style={styles.safeArea}>
          <View style={[styles.topBar, { top: topInset }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="更多操作"
              onPress={onMore}
              style={styles.iconButton}
            >
              <Text style={styles.moreIcon}>···</Text>
            </Pressable>
          </View>

          <View style={[styles.content, { paddingTop: heroTop }]}>
            {photoCount > 0 && (
              <View
                style={[styles.photoStage, { width: heroWidth, height: heroHeight }]}
                {...responder.panHandlers}
              >
                {backA && (
                  <Animated.View
                    style={[
                      styles.photoPaper,
                      styles.backPaperA,
                      { width: heroWidth - 10, height: heroHeight - 10, transform: [{ rotate: rotateA }] },
                    ]}
                  >
                    <View style={styles.photoInset}>
                      <Animated.Image
                        source={{ uri: backA }}
                        style={styles.photoImage}
                        resizeMode="cover"
                        onLoad={() => onPhotoDisplayed((photoIndex + photoCount - 1) % photoCount)}
                      />
                    </View>
                  </Animated.View>
                )}

                {backB && (
                  <Animated.View
                    style={[
                      styles.photoPaper,
                      styles.backPaperB,
                      { width: heroWidth - 8, height: heroHeight - 8, transform: [{ rotate: rotateB }] },
                    ]}
                  >
                    <View style={styles.photoInset}>
                      <Animated.Image
                        source={{ uri: backB }}
                        style={styles.photoImage}
                        resizeMode="cover"
                        onLoad={() => onPhotoDisplayed((photoIndex + 1) % photoCount)}
                      />
                    </View>
                  </Animated.View>
                )}

                <Animated.View
                  style={[
                    styles.photoPaper,
                    styles.heroPaper,
                    { width: heroWidth, height: heroHeight, transform: [{ rotate: rotateHero }] },
                  ]}
                >
                  <Animated.View style={{ flex: 1, transform: [{ translateX: photoOffset }] }}>
                    <View style={styles.photoInset}>
                      {currentUri && currentState === 'ready' && (
                        <Animated.Image
                          source={{ uri: currentUri }}
                          style={styles.photoImage}
                          resizeMode="cover"
                          onLoad={() => onPhotoDisplayed(photoIndex)}
                        />
                      )}
                      {(!currentUri || currentState !== 'ready') && (
                        <View style={styles.photoState}>
                          <Text style={styles.photoStateText}>
                            {currentState === 'loading' ? '照片加载中…' : '照片暂不可用'}
                          </Text>
                        </View>
                      )}
                    </View>
                  </Animated.View>
                </Animated.View>
              </View>
            )}

            <View style={[styles.textContent, photoCount === 0 && styles.noPhotoTextContent]}>
              <Text style={styles.title} numberOfLines={2}>
                {memory.title}
              </Text>
              <Text style={styles.meta}>
                {formatDate(memory.date)}  ·  {locationLabel(memory)}
              </Text>
              <View style={styles.thread}>
                <View style={styles.threadRail}>
                  <View style={styles.threadPoint}>
                    <Text style={styles.threadPointText}>昔</Text>
                  </View>
                  <View style={styles.threadLine} />
                  <View style={styles.threadPoint}>
                    <Text style={styles.threadPointText}>今</Text>
                  </View>
                </View>
                <View style={styles.threadCopy}>
                  <Text style={styles.threadLabel}>当时的我</Text>
                  <Text style={styles.body}>{memory.pastSelf || '没有留下正文。'}</Text>
                  {!!memory.presentSelf && (
                    <>
                      <Text style={[styles.threadLabel, styles.presentLabel]}>现在的我</Text>
                      <Text style={styles.body}>{memory.presentSelf}</Text>
                    </>
                  )}
                </View>
              </View>
            </View>

            {photoCount > 1 && (
              <Text style={styles.pagination}>
                {photoIndex + 1} / {photoCount}
              </Text>
            )}
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: 'transparent', zIndex: 10 },
  mapDim: { ...StyleSheet.absoluteFill, backgroundColor: '#1c1712' },
  warmGradient: { position: 'absolute', left: 0, right: 0, backgroundColor: 'rgba(233,221,202,0.72)' },
  cardFolio: { flex: 1 },
  safeArea: { flex: 1 },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 44,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    zIndex: 5,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(244,236,221,0.84)',
  },
  moreIcon: {
    color: '#302a23',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
    letterSpacing: 1,
  },
  content: { flex: 1, alignItems: 'center' },
  photoStage: { alignItems: 'center', justifyContent: 'center' },
  photoPaper: {
    position: 'absolute',
    padding: 7,
    backgroundColor: 'rgba(248,242,232,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(215,204,188,0.78)',
    shadowColor: '#1a140f',
    shadowOpacity: 0.24,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
    borderRadius: 3,
  },
  backPaperA: { top: 14, left: 4 },
  backPaperB: { top: 4, left: 2 },
  heroPaper: { top: 8 },
  photoInset: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.42)',
    overflow: 'hidden',
    backgroundColor: '#dfe4df',
  },
  photoImage: { width: '100%', height: '100%' },
  photoState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(223,228,223,0.88)',
  },
  photoStateText: { color: '#746a5d', fontSize: 13 },
  textContent: { width: '100%', paddingHorizontal: 40, paddingTop: 12, paddingBottom: 14 },
  noPhotoTextContent: { paddingTop: 90 },
  title: { color: '#27231e', fontSize: 25, lineHeight: 32, fontWeight: '600' },
  meta: { color: '#6b6258', fontSize: 13, lineHeight: 20, marginTop: 4 },
  thread: { flexDirection: 'row', marginTop: 18 },
  threadRail: { width: 28, alignItems: 'center' },
  threadPoint: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(206,174,126,0.58)',
  },
  threadPointText: { color: '#754f31', fontSize: 11, fontWeight: '700' },
  threadLine: { flex: 1, width: 1, minHeight: 36, backgroundColor: 'rgba(117,79,49,0.24)' },
  threadCopy: { flex: 1, paddingLeft: 10 },
  threadLabel: { color: '#665b50', fontSize: 11, fontWeight: '700' },
  presentLabel: { marginTop: 16 },
  body: { color: '#40382f', fontSize: 16, lineHeight: 25, marginTop: 3 },
  pagination: { color: '#665b50', fontSize: 12, marginTop: 0 },
});
