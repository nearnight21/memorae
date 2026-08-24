import {
  Image,
  KeyboardAvoidingView,
  PixelRatio,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import type { MemoryLocationV2 } from '../memory/memoryV2';
import { androidTopInset } from '../ui/layout';
import { memoryHeroLayout } from '../ui/memoryOverlayLayout';

export interface MemoryEditValues {
  title: string;
  date: string;
  pastSelf: string;
  presentSelf: string;
  location: MemoryLocationV2 | null;
  photoCount: number;
}

interface Props extends MemoryEditValues {
  mode?: 'create' | 'edit';
  photoUris: readonly (string | null)[];
  busy?: boolean;
  onChange: (field: keyof Omit<MemoryEditValues, 'location' | 'photoCount'>, value: string) => void;
  onLocation: () => void;
  onManagePhotos: () => void;
  onCancel: () => void;
  onSave: () => void;
}

function locationLabel(location: MemoryLocationV2 | null): string {
  if (!location) return '选择地点';
  return [location.city, location.district, location.name].filter(Boolean).join(' · ');
}

function PhotoSheet({ uri, style }: { uri: string | null; style?: object }) {
  return (
    <View style={[styles.photoPaper, style]}>
      <View style={styles.photoInset}>
        {uri
          ? <Image source={{ uri }} style={styles.photoImage} resizeMode="cover" />
          : <View style={styles.photoUnavailable}><Text style={styles.photoUnavailableText}>照片加载中…</Text></View>}
      </View>
      <View style={styles.paperEdge} />
    </View>
  );
}

export default function MemoryEditOverlay({
  mode = 'edit',
  title,
  date,
  pastSelf,
  presentSelf,
  location,
  photoCount,
  photoUris,
  busy = false,
  onChange,
  onLocation,
  onManagePhotos,
  onCancel,
  onSave,
}: Props) {
  const { width, height } = useWindowDimensions();
  const count = Math.max(photoCount, photoUris.length);
  const photos = Array.from({ length: count }, (_, index) => photoUris[index] ?? null);
  const topInset = androidTopInset();
  const { width: heroWidth, height: heroHeight, top: heroTop } = memoryHeroLayout(
    width,
    height,
    topInset,
    PixelRatio.get(),
  );
  const dateLabel = date.replace(/-/g, '.');

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View pointerEvents="none" style={styles.mapReadability} />
      <View pointerEvents="none" style={styles.mapDim} />
      <View pointerEvents="none" style={styles.warmGradient} />
      <View style={[styles.topBar, { top: topInset }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={mode === 'create' ? '退出新建' : '取消编辑'} onPress={onCancel} style={styles.topAction}>
          <Text style={styles.cancelText}>{mode === 'create' ? '退出' : '取消'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={mode === 'create' ? '完成新建' : '保存编辑'} disabled={busy} onPress={onSave} style={styles.topAction}>
          <Text style={[styles.saveText, busy && styles.disabled]}>{busy ? '保存中…' : '完成'}</Text>
        </Pressable>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: heroTop }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {count > 0 && (
          <View style={[styles.photoStage, { width: heroWidth, height: heroHeight + 12 }]}>
            {photos[2] && <PhotoSheet uri={photos[2]} style={[styles.backPaperA, { width: heroWidth - 10, height: heroHeight - 10 }]} />}
            {photos[1] && <PhotoSheet uri={photos[1]} style={[styles.backPaperB, { width: heroWidth - 8, height: heroHeight - 8 }]} />}
            <PhotoSheet uri={photos[0]} style={[styles.heroPaper, { width: heroWidth, height: heroHeight }]} />
          </View>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel="管理照片" onPress={onManagePhotos} style={styles.photoSummary}>
          <Text style={styles.photoSummaryText}>{count > 0 ? `${count} 张 · 管理` : '＋ 添加照片'}</Text>
        </Pressable>
        <View style={[styles.editBody, count === 0 && styles.noPhotoBody]}>
          <View style={styles.titleFocus}>
            <TextInput
              accessibilityLabel="标题"
              value={title}
              onChangeText={(value) => onChange('title', value)}
              style={styles.titleInput}
              placeholder="标题"
              placeholderTextColor="#786a5d"
              selectTextOnFocus
            />
          </View>
          <View style={styles.metaRow}>
            <View style={styles.dateTarget}>
              <TextInput
                accessibilityLabel="日期"
                value={dateLabel}
                onChangeText={(value) => onChange('date', value.replace(/\./g, '-'))}
                style={styles.dateInput}
                placeholder="YYYY.MM.DD"
                placeholderTextColor="#786a5d"
                keyboardType="numbers-and-punctuation"
              />
              <View style={styles.shortUnderline} />
              <Text style={styles.chevron}>⌄</Text>
            </View>
            <Text style={styles.separator}>·</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="编辑地点" onPress={onLocation} style={styles.locationAction}>
              <Text style={styles.locationText} numberOfLines={1}>{locationLabel(location)}</Text>
              <View style={styles.locationUnderline} />
              <Text style={styles.chevron}>⌄</Text>
            </Pressable>
          </View>
          <View style={styles.originalFocus}>
            <TextInput
              accessibilityLabel="当时的我"
              value={pastSelf}
              onChangeText={(value) => onChange('pastSelf', value)}
              style={styles.bodyInput}
              placeholder="当时的我"
              placeholderTextColor="#786a5d"
              multiline
              textAlignVertical="top"
            />
          </View>
          <View style={styles.timeSeparation} />
          <View style={styles.revisitThread}>
            <View style={styles.threadRail}><View style={styles.threadPoint} /><View style={styles.threadLine} /></View>
            <View style={styles.revisitCopy}>
              <Text style={styles.revisitLabel}>现在的我</Text>
              <TextInput
                accessibilityLabel="现在的我"
                value={presentSelf}
                onChangeText={(value) => onChange('presentSelf', value)}
                style={styles.revisitInput}
                placeholder="写下现在的感受"
                placeholderTextColor="rgba(102,88,75,0.56)"
                multiline
                textAlignVertical="top"
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, zIndex: 12, backgroundColor: 'transparent' },
  mapReadability: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(255,255,255,0.34)' },
  mapDim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(42,36,30,0.12)' },
  warmGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '52%', backgroundColor: 'rgba(233,221,202,0.72)' },
  topBar: { position: 'absolute', left: 0, right: 0, height: 44, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 5 },
  topAction: { minWidth: 44, minHeight: 44, justifyContent: 'center' },
  cancelText: { color: 'rgba(101,88,76,0.98)', fontSize: 14, lineHeight: 20, fontWeight: '500' },
  saveText: { color: '#754f31', fontSize: 14, lineHeight: 20, fontWeight: '500', textAlign: 'right' },
  disabled: { opacity: 0.45 },
  scroll: { flex: 1 },
  content: { alignItems: 'center', paddingBottom: 48 },
  photoStage: { alignItems: 'center', justifyContent: 'center' },
  photoPaper: { position: 'absolute', padding: 7, backgroundColor: 'rgba(245,238,226,0.92)', borderWidth: 1, borderColor: 'rgba(215,204,188,0.72)', shadowColor: '#1a140f', shadowOpacity: 0.26, shadowRadius: 8, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  backPaperA: { transform: [{ rotate: '2.2deg' }], top: 16, left: 4 },
  backPaperB: { transform: [{ rotate: '-1.6deg' }], top: 4, left: 2 },
  heroPaper: { transform: [{ rotate: '-0.35deg' }], top: 8 },
  photoInset: { flex: 1, borderWidth: 1, borderColor: 'rgba(255,255,255,0.34)', overflow: 'hidden', backgroundColor: '#dfe4df' },
  photoImage: { width: '100%', height: '100%' },
  paperEdge: { position: 'absolute', left: 7, right: 7, bottom: 8, height: 2, backgroundColor: 'rgba(216,203,185,0.55)' },
  photoUnavailable: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(223,228,223,0.88)' },
  photoUnavailableText: { color: '#746a5d', fontSize: 13 },
  photoSummary: { alignSelf: 'stretch', minHeight: 28, paddingHorizontal: 20, alignItems: 'flex-end', justifyContent: 'center' },
  photoSummaryText: { color: 'rgba(118,105,86,0.95)', fontSize: 12, lineHeight: 20, fontWeight: '500' },
  editBody: { alignSelf: 'stretch', paddingHorizontal: 40, paddingTop: 4, paddingBottom: 24 },
  noPhotoBody: { paddingTop: 76 },
  titleFocus: { alignSelf: 'flex-start', minWidth: 150, minHeight: 37, paddingHorizontal: 0, backgroundColor: 'rgba(201,168,130,0.09)' },
  titleInput: { color: '#27231e', fontSize: 25, lineHeight: 34, fontWeight: '500', padding: 0 },
  metaRow: { flexDirection: 'row', alignItems: 'center', minHeight: 28, marginTop: 1 },
  dateTarget: { position: 'relative', width: 82, height: 26, justifyContent: 'flex-start' },
  dateInput: { color: 'rgba(103,91,77,0.9)', fontSize: 12, lineHeight: 20, fontWeight: '600', padding: 0, paddingRight: 12 },
  shortUnderline: { position: 'absolute', left: 0, bottom: 1, width: 78, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(138,117,97,0.38)' },
  chevron: { position: 'absolute', right: 0, top: 0, color: 'rgba(128,101,78,0.86)', fontSize: 11, lineHeight: 20 },
  separator: { color: 'rgba(103,91,77,0.72)', fontSize: 12, marginHorizontal: 4 },
  locationAction: { position: 'relative', maxWidth: 220, minWidth: 120, height: 26, paddingRight: 16, justifyContent: 'flex-start' },
  locationText: { color: 'rgba(103,91,77,0.9)', fontSize: 12, lineHeight: 20, padding: 0 },
  locationUnderline: { position: 'absolute', left: 0, right: 14, bottom: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(139,96,59,0.46)' },
  originalFocus: { minHeight: 77, marginTop: 4, paddingHorizontal: 4, backgroundColor: 'rgba(201,168,130,0.08)' },
  bodyInput: { minHeight: 70, color: '#40382f', fontSize: 15, lineHeight: 24, padding: 0 },
  timeSeparation: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(133,118,102,0.25)', marginTop: 6 },
  revisitThread: { flexDirection: 'row', minHeight: 100, marginTop: 12, paddingLeft: 12 },
  threadRail: { width: 10, alignItems: 'center' },
  threadPoint: { width: 7, height: 7, borderRadius: 4, marginTop: 4, backgroundColor: '#754f31' },
  threadLine: { flex: 1, width: StyleSheet.hairlineWidth, marginTop: 2, backgroundColor: 'rgba(133,118,102,0.25)' },
  revisitCopy: { flex: 1, paddingLeft: 10 },
  revisitLabel: { color: 'rgba(102,88,75,0.88)', fontSize: 13, lineHeight: 20, fontWeight: '500' },
  revisitInput: { minHeight: 54, color: '#40382f', fontSize: 14, lineHeight: 22, padding: 0, marginTop: 2 },
});
