import { Pressable, StyleSheet, Text, View } from 'react-native';

interface Props {
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function MemoryDeleteConfirmSheet({ busy = false, onConfirm, onCancel }: Props) {
  return (
    <View style={styles.root}>
      <Pressable accessibilityRole="button" accessibilityLabel="关闭删除确认" onPress={onCancel} style={styles.backdrop} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.heading}>删除这条记忆？</Text>
        <Text style={styles.copy}>照片、文字和全部回望记录都会被删除。{`\n`}此操作无法撤销。</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="确认删除记忆" disabled={busy} onPress={onConfirm} style={[styles.deleteButton, busy && styles.disabled]}>
          <Text style={styles.deleteText}>{busy ? '删除中…' : '删除记忆'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="取消删除" disabled={busy} onPress={onCancel} style={styles.cancelButton}>
          <Text style={styles.cancelText}>取消</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, zIndex: 18 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(26,22,18,0.2)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 270, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#fafaf5', shadowColor: '#2e261c', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: -8 }, elevation: 10 },
  handle: { alignSelf: 'center', width: 34, height: 4, borderRadius: 2, backgroundColor: 'rgba(128,115,97,0.3)' },
  heading: { marginTop: 12, color: '#3c403d', fontSize: 18, lineHeight: 26, fontWeight: '600', textAlign: 'center' },
  copy: { marginTop: 12, color: '#7b837d', fontSize: 13, lineHeight: 22, textAlign: 'center' },
  deleteButton: { minHeight: 52, marginTop: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#7d3c33' },
  deleteText: { color: '#f7f2e8', fontSize: 15, fontWeight: '600' },
  cancelButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: '#7b837d', fontSize: 14 },
  disabled: { opacity: 0.5 },
});
