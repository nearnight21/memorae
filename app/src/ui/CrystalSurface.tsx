import { BlurMask, Canvas, LinearGradient, RoundedRect, vec } from '@shopify/react-native-skia';
import { StyleSheet } from 'react-native';

interface CrystalSurfaceProps {
  width: number;
  height: number;
  radius?: number;
}

/**
 * 与首页时间轴（ArcTimeline 轨道）同源的冷蓝水晶表面。
 * 色标取自 ArcTimeline.tsx 的轨道渐变与白色上缘高光，保证同一材质家族。
 */
export default function CrystalSurface({ width, height, radius }: CrystalSurfaceProps) {
  if (width <= 0 || height <= 0) return null;
  const r = Math.max(0, Math.min(radius ?? height / 2, Math.min(width, height) / 2));
  const inset = 1.25;
  const innerWidth = Math.max(0, width - inset * 2);
  const innerHeight = Math.max(0, height - inset * 2);
  const innerRadius = Math.max(0, r - inset);

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* 主体：冷蓝凹槽向下渐隐（与时间轴轨道同一组色标，整体提亮一档） */}
      <RoundedRect x={inset} y={inset} width={innerWidth} height={innerHeight} r={innerRadius}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(0, height)}
          colors={[
            'rgba(232,243,249,0.70)',
            'rgba(200,222,236,0.48)',
            'rgba(186,214,230,0.26)',
            'rgba(180,210,228,0)',
          ]}
          positions={[0, 0.2, 0.55, 1]}
        />
      </RoundedRect>
      {/* 凹槽内侧冷蓝阴影，刻画下陷深度 */}
      <RoundedRect
        x={inset}
        y={inset}
        width={innerWidth}
        height={innerHeight}
        r={innerRadius}
        style="stroke"
        strokeWidth={2.6}
        color="rgba(14,38,66,0.14)"
      >
        <BlurMask blur={2} style="normal" />
      </RoundedRect>
      {/* 明亮上缘高光 */}
      <RoundedRect
        x={1}
        y={1}
        width={Math.max(0, width - 2)}
        height={Math.max(0, height - 2)}
        r={Math.max(0, r - 1)}
        style="stroke"
        strokeWidth={1.4}
        color="rgba(255,255,255,0.98)"
      />
    </Canvas>
  );
}
