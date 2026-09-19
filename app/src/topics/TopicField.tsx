import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { MemoryTopic } from './topicModel';
import { TopicButton } from './TopicScreens';

export default function TopicField({ topics, ids, onChange, onCreate, disabled }: {
  topics: readonly MemoryTopic[]; ids: readonly string[]; onChange: (ids: string[]) => void;
  onCreate: (name: string) => Promise<string>; disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const known = topics.map((topic) => topic.id);
  async function create() {
    if (saving || disabled) return;
    setSaving(true); setError('');
    try { const id = await onCreate(name); onChange([...new Set([...ids, id])]); setName(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '创建失败，请重试。'); }
    finally { setSaving(false); }
  }
  return <View style={styles.root}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} disabled={disabled} onPress={() => setExpanded(!expanded)} style={styles.header}><Text style={styles.label}>主题</Text><Text style={styles.hint}>{expanded ? '收起 ▴' : ids.length ? `${ids.length} 个主题 · 编辑 ▾` : '加入主题 ▾'}</Text></Pressable>
    <View style={styles.chips}>{(expanded ? topics.map((topic) => topic.id) : [...ids]).map((id) => <Pressable key={id} accessibilityRole="checkbox" accessibilityState={{ checked: ids.includes(id) }} disabled={disabled || saving} onPress={() => onChange(ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id])} style={[styles.chip, ids.includes(id) && styles.selected]}><Text style={styles.chipText}>{ids.includes(id) ? '✓ ' : '＋ '}{topics.find((topic) => topic.id === id)?.name ?? '未知主题'}</Text></Pressable>)}</View>
    {expanded && <>
      {ids.filter((id) => !known.includes(id)).map((id) => <TopicButton key={id} quiet label="移除未知主题关联" disabled={disabled} onPress={() => onChange(ids.filter((item) => item !== id))} />)}
      <View style={styles.create}><TextInput accessibilityLabel="新建主题名称" value={name} onChangeText={setName} maxLength={40} placeholder="新建主题名称" style={styles.input} editable={!saving && !disabled} /><TopicButton label={saving ? '创建中…' : '新建'} disabled={!name.trim() || saving || disabled} onPress={() => void create()} /></View>
    </>}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
  root: { marginVertical: 16, gap: 10 }, header: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, label: { color: '#5a655f', fontSize: 15 }, hint: { color: '#587b87', fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center', borderWidth: 1, borderColor: '#c7cfc9' }, selected: { backgroundColor: '#dce8e8', borderColor: '#8eaeb5' }, chipText: { color: '#4a6b74', fontSize: 13 }, create: { flexDirection: 'row', gap: 10 }, input: { flex: 1, minHeight: 44, borderBottomWidth: 1, borderColor: '#9faeaa', color: '#394a4c' }, error: { color: '#a74d3d', fontSize: 13 },
});
