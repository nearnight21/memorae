import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { MemoryLocationV2 } from '../memory/memoryV2';
import { androidTopInset } from '../ui/layout';

export interface MemoryEditValues {
  title: string;
  date: string;
  pastSelf: string;
  presentSelf: string;
  location: MemoryLocationV2 | null;
  photoCount: number;
}

interface Props extends MemoryEditValues {
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

export default function MemoryEditOverlay({
  title,
  date,
  pastSelf,
  presentSelf,
  location,
  photoCount,
  busy = false,
  onChange,
  onLocation,
  onManagePhotos,
  onCancel,
  onSave,
}: Props) {
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View pointerEvents="none" style={styles.mapDim} />
      <View pointerEvents="none" style={styles.warmGradient} />
      <View style={styles.safeArea}>
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="取消编辑" onPress={onCancel} style={styles.topAction}>
            <Text style={styles.cancelText}>取消</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="保存编辑" disabled={busy} onPress={onSave} style={styles.topAction}>
            <Text style={[styles.saveText, busy && styles.disabled]}>{busy ? '保存中…' : '完成'}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable accessibilityRole="button" accessibilityLabel="管理照片" onPress={onManagePhotos} style={styles.photoSummary}>
            <Text style={styles.photoSummaryTitle}>{photoCount} 张照片</Text>
            <Text style={styles.photoSummaryAction}>管理</Text>
          </Pressable>
          <TextInput
            accessibilityLabel="标题"
            value={title}
            onChangeText={(value) => onChange('title', value)}
            style={[styles.titleInput, styles.underlineInput]}
            placeholder="标题"
            placeholderTextColor="#786a5d"
            selectTextOnFocus
          />
          <View style={styles.metaRow}>
            <TextInput
              accessibilityLabel="日期"
              value={date}
              onChangeText={(value) => onChange('date', value)}
              style={[styles.dateInput, styles.underlineInput]}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#786a5d"
              keyboardType="numbers-and-punctuation"
            />
            <Pressable accessibilityRole="button" accessibilityLabel="编辑地点" onPress={onLocation} style={styles.locationAction}>
              <Text style={styles.locationText} numberOfLines={1}>{locationLabel(location)}</Text>
            </Pressable>
          </View>
          <TextInput
            accessibilityLabel="当时的我"
            value={pastSelf}
            onChangeText={(value) => onChange('pastSelf', value)}
            style={[styles.bodyInput, styles.underlineInput]}
            placeholder="当时的我"
            placeholderTextColor="#786a5d"
            multiline
            textAlignVertical="top"
          />
          <TextInput
            accessibilityLabel="现在的我"
            value={presentSelf}
            onChangeText={(value) => onChange('presentSelf', value)}
            style={[styles.bodyInput, styles.underlineInput]}
            placeholder="现在的我"
            placeholderTextColor="#786a5d"
            multiline
            textAlignVertical="top"
          />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, zIndex: 12, backgroundColor: 'transparent' },
  mapDim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(42,36,30,0.12)' },
  warmGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '52%', backgroundColor: 'rgba(233,221,202,0.72)' },
  safeArea: { flex: 1, paddingTop: androidTopInset() },
  topBar: { height: 62, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topAction: { minWidth: 54, minHeight: 40, justifyContent: 'center' },
  cancelText: { color: 'rgba(101,88,76,0.98)', fontSize: 14, fontWeight: '500' },
  saveText: { color: '#754f31', fontSize: 14, fontWeight: '500', textAlign: 'right' },
  disabled: { opacity: 0.45 },
  content: { paddingHorizontal: 28, paddingTop: 8, paddingBottom: 48, gap: 14 },
  photoSummary: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, minHeight: 30 },
  photoSummaryTitle: { color: 'rgba(118,105,86,0.95)', fontSize: 12, fontWeight: '500' },
  photoSummaryAction: { color: '#754f31', fontSize: 12, fontWeight: '600' },
  titleInput: { color: '#27231e', fontSize: 25, lineHeight: 34, fontWeight: '600', paddingVertical: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dateInput: { flex: 0.32, color: 'rgba(103,91,77,0.9)', fontSize: 12, fontWeight: '600', paddingVertical: 4 },
  locationAction: { flex: 1, minWidth: 0, paddingVertical: 8 },
  locationText: { color: 'rgba(103,91,77,0.9)', fontSize: 12 },
  underlineInput: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(139,96,59,0.46)' },
  bodyInput: { minHeight: 92, color: '#40382f', fontSize: 15, lineHeight: 24, paddingVertical: 6 },
});
