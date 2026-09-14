import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

interface Props {
  isMoving?: boolean;
  selectedTrigger?: number;
}

/**
 * Memorae 水晶晶体选点指示器（Pin）
 * 视觉风格：与底部水晶时间轴、首屏地区控制条等保持高度一致的冰蓝通透水晶玻璃质感。
 * 几何结构：正向上部水晶徽章 + 正向等腰尖锥 + 垂直细针，针尖 100% 垂直指向正下方地面 (0, 0)。
 * 交互动效：拖拽时轻盈悬浮，停稳或选中地点时清脆弹跳扎定。
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
    outputRange: [0.32, 0.12],
  });

  return (
    <View pointerEvents="none" style={styles.anchor}>
      {/* 冰蓝冷青地面接触投影光晕 */}
      <Animated.View
        style={[
          styles.shadow,
          {
            opacity: shadowOpacity,
            transform: [{ scale: shadowScale }],
          },
        ]}
      />

      {/* 悬浮与弹跳水晶图钉主体 */}
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
        {/* 1. 顶部冰蓝水晶圆环徽章（与时间轴/首屏控件同材质） */}
        <View style={styles.crystalRing}>
          <View style={styles.crystalInner}>
            <View style={styles.gemCore} />
          </View>
        </View>

        {/* 2. 中部正向等腰倒三角水晶锥：尖端 100% 朝正下方 */}
        <View style={styles.coneHolder}>
          <View style={styles.coneOuter} />
          <View style={styles.coneInner} />
        </View>

        {/* 3. 底部垂直钛晶细针：直插 (0, 0) 地面 */}
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
    backgroundColor: '#36566b',
  },
  pinWrapper: {
    position: 'absolute',
    bottom: 0,
    alignItems: 'center',
    width: 32,
    height: 48,
    justifyContent: 'flex-end',
  },
  crystalRing: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(235, 245, 250, 0.92)',
    borderWidth: 1.5,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#36566b',
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
    zIndex: 2,
  },
  crystalInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(215, 235, 248, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(153, 194, 231, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gemCore: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#2e4756',
  },
  coneHolder: {
    width: 14,
    height: 10,
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
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'rgba(153, 194, 231, 0.88)',
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
    borderTopColor: 'rgba(240, 248, 253, 0.96)',
  },
  needleShaft: {
    width: 2.2,
    height: 8,
    backgroundColor: '#476d87',
    alignItems: 'center',
    marginTop: -1,
    borderBottomLeftRadius: 1.1,
    borderBottomRightRadius: 1.1,
    zIndex: 0,
  },
  needleTip: {
    position: 'absolute',
    bottom: 0,
    width: 1.4,
    height: 3,
    backgroundColor: '#2e4756',
    borderBottomLeftRadius: 0.7,
    borderBottomRightRadius: 0.7,
  },
});
