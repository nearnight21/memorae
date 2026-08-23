import { Pressable, StyleSheet, Text, View } from 'react-native';

interface Props {
  onEdit: () => void;
  onDelete: () => void;
  onCancel: () => void;
}

export default function MemoryActionsSheet({ onEdit, onDelete, onCancel }: Props) {
  return (
    <View style={styles.root}>
      <Pressable accessibilityRole="button" accessibilityLabel="关闭更多操作" onPress={onCancel} style={styles.backdrop} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.heading}>更多操作</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="编辑记忆" onPress={onEdit} style={styles.row}>
          <Text style={styles.icon}>✎</Text>
          <Text style={styles.label}>编辑记忆</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <View style={styles.divider} />
        <Pressable accessibilityRole="button" accessibilityLabel="删除这条记忆" onPress={onDelete} style={styles.row}>
          <Text style={styles.icon}>⌫</Text>
          <Text style={styles.dangerLabel}>删除这条记忆</Text>
        </Pressable>
        <View style={styles.divider} />
        <Pressable accessibilityRole="button" accessibilityLabel="取消更多操作" onPress={onCancel} style={styles.cancelRow}>
          <Text style={styles.cancelLabel}>取消</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, zIndex: 16 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(26,22,18,0.16)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 272, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#fafaf5', shadowColor: '#2e261c', shadowOpacity: 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: -8 }, elevation: 10 },
  handle: { alignSelf: 'center', width: 34, height: 4, borderRadius: 2, backgroundColor: 'rgba(128,115,97,0.3)' },
  heading: { marginTop: 12, color: '#3c403d', fontSize: 16, lineHeight: 24, fontWeight: '600', textAlign: 'center' },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, gap: 14 },
  icon: { width: 20, color: '#675a4d', fontSize: 20, textAlign: 'center' },
  label: { flex: 1, color: '#3c403d', fontSize: 15 },
  dangerLabel: { flex: 1, color: '#8a463b', fontSize: 15 },
  chevron: { color: '#7b837d', fontSize: 24, lineHeight: 24 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#bec7c2' },
  cancelRow: { minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  cancelLabel: { color: '#7b837d', fontSize: 14 },
});
