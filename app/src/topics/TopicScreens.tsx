import { useMemo, useState } from 'react';
import { FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTopInset } from '../ui/layout';
import type { MemoryV2 } from '../memory/memoryV2';
import type { MemoryThumbnailSources } from '../map/memoryMapAdapter';
import { resolveMapThumbnail } from '../map/mapThumbnailCache';
import { memoriesInTopic, recentTopics, topicBadge, topicSummary, type MemoryTopic, type TopicCollection } from './topicModel';

export type TopicRoute = 'center' | 'list';
interface Props {
  route: TopicRoute;
  collection: TopicCollection;
  selectedTopicId: string | null;
  memories: readonly MemoryV2[];
  thumbnails: MemoryThumbnailSources;
  hidden?: boolean;
  loadError?: string;
  onClose: () => void;
  onSelect: (id: string | null) => void;
  onCreate: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAttach: (ids: string[]) => Promise<void>;
  onDetach: (id: string) => Promise<void>;
  onOpenMemory: (memory: MemoryV2) => void;
  onRecord: () => void;
}
export function TopicBadge({ name, id, uri, large = false }: { name: string; id: string; uri?: string; large?: boolean }) {
  const badge = topicBadge(name, id);
  return <View style={[styles.badge, large && styles.largeBadge, { backgroundColor: badge.color }]}>
    {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <Text style={styles.initial}>{badge.initial}</Text>}
  </View>;
}
export function TopicButton({ label, onPress, disabled = false, quiet = false }: { label: string; onPress: () => void; disabled?: boolean; quiet?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, quiet && styles.quietButton, (pressed || disabled) && styles.dim]}>
    <Text style={[styles.buttonText, quiet && styles.quietText]}>{label}</Text>
  </Pressable>;
}

export default function TopicScreens(props: Props) {
  const { route, collection, selectedTopicId, memories, thumbnails } = props;
  const top = useAppTopInset();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [editor, setEditor] = useState<{ kind: 'create' | 'rename' | 'delete'; topic?: MemoryTopic } | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const topic = collection.topics.find((item) => item.id === selectedTopicId);
  const scoped = useMemo(() => memoriesInTopic(memories, selectedTopicId), [memories, selectedTopicId]);
  const stats = topicSummary(scoped);
  const [scope, setScope] = useState<'in' | 'out'>(scoped.length === 0 ? 'out' : 'in');
  const query = search.trim().toLocaleLowerCase();
  const matches = (memory: MemoryV2) => (
    `${memory.title} ${memory.location?.name ?? ''} ${memory.date}`.toLocaleLowerCase().includes(query)
  );
  const topics = recentTopics(collection).filter((item) => item.name.toLocaleLowerCase().includes(query));
  const removable = useMemo(() => (
    scoped.filter(matches).sort((a, b) => b.date.localeCompare(a.date))
  ), [scoped, query]);
  const addableAll = useMemo(() => (
    memories.filter((memory) => !selectedTopicId || !memory.topicIds?.includes(selectedTopicId))
  ), [memories, selectedTopicId]);
  const addable = useMemo(() => (
    addableAll.filter(matches).sort((a, b) => b.date.localeCompare(a.date))
  ), [addableAll, query]);
  const rows = scope === 'in' ? removable : addable;
  const selectedIds = selected.filter((id) => addableAll.some((memory) => memory.id === id));
  const center = route === 'center';

  async function perform(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError('');
    try { await action(); setEditor(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '操作未完成，请重试。'); }
    finally { setBusy(false); }
  }
  function edit(kind: 'create' | 'rename' | 'delete', item?: MemoryTopic) {
    setName(item?.name ?? ''); setEditor({ kind, topic: item }); setError('');
  }
  function cover(items: readonly MemoryV2[]) {
    const memory = [...items].sort((a, b) => b.date.localeCompare(a.date)).find((item) => item.photos.length);
    return memory ? thumbnailUri(memory.id) : undefined;
  }
  function thumbnailUri(id: string) {
    const source = thumbnails[id]?.[0];
    return source ? resolveMapThumbnail(source) : undefined;
  }
  return <KeyboardAvoidingView style={[styles.root, { paddingTop: top, paddingBottom: Math.max(insets.bottom, 12) }, props.hidden && styles.hidden]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.toolbar}>
      <TopicButton quiet label={center ? '返回地图' : '返回'} disabled={busy} onPress={props.onClose} />
      <Text style={styles.eyebrow}>{center ? '我的主题' : '管理记忆'}</Text>
      {center ? <TopicButton label="＋ 新建" disabled={busy || Boolean(props.loadError)} onPress={() => edit('create')} /> : <View style={{ width: 60 }} />}
    </View>
    <View style={styles.heading}>
      <Text style={styles.title} numberOfLines={2}>{center ? '把记忆，收进主题' : topic?.name ?? '全部记忆'}</Text>
      <Text style={styles.subtitle}>{center ? '一次旅行，一段时光，一个值得反复回看的故事。' : `${stats.count} 段记忆 · ${stats.placeCount} 个地点${stats.start ? `\n${stats.start} — ${stats.end}` : ''}`}</Text>
    </View>
    <TextInput accessibilityLabel={center ? '搜索主题' : '搜索记忆'} placeholder={center ? '搜索主题' : '搜索标题、地点或日期'} placeholderTextColor="#8d8c86" value={search} onChangeText={setSearch} style={styles.search} />
    {!center && <View style={styles.segments}>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: scope === 'in' }} onPress={() => setScope('in')} style={[styles.segment, scope === 'in' && styles.segmentActive]}>
        <Text style={[styles.segmentText, scope === 'in' && styles.segmentTextActive]}>已加入 {scoped.length}</Text>
      </Pressable>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: scope === 'out' }} onPress={() => setScope('out')} style={[styles.segment, scope === 'out' && styles.segmentActive]}>
        <Text style={[styles.segmentText, scope === 'out' && styles.segmentTextActive]}>未加入 {addableAll.length}</Text>
      </Pressable>
    </View>}
    {(error || props.loadError) ? <Text accessibilityRole="alert" style={styles.error}>{error || props.loadError}</Text> : null}
    {center ? <FlatList
      data={topics} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled"
      ListHeaderComponent={<Pressable accessibilityRole="button" onPress={() => props.onSelect(null)} style={styles.allRow}>
        <TopicBadge name="全部" id="all" /><View style={styles.rowText}><Text style={styles.rowTitle}>全部记忆</Text><Text style={styles.caption}>{memories.length} 段记忆 · 回到完整足迹</Text></View><Text style={styles.arrow}>↗</Text>
      </Pressable>}
      ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>{search ? '没有找到这个主题' : '给珍贵的片段一个归处'}</Text><Text style={styles.subtitle}>{search ? '换一个名称试试。' : '创建第一个主题，加入已有记忆，或直接写下第一段故事。'}</Text>{!search && <TopicButton label="创建第一个主题" disabled={Boolean(props.loadError)} onPress={() => edit('create')} />}</View>}
      renderItem={({ item }) => {
        const items = memoriesInTopic(memories, item.id);
        const summary = topicSummary(items);
        return <View style={[styles.card, selectedTopicId === item.id && styles.activeCard]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`进入主题 ${item.name}，${items.length} 段记忆`} onPress={() => props.onSelect(item.id)} style={styles.topicMain}>
            <TopicBadge name={item.name} id={item.id} uri={cover(items)} large />
            <View style={styles.rowText}><Text style={styles.rowTitle} numberOfLines={2}>{item.name}</Text><Text style={styles.caption}>{items.length} 段记忆 · {summary.placeCount} 个地点</Text><Text style={styles.dates}>{summary.start ? `${summary.start} — ${summary.end}` : '从第一段记忆开始'}</Text></View>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
          <View style={styles.cardActions}><TopicButton quiet label="重命名" disabled={busy} onPress={() => edit('rename', item)} /><TopicButton quiet label="删除主题" disabled={busy} onPress={() => edit('delete', item)} /></View>
        </View>;
      }}
    /> : <FlatList
      data={rows} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled"
      ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>{search ? '没有找到相关记忆' : scope === 'in' ? '这个主题还没有记忆' : '所有记忆都已经加入'}</Text><Text style={styles.subtitle}>{search ? '换个关键词试试。' : scope === 'in' ? '切到"未加入"，把已有记忆收进来。' : '切到"已加入"可以逐条移出。'}</Text></View>}
      renderItem={({ item }) => {
        const isIn = scope === 'in';
        const checked = selectedIds.includes(item.id);
        return <View style={styles.card}>
          <Pressable accessibilityRole={isIn ? 'button' : 'checkbox'} accessibilityState={isIn ? undefined : { checked }} disabled={busy}
            onPress={() => isIn ? props.onOpenMemory(item) : setSelected((ids) => ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id])}
            style={styles.topicMain}>
            <TopicBadge name={item.title} id={item.id} uri={thumbnailUri(item.id)} />
            <View style={styles.rowText}><Text style={styles.rowTitle} numberOfLines={2}>{item.title}</Text><Text style={styles.caption}>{item.date} · {item.location?.name ?? '没有地点'}</Text><Text style={styles.excerpt} numberOfLines={2}>{item.pastSelf || item.presentSelf}</Text></View>
            <Text style={[styles.arrow, checked && styles.checked]}>{isIn ? '›' : checked ? '✓' : '○'}</Text>
          </Pressable>
          {isIn && topic && <View style={styles.cardActions}><TopicButton quiet label="移出" disabled={busy} onPress={() => void perform(() => props.onDetach(item.id))} /></View>}
        </View>;
      }}
    />}
    {!center && <View style={styles.footer}>{scope === 'in' ? <><Text style={styles.caption}>{scoped.length} 段已加入</Text><TopicButton label="＋ 记录" onPress={props.onRecord} /></> : <><Text style={styles.caption}>已选 {selectedIds.length} 段</Text><TopicButton label={busy ? '正在加入…' : '加入主题'} disabled={busy || !selectedIds.length} onPress={() => void perform(async () => { await props.onAttach(selectedIds); setSelected([]); setScope('in'); })} /></>}</View>}
    {editor && <Modal transparent animationType="fade" onRequestClose={() => { if (!busy) { setEditor(null); setError(''); } }}><KeyboardAvoidingView style={styles.scrim} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><View style={styles.dialog}>
      <Text style={styles.emptyTitle}>{editor.kind === 'create' ? '新建主题' : editor.kind === 'rename' ? '重命名主题' : `删除「${editor.topic?.name}」？`}</Text>
      {editor.kind === 'delete' ? <Text style={styles.subtitle}>只解除主题关联，记忆和照片都会保留。</Text> : <TextInput autoFocus accessibilityLabel="主题名称" maxLength={40} placeholder="例如：川藏旅行" value={name} onChangeText={setName} style={styles.nameInput} />}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.footer}><TopicButton quiet label="取消" disabled={busy} onPress={() => { setEditor(null); setError(''); }} /><TopicButton label={busy ? '保存中…' : editor.kind === 'delete' ? '删除主题' : '完成'} disabled={busy || (editor.kind !== 'delete' && !name.trim())} onPress={() => void perform(() => editor.kind === 'create' ? props.onCreate(name) : editor.kind === 'rename' ? props.onRename(editor.topic!.id, name) : props.onDelete(editor.topic!.id))} /></View>
    </View></KeyboardAvoidingView></Modal>}
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, zIndex: 12, backgroundColor: '#f4eddf' }, hidden: { display: 'none' },
  toolbar: { padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, eyebrow: { fontSize: 12, letterSpacing: 2, color: '#7c8179' },
  heading: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 18, gap: 10 }, title: { fontSize: 28, fontWeight: '600', color: '#394a4c', lineHeight: 38 }, subtitle: { fontSize: 14, lineHeight: 23, color: '#7a7d74' },
  search: { backgroundColor: '#fffaf0', marginHorizontal: 24, marginBottom: 12, paddingHorizontal: 16, height: 46, borderRadius: 14, color: '#394a4c', borderWidth: 1, borderColor: '#e3ddcd' },
  segments: { flexDirection: 'row', gap: 10, paddingHorizontal: 24, marginBottom: 14 },
  segment: { flex: 1, minHeight: 44, borderRadius: 22, borderWidth: 1, borderColor: '#e3ddcd', backgroundColor: '#fffaf0', alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: '#527f8e', borderColor: '#527f8e' },
  segmentText: { color: '#587b87', fontSize: 14, fontWeight: '600' },
  segmentTextActive: { color: '#fffaf0' },
  list: { paddingHorizontal: 24, paddingBottom: 28, gap: 12 }, allRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, marginBottom: 6 },
  card: { backgroundColor: '#fffaf0', borderRadius: 20, borderWidth: 1, borderColor: '#e6decd', overflow: 'hidden' }, activeCard: { borderColor: '#7babbc' },
  topicMain: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 96 }, rowText: { flex: 1, gap: 5 }, rowTitle: { fontSize: 17, lineHeight: 24, fontWeight: '600', color: '#394a4c' }, caption: { fontSize: 12, lineHeight: 19, color: '#7a7d74' }, dates: { fontSize: 11, color: '#969386' }, excerpt: { fontSize: 13, lineHeight: 20, color: '#7e776a' }, arrow: { color: '#81999f', fontSize: 16 }, checked: { color: '#356b81', fontWeight: '700' },
  badge: { width: 52, height: 52, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, largeBadge: { width: 72, height: 84, borderRadius: 12 }, initial: { fontSize: 25, color: '#586464' },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 10, paddingBottom: 4 }, button: { minHeight: 44, borderRadius: 22, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#527f8e' }, quietButton: { backgroundColor: 'transparent', paddingHorizontal: 12 }, buttonText: { color: '#fffaf0', fontSize: 14, fontWeight: '600' }, quietText: { color: '#587b87' }, dim: { opacity: 0.45 },
  empty: { paddingVertical: 40, alignItems: 'flex-start', gap: 16 }, emptyTitle: { fontSize: 21, lineHeight: 30, color: '#394a4c', fontWeight: '600' }, footer: { padding: 16, flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'space-between' },
  error: { color: '#a74d3d', paddingHorizontal: 24, paddingVertical: 8, fontSize: 13, lineHeight: 20 }, scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(32,40,40,0.3)', justifyContent: 'center', padding: 24 }, dialog: { backgroundColor: '#fffaf0', padding: 22, borderRadius: 24, gap: 16 }, nameInput: { borderBottomWidth: 1, borderColor: '#bfd0d0', color: '#394a4c', fontSize: 18, minHeight: 50 },
});
