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
    backgroundColor: 'rgba(245,250,252,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    shadowColor: '#36566b',
    shadowOpacity: 0.14,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  label: { flex: 1, color: '#35404a', fontSize: 14, lineHeight: 20, fontWeight: '600' },
  chevron: { color: '#71818c', fontSize: 16, lineHeight: 18 },
  pressed: { opacity: 0.72 },
});
