import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

interface Props {
  isMoving?: boolean;
  selectedTrigger?: number;
}

/**
 * 手账复古金属选点指示器（Pin）
 * 结构：上部金属圆环徽章 + 中部正向下尖锥 + 下部垂直细针。
 * 针尖 100% 垂直指向正下方地面中心 (0, 0)，绝无偏斜。
 * 支持地图拖拽时悬浮抬起，停稳或选中时提供清脆的弹簧扎地（Bounce）反馈。
 */
export default function RetroMetalPin({ isMoving = false, selectedTrigger = 0 }: Props) {
  const liftAnim = useRef(new Animated.Value(0)).current;
  const stampAnim = useRef(new Animated.Value(0)).current;
  const isFirstMount = useRef(true);

  // 响应地图拖拽与停稳
  useEffect(() => {
    if (isMoving) {
      Animated.spring(liftAnim, {
        toValue: 1,
        tension: 90,
        friction: 8,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.spring(liftAnim, {
        toValue: 0,
        tension: 140,
        friction: 5.5, // 清脆弹跳：下落 -> 触地轻弹 -> 扎定
        useNativeDriver: true,
      }).start();
    }
  }, [isMoving, liftAnim]);

  // 响应主动选中地点（例如点击搜索候选词或地图点）
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    if (selectedTrigger > 0) {
      stampAnim.setValue(0);
      Animated.sequence([
        Animated.timing(stampAnim, {
          toValue: -14,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.spring(stampAnim, {
          toValue: 0,
          tension: 160,
          friction: 4.8,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [selectedTrigger, stampAnim]);

  const pinTranslateY = liftAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -18],
  });

  const shadowScale = liftAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.58],
  });

  const shadowOpacity = liftAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.38, 0.15],
  });

  return (
    <View pointerEvents="none" style={styles.anchor}>
      {/* 地面接触投影光晕 */}
      <Animated.View
        style={[
          styles.shadow,
          {
            opacity: shadowOpacity,
            transform: [{ scale: shadowScale }],
          },
        ]}
      />

      {/* 悬浮与弹跳图钉主体 */}
      <Animated.View
        style={[
          styles.pinWrapper,
          {
            transform: [
              { translateY: pinTranslateY },
              { translateY: stampAnim },
            ],
          },
        ]}
      >
        {/* 1. 顶部手账复古金属圆环 */}
        <View style={styles.medalRing}>
          <View style={styles.innerPearl}>
            <View style={styles.coreDot} />
          </View>
        </View>

        {/* 2. 中部正向等腰尖锥：尖端 100% 朝正下方 */}
        <View style={styles.coneHolder}>
          <View style={styles.coneOuter} />
          <View style={styles.coneInner} />
        </View>

        {/* 3. 底部垂直金属细针：直插 (0, 0) 地面 */}
        <View style={styles.needleShaft}>
          <View style={styles.needleTip} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  shadow: {
    position: 'absolute',
    top: -3,
    width: 22,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2A241E',
  },
  pinWrapper: {
    position: 'absolute',
    bottom: 0,
    alignItems: 'center',
    width: 32,
    height: 48,
    justifyContent: 'flex-end',
  },
  medalRing: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#C89B6D',
    borderWidth: 2,
    borderColor: '#754F31',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1F1710',
    shadowOpacity: 0.35,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
    zIndex: 2,
  },
  innerPearl: {
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: '#FAF6EE',
    borderWidth: 1.2,
    borderColor: 'rgba(117, 79, 49, 0.42)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coreDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#754F31',
  },
  coneHolder: {
    width: 14,
    height: 11,
    alignItems: 'center',
    marginTop: -3,
    zIndex: 1,
  },
  coneOuter: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 11,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#754F31',
  },
  coneInner: {
    position: 'absolute',
    top: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#C89B6D',
  },
  needleShaft: {
    width: 2.5,
    height: 8,
    backgroundColor: '#5C3D24',
    alignItems: 'center',
    marginTop: -1,
    borderBottomLeftRadius: 1.25,
    borderBottomRightRadius: 1.25,
    zIndex: 0,
  },
  needleTip: {
    position: 'absolute',
    bottom: 0,
    width: 1.5,
    height: 3,
    backgroundColor: '#3E2715',
    borderBottomLeftRadius: 0.75,
    borderBottomRightRadius: 0.75,
  },
});
