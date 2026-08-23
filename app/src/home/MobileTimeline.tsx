import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

interface Props {
  years: string[];
  selectedYear: string | null;
  onSelect: (year: string | null) => void;
}

export default function MobileTimeline({ years, selectedYear, onSelect }: Props) {
  if (years.length === 0) return null;
  return (
    <View style={styles.root}>
      <View style={styles.line} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Pressable accessibilityRole="button" accessibilityLabel="显示全部年份" onPress={() => onSelect(null)} style={styles.yearItem}>
          <View style={[styles.dot, selectedYear === null && styles.activeDot]} />
          <Text style={[styles.year, selectedYear === null && styles.activeYear]}>全部</Text>
        </Pressable>
        {years.map((year) => (
          <Pressable key={year} accessibilityRole="button" accessibilityLabel={`筛选 ${year} 年`} onPress={() => onSelect(year)} style={styles.yearItem}>
            <View style={[styles.dot, selectedYear === year && styles.activeDot]} />
            <Text style={[styles.year, selectedYear === year && styles.activeYear]}>{year}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    height: 72,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(240,241,235,0.78)',
    shadowColor: '#262926',
    shadowOpacity: 0.1,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  line: { position: 'absolute', left: 22, right: 22, top: 27, height: 1, backgroundColor: '#bec7c2' },
  content: { minWidth: '100%', paddingHorizontal: 18, alignItems: 'center', justifyContent: 'space-between', gap: 18 },
  yearItem: { minWidth: 42, height: 64, alignItems: 'center', justifyContent: 'center', gap: 8 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#c1a275', borderWidth: 1, borderColor: '#f0f1eb' },
  activeDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: '#b5814b', borderWidth: 2, borderColor: '#f7f4ed' },
  year: { color: '#7b837d', fontSize: 11, lineHeight: 16 },
  activeYear: { color: '#3c403d', fontWeight: '600' },
});
