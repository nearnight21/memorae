import { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { androidTopInset } from '../ui/layout';

export interface PhotoManageItem {
  id: string;
  mimeType: string;
  uri: string | null;
  pending: boolean;
}

interface Props {
  items: readonly PhotoManageItem[];
  onAddPhoto: () => Promise<PhotoManageItem | null>;
  onCancel: () => void;
  onComplete: (items: PhotoManageItem[]) => void;
}

export default function MemoryPhotoManageOverlay({ items, onAddPhoto, onCancel, onComplete }: Props) {
  const [workingItems, setWorkingItems] = useState<PhotoManageItem[]>(() => [...items]);
  const [busy, setBusy] = useState(false);

  async function addPhoto(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const item = await onAddPhoto();
      if (item) setWorkingItems((current) => [...current, item]);
    } finally {
      setBusy(false);
    }
  }

  function setCover(index: number): void {
    if (index <= 0) return;
    setWorkingItems((current) => [current[index], ...current.slice(0, index), ...current.slice(index + 1)]);
  }

  function removePhoto(index: number): void {
    setWorkingItems((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={styles.mapDim} />
      <View pointerEvents="none" style={styles.warmGradient} />
      <View style={styles.safeArea}>
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="返回编辑" onPress={onCancel} style={styles.topAction}>
            <Text style={styles.cancelText}>返回</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="完成照片管理" onPress={() => onComplete(workingItems)} style={styles.topAction}>
            <Text style={styles.saveText}>完成</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.heading}>管理照片</Text>
          <Text style={styles.hint}>{workingItems.length} 张 · 第一张为封面</Text>
          <View style={styles.grid}>
            {workingItems.map((item, index) => (
              <View key={`${item.id}:${index}`} style={styles.card}>
                <View style={styles.imageFrame}>
                  {item.uri ? <Image source={{ uri: item.uri }} style={styles.image} resizeMode="cover" /> : <Text style={styles.missing}>照片暂不可用</Text>}
                </View>
                <View style={styles.cardActions}>
                  <Pressable accessibilityRole="button" accessibilityLabel={index === 0 ? '当前封面' : '设为封面'} onPress={() => setCover(index)}>
                    <Text style={[styles.actionText, index === 0 && styles.coverText]}>{index === 0 ? '封面' : '设为封面'}</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="删除照片" onPress={() => removePhoto(index)}>
                    <Text style={styles.deleteText}>删除</Text>
                  </Pressable>
                </View>
              </View>
            ))}
            <Pressable accessibilityRole="button" accessibilityLabel="继续添加照片" disabled={busy} onPress={() => void addPhoto()} style={styles.addCard}>
              <Text style={styles.addIcon}>＋</Text>
              <Text style={styles.addText}>{busy ? '处理中…' : '继续添加'}</Text>
            </Pressable>
          </View>
          <View style={styles.rule} />
          <Text style={styles.footerHint}>照片顺序会在编辑保存后生效。</Text>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, zIndex: 14, backgroundColor: 'transparent' },
  mapDim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(42,36,30,0.12)' },
  warmGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '100%', backgroundColor: 'rgba(233,221,202,0.72)' },
  safeArea: { flex: 1, paddingTop: androidTopInset() },
  topBar: { height: 62, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topAction: { minWidth: 54, minHeight: 40, justifyContent: 'center' },
  cancelText: { color: 'rgba(101,88,76,0.98)', fontSize: 14, fontWeight: '500' },
  saveText: { color: '#754f31', fontSize: 14, fontWeight: '500', textAlign: 'right' },
  content: { paddingHorizontal: 28, paddingTop: 10, paddingBottom: 48 },
  heading: { color: '#27231e', fontSize: 25, lineHeight: 34, fontWeight: '600' },
  hint: { color: 'rgba(102,88,75,0.88)', fontSize: 12, marginTop: 4, marginBottom: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { width: '48%', minHeight: 206, padding: 6, backgroundColor: '#f5eee2', borderWidth: 1, borderColor: 'rgba(215,204,188,0.72)', shadowColor: '#1a140f', shadowOpacity: 0.26, shadowRadius: 8, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  imageFrame: { height: 168, borderWidth: 1, borderColor: 'rgba(255,255,255,0.34)', backgroundColor: '#dfe4df', alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  missing: { color: '#746a5d', fontSize: 11, textAlign: 'center' },
  cardActions: { minHeight: 28, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 4 },
  actionText: { color: '#754f31', fontSize: 11 },
  coverText: { fontWeight: '600' },
  deleteText: { color: 'rgba(118,105,86,0.95)', fontSize: 11 },
  addCard: { width: '48%', minHeight: 206, padding: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(181,129,75,0.55)', backgroundColor: 'rgba(245,238,226,0.34)', alignItems: 'center', justifyContent: 'center' },
  addIcon: { color: '#754f31', fontSize: 30, lineHeight: 36 },
  addText: { color: '#754f31', fontSize: 12, marginTop: 4 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(133,118,102,0.25)', marginTop: 22 },
  footerHint: { color: 'rgba(102,88,75,0.88)', fontSize: 12, marginTop: 14 },
});
