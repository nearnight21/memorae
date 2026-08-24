import { useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type { MemoryV2 } from '../memory/memoryV2';
import { androidTopInset } from '../ui/layout';

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

export default function MemoryDetailOverlay({ memory, photoUris, photoStates, onClose, onMore, onPhotoDisplayed }: Props) {
  const { width, height } = useWindowDimensions();
  const [photoIndex, setPhotoIndex] = useState(0);
  const photoOffset = useRef(new Animated.Value(0)).current;
  const photoCount = memory.photos.length;
  const heroWidth = Math.min(width - 32, 358);
  const heroHeight = Math.min(Math.max(height * 0.43, 300), 422);
  const currentUri = photoUris[photoIndex] ?? null;
  const currentState = photoStates[photoIndex] ?? (photoCount > 0 ? 'loading' : 'unavailable');

  const movePhoto = (direction: -1 | 1) => {
    const next = Math.max(0, Math.min(photoCount - 1, photoIndex + direction));
    if (next === photoIndex) {
      Animated.spring(photoOffset, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
      return;
    }
    setPhotoIndex(next);
    Animated.spring(photoOffset, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
  };

  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > Math.abs(gesture.dy) && Math.abs(gesture.dx) > 8,
    onPanResponderMove: (_, gesture) => photoOffset.setValue(gesture.dx),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dx < -48) movePhoto(1);
      else if (gesture.dx > 48) movePhoto(-1);
      else Animated.spring(photoOffset, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
    },
  }), [photoIndex, photoCount, photoOffset]);

  const backA = photoCount > 1 ? photoUris[(photoIndex + photoCount - 1) % photoCount] : null;
  const backB = photoCount > 2 ? photoUris[(photoIndex + 1) % photoCount] : null;

  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={styles.mapDim} />
      <View pointerEvents="none" style={[styles.warmGradient, { top: height * 0.51, height: height * 0.49 }]} />
      <View style={styles.safeArea}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭详情"
            onPress={onClose}
            style={styles.iconButton}
          >
            <Text style={styles.closeIcon}>×</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="更多操作" onPress={onMore} style={styles.iconButton}>
            <Text style={styles.moreIcon}>···</Text>
          </Pressable>
        </View>
        <View style={styles.content}>
          {photoCount > 0 && <View style={[styles.photoStage, { width: heroWidth, height: heroHeight }]} {...responder.panHandlers}>
            {backA && <View style={[styles.photoPaper, styles.backPaperA, { width: heroWidth - 10, height: heroHeight - 10 }]}><View style={styles.photoInset}><Animated.Image source={{ uri: backA }} style={styles.photoImage} resizeMode="cover" onLoad={() => onPhotoDisplayed((photoIndex + photoCount - 1) % photoCount)} /></View></View>}
            {backB && <View style={[styles.photoPaper, styles.backPaperB, { width: heroWidth - 8, height: heroHeight - 8 }]}><View style={styles.photoInset}><Animated.Image source={{ uri: backB }} style={styles.photoImage} resizeMode="cover" onLoad={() => onPhotoDisplayed((photoIndex + 1) % photoCount)} /></View></View>}
            <Animated.View style={[styles.photoPaper, styles.heroPaper, { width: heroWidth, height: heroHeight }, { transform: [{ translateX: photoOffset }] }]}>
              <View style={styles.photoInset}>
                {currentUri && currentState === 'ready' && <Animated.Image source={{ uri: currentUri }} style={styles.photoImage} resizeMode="cover" onLoad={() => onPhotoDisplayed(photoIndex)} />}
                {(!currentUri || currentState !== 'ready') && <View style={styles.photoState}><Text style={styles.photoStateText}>{currentState === 'loading' ? '照片加载中…' : '照片暂不可用'}</Text></View>}
              </View>
            </Animated.View>
          </View>}
          <View style={[styles.textContent, photoCount === 0 && styles.noPhotoTextContent]}>
            <Text style={styles.title} numberOfLines={2}>{memory.title}</Text>
            <Text style={styles.meta}>{formatDate(memory.date)}  ·  {locationLabel(memory)}</Text>
            <View style={styles.thread}>
              <View style={styles.threadRail}><View style={styles.threadPoint}><Text style={styles.threadPointText}>昔</Text></View><View style={styles.threadLine} /><View style={styles.threadPoint}><Text style={styles.threadPointText}>今</Text></View></View>
              <View style={styles.threadCopy}>
                <Text style={styles.threadLabel}>当时的我</Text>
                <Text style={styles.body}>{memory.pastSelf || '没有留下正文。'}</Text>
                {!!memory.presentSelf && <><Text style={[styles.threadLabel, styles.presentLabel]}>现在的我</Text><Text style={styles.body}>{memory.presentSelf}</Text></>}
              </View>
            </View>
          </View>
          {photoCount > 1 && <Text style={styles.pagination}>{photoIndex + 1} / {photoCount}</Text>}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: 'transparent', zIndex: 10 },
  mapDim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(42,36,30,0.12)' },
  warmGradient: { position: 'absolute', left: 0, right: 0, backgroundColor: 'rgba(233,221,202,0.72)' },
  safeArea: { flex: 1, paddingTop: androidTopInset() },
  topBar: { height: 62, paddingHorizontal: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  iconButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(244,236,221,0.84)' },
  closeIcon: { color: '#302a23', fontSize: 27, lineHeight: 29, fontWeight: '600' },
  moreIcon: { color: '#302a23', fontSize: 18, lineHeight: 22, fontWeight: '700', letterSpacing: 1 },
  content: { flex: 1, alignItems: 'center' },
  photoStage: { marginTop: 0, alignItems: 'center', justifyContent: 'center' },
  photoPaper: { position: 'absolute', padding: 7, backgroundColor: 'rgba(245,238,226,0.92)', borderWidth: 1, borderColor: 'rgba(215,204,188,0.72)', shadowColor: '#1a140f', shadowOpacity: 0.26, shadowRadius: 8, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  backPaperA: { transform: [{ rotate: '2deg' }], top: 14, left: 4 },
  backPaperB: { transform: [{ rotate: '-1.6deg' }], top: 4, left: 2 },
  heroPaper: { transform: [{ rotate: '-0.35deg' }], top: 8 },
  photoInset: { flex: 1, borderWidth: 1, borderColor: 'rgba(255,255,255,0.34)', overflow: 'hidden', backgroundColor: '#dfe4df' },
  photoImage: { width: '100%', height: '100%' },
  photoState: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(223,228,223,0.88)' },
  photoStateText: { color: '#746a5d', fontSize: 13 },
  textContent: { width: '100%', paddingHorizontal: 40, paddingTop: 12, paddingBottom: 14 },
  noPhotoTextContent: { paddingTop: 90 },
  title: { color: '#27231e', fontSize: 25, lineHeight: 32, fontWeight: '600' },
  meta: { color: '#6b6258', fontSize: 13, lineHeight: 20, marginTop: 4 },
  thread: { flexDirection: 'row', marginTop: 18 },
  threadRail: { width: 28, alignItems: 'center' },
  threadPoint: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(206,174,126,0.58)' },
  threadPointText: { color: '#754f31', fontSize: 11, fontWeight: '700' },
  threadLine: { flex: 1, width: 1, minHeight: 36, backgroundColor: 'rgba(117,79,49,0.24)' },
  threadCopy: { flex: 1, paddingLeft: 10 },
  threadLabel: { color: '#665b50', fontSize: 11, fontWeight: '700' },
  presentLabel: { marginTop: 16 },
  body: { color: '#40382f', fontSize: 16, lineHeight: 25, marginTop: 3 },
  pagination: { color: '#665b50', fontSize: 12, marginTop: 0 },
});
