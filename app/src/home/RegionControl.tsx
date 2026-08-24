import { Pressable, StyleSheet, Text } from 'react-native';

interface Props {
  label: string;
  onPress?: () => void;
  expanded?: boolean;
}

export default function RegionControl({ label, onPress, expanded = false }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="选择地区"
      accessibilityState={{ expanded }}
      onPress={onPress}
      style={({ pressed }) => [styles.root, pressed && styles.pressed]}
    >
      <Text numberOfLines={1} style={styles.label}>{label}</Text>
      <Text style={styles.chevron}>{expanded ? '⌃' : '⌄'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    width: 144,
    height: 34,
    borderRadius: 18,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(246,245,240,0.68)',
    shadowColor: '#262926',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  label: { flex: 1, color: '#3c403d', fontSize: 14, lineHeight: 20, fontWeight: '500' },
  chevron: { color: '#7b837d', fontSize: 16, lineHeight: 18 },
  pressed: { opacity: 0.72 },
});
