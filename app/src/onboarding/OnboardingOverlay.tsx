import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { androidTopInset } from '../ui/layout';

const mapCanvas = require('../../assets/login/figma-map-canvas.png');
const memoryPhoto = require('../../assets/login/figma-memory-photo.png');
const timePath = require('../../assets/login/figma-time-path.png');

const PAGES = [
  {
    title: '记忆落在地图上',
    body: '照片与地点组成你的记忆地图。点按照片标记，回到当时的现场。',
    visual: 'map' as const,
  },
  {
    title: '沿时间回望',
    body: '左右移动时间轴浏览年份；上拉中心按钮新建记忆，下拉回到默认地图视图。',
    visual: 'timeline' as const,
  },
  {
    title: '记忆属于你',
    body: '文字、照片和地点先在设备端加密。私密空间密码只由你掌握。',
    visual: 'privacy' as const,
  },
];

export default function OnboardingOverlay({ replay, onComplete }: { replay: boolean; onComplete: () => void }) {
  const [index, setIndex] = useState(0);
  const page = PAGES[index];
  const isLast = index === PAGES.length - 1;

  return (
    <View style={styles.root}>
      <Image source={mapCanvas} resizeMode="cover" style={StyleSheet.absoluteFill} />
      <View style={styles.wash} />
      <View style={[styles.topBar, { paddingTop: androidTopInset() + 8 }]}>
        <Text style={styles.brand}>所忆</Text>
        <Pressable accessibilityRole="button" onPress={onComplete} style={styles.closeButton}>
          <Text style={styles.closeText}>{replay ? '关闭' : '跳过'}</Text>
        </Pressable>
      </View>
      <View style={styles.visualStage}>
        {page.visual === 'map' ? (
          <View style={styles.mapFocus}>
            <View style={styles.mapPulse} />
            <Image source={memoryPhoto} resizeMode="cover" style={styles.memoryPhoto} />
          </View>
        ) : page.visual === 'timeline' ? (
          <View style={styles.timelineVisual}>
            <Image source={timePath} resizeMode="stretch" style={styles.timePath} />
            <View style={styles.timelineButton}><Text style={styles.timelineYear}>全部</Text><View style={styles.timelineDot} /></View>
          </View>
        ) : (
          <View style={styles.lockVisual}>
            <View style={styles.lockShackle} />
            <View style={styles.lockBody}><View style={styles.keyhole} /></View>
          </View>
        )}
      </View>
      <View style={styles.copyArea}>
        <Text style={styles.title}>{page.title}</Text>
        <Text style={styles.body}>{page.body}</Text>
        <View style={styles.progress}>
          {PAGES.map((item, pageIndex) => <View key={item.title} style={[styles.progressDot, pageIndex === index && styles.progressDotActive]} />)}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => isLast ? onComplete() : setIndex((current) => current + 1)}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed]}
        >
          <Text style={styles.primaryText}>{isLast ? '开始使用' : '下一步'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, zIndex: 30, backgroundColor: '#f4f1e8' },
  wash: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(246,244,237,0.82)' },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, minHeight: 82, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 3 },
  brand: { color: '#3d443f', fontSize: 20, lineHeight: 28, fontWeight: '600' },
  closeButton: { minWidth: 48, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  closeText: { color: '#758078', fontSize: 13, lineHeight: 20 },
  visualStage: { flex: 1, minHeight: 360, alignItems: 'center', justifyContent: 'center', paddingTop: 86 },
  mapFocus: { width: 230, height: 258, alignItems: 'center', justifyContent: 'center' },
  mapPulse: { position: 'absolute', width: 210, height: 210, borderRadius: 105, backgroundColor: 'rgba(121,151,134,0.16)', borderWidth: 1, borderColor: 'rgba(82,111,94,0.2)' },
  memoryPhoto: { width: 156, height: 182, borderWidth: 8, borderColor: '#f6f0e4', transform: [{ rotate: '-2deg' }] },
  timelineVisual: { width: '90%', height: 220, alignItems: 'center', justifyContent: 'center' },
  timePath: { width: '100%', height: 112 },
  timelineButton: { position: 'absolute', width: 104, height: 104, borderRadius: 52, borderWidth: 2, borderColor: '#9c6c40', backgroundColor: '#f8f4e8', alignItems: 'center', justifyContent: 'center' },
  timelineYear: { color: '#42382f', fontSize: 22, lineHeight: 30, fontWeight: '600' },
  timelineDot: { width: 10, height: 10, marginTop: 6, borderRadius: 5, backgroundColor: '#b7814c' },
  lockVisual: { width: 180, height: 220, alignItems: 'center', justifyContent: 'center' },
  lockShackle: { width: 92, height: 86, borderWidth: 12, borderBottomWidth: 0, borderColor: '#667b6f', borderTopLeftRadius: 46, borderTopRightRadius: 46 },
  lockBody: { width: 132, height: 108, marginTop: -3, borderRadius: 8, backgroundColor: '#667b6f', alignItems: 'center', justifyContent: 'center' },
  keyhole: { width: 15, height: 32, borderRadius: 8, backgroundColor: '#e8dfcf' },
  copyArea: { minHeight: 330, paddingHorizontal: 34, paddingBottom: 36, alignItems: 'center' },
  title: { color: '#343b36', fontSize: 28, lineHeight: 38, fontWeight: '600', textAlign: 'center' },
  body: { maxWidth: 320, minHeight: 70, marginTop: 12, color: '#69736c', fontSize: 15, lineHeight: 25, textAlign: 'center' },
  progress: { height: 26, flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#c9cec9' },
  progressDotActive: { width: 18, backgroundColor: '#9c6c40' },
  primaryButton: { width: '100%', maxWidth: 320, minHeight: 54, marginTop: 14, borderRadius: 8, backgroundColor: '#52655a', alignItems: 'center', justifyContent: 'center' },
  primaryPressed: { opacity: 0.82 },
  primaryText: { color: '#faf8f1', fontSize: 15, lineHeight: 22, fontWeight: '600' },
});
