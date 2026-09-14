import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

interface Props {
  isMoving?: boolean;
}

/**
 * 手账复古金属选点指示器（Pin）
 * 采用经典水滴泪珠造型与象牙白内芯，针尖严格锚定在正下方中心 (0, 0)。
 * 伴随地图拖动提供物理悬浮与落地弹跳（Spring Bounce）反馈。
 */
export default function RetroMetalPin({ isMoving = false }: Props) {
  const liftProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isMoving) {
      Animated.spring(liftProgress, {
        toValue: 1,
        tension: 85,
        friction: 8,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.spring(liftProgress, {
        toValue: 0,
        tension: 135,
        friction: 5.2, // 清脆弹跳：下落 -> 触地轻弹 -> 扎定
        useNativeDriver: true,
      }).start();
    }
  }, [isMoving, liftProgress]);

  const pinTranslateY = liftProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -16],
  });

  const pinRotate = liftProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-5deg'],
  });

  const shadowScale = liftProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.62],
  });

  const shadowOpacity = liftProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.38, 0.16],
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

      {/* 悬浮弹跳图钉主体 */}
      <Animated.View
        style={[
          styles.pinWrapper,
          {
            transform: [
              { translateY: pinTranslateY },
              { rotate: pinRotate },
            ],
          },
        ]}
      >
        {/* 水滴金属头部：旋转 -45 度的圆角方块形成经典朝下水滴 */}
        <View style={styles.teardropOuter}>
          <View style={styles.teardropInner}>
            <View style={styles.centerPearl} />
          </View>
        </View>

        {/* 底部高精金属触地针尖 */}
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
    top: -2,
    width: 20,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2A241E',
  },
  pinWrapper: {
    position: 'absolute',
    bottom: 0,
    alignItems: 'center',
    // 针尖底部恰好对准 (0, 0)
    width: 32,
    height: 46,
    justifyContent: 'flex-end',
  },
  teardropOuter: {
    width: 28,
    height: 28,
    backgroundColor: '#C89B6D',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 0,
    transform: [{ rotate: '-45deg' }],
    borderWidth: 2,
    borderColor: '#7A5230',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1F1710',
    shadowOpacity: 0.32,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  teardropInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FAF6EE',
    borderWidth: 1.5,
    borderColor: 'rgba(122, 82, 48, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerPearl: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#8B5A2B',
  },
  needleShaft: {
    width: 2.5,
    height: 9,
    backgroundColor: '#6A4423',
    alignItems: 'center',
    marginTop: -2,
    borderRadius: 1,
  },
  needleTip: {
    position: 'absolute',
    bottom: 0,
    width: 1.5,
    height: 3,
    backgroundColor: '#4A2E16',
    borderBottomLeftRadius: 0.75,
    borderBottomRightRadius: 0.75,
  },
});
