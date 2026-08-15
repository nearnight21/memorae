import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Map, X } from 'lucide-react';
import type { CategoryType, Memory } from '../types';
import './SimpleRecallV2.css';

interface SimpleRecallV2Props {
  memories: Memory[];
  onClose: () => void;
  onSelectMemory: (memory: Memory) => void;
}

const THEMES: Array<{ value: CategoryType; label: string; description: string }> = [
  { value: 'travel', label: '旅行', description: '走到过的地方' },
  { value: 'growth', label: '成长', description: '正在成为的自己' },
  { value: 'motorcycle', label: '日常', description: '生活里的微光' },
  { value: 'photography', label: '日常 · 瞬间', description: '被留下的片刻' },
];

const coverOf = (memories: Memory[]) => memories.find((memory) => memory.image)?.image || memories.flatMap((memory) => memory.gallery).find(Boolean) || '';

export default function SimpleRecallV2({ memories, onClose, onSelectMemory }: SimpleRecallV2Props) {
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<CategoryType | null>(null);

  const years = useMemo(() => Array.from(new Set(memories.map((memory) => memory.year))).sort((a, b) => b - a), [memories]);
  const visibleYears = selectedYear === null ? years : years.filter((year) => year === selectedYear);
  const selectedThemeInfo = THEMES.find((theme) => theme.value === selectedTheme);
  const list = selectedTheme && selectedYear !== null
    ? memories.filter((memory) => memory.year === selectedYear && memory.category === selectedTheme)
    : [];

  return (
    <section className="simple-recall-v2 fixed inset-0 z-[1100] overflow-y-auto" aria-label="简易回顾">
      <header className="simple-recall-header sticky top-0 z-10 flex items-center justify-between border-b px-6 py-5 sm:px-10">
        <div><p className="simple-recall-kicker">MEMORY RECALL</p><h1 className="font-editorial-serif text-3xl tracking-[0.06em]">简易回顾</h1><p className="simple-recall-muted mt-1 text-xs">按时间回看，再从主题进入记忆</p></div>
        <div className="flex items-center gap-2"><button type="button" onClick={onClose} className="simple-recall-action flex items-center gap-2 rounded-full border px-3 py-2 text-xs cursor-pointer"><Map size={15} />回到地图</button><button type="button" onClick={onClose} aria-label="关闭简易回顾" className="simple-recall-icon rounded-full border p-2 cursor-pointer"><X size={16} /></button></div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8 sm:px-10 sm:py-12">
        {selectedTheme && selectedThemeInfo && selectedYear !== null ? (
          <div>
            <button type="button" onClick={() => setSelectedTheme(null)} className="simple-recall-back mb-8 flex items-center gap-2 text-sm cursor-pointer"><ArrowLeft size={16} />返回主题</button>
            <div className="mb-8 flex items-end justify-between gap-4"><div><p className="simple-recall-kicker">{selectedYear} · 主题列表</p><h2 className="font-editorial-serif text-4xl tracking-[0.05em]">{selectedThemeInfo.label}</h2><p className="simple-recall-muted mt-2 text-sm">{selectedThemeInfo.description} · {list.length} 段记忆</p></div><CalendarDays className="simple-recall-accent h-8 w-8" strokeWidth={1.2} /></div>
            {list.length === 0 ? <div className="simple-recall-empty rounded-2xl border p-10 text-center"><p className="text-sm">这一段时间还没有记忆</p><p className="simple-recall-muted mt-2 text-xs">回到地图继续记录</p></div> : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{list.map((memory) => <button key={memory.id} type="button" onClick={() => onSelectMemory(memory)} className="simple-recall-memory group overflow-hidden rounded-2xl border text-left cursor-pointer"><div className="h-44 overflow-hidden bg-stone-100">{memory.image && <img src={memory.image} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />}</div><div className="p-4"><h3 className="line-clamp-1 font-editorial-serif text-lg">{memory.title}</h3><p className="simple-recall-muted mt-2 font-mono text-[11px]">{memory.date}{memory.tag ? ` · ${memory.tag}` : ''}</p></div></button>)}</div>}
          </div>
        ) : (
          <div className="space-y-12">
            {visibleYears.length === 0 ? <div className="simple-recall-empty rounded-2xl border p-12 text-center"><p>还没有可回顾的记忆</p></div> : visibleYears.map((year) => {
              const yearMemories = memories.filter((memory) => memory.year === year);
              return <section key={year} className="simple-recall-year grid gap-5 md:grid-cols-[150px_1fr]"><div className="simple-recall-year-label md:sticky md:top-32 md:self-start"><p className="simple-recall-kicker">YEAR</p><h2 className="font-editorial-serif text-4xl">{year}</h2><p className="simple-recall-muted mt-1 text-xs">{yearMemories.length} 段记忆</p></div><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{THEMES.map((theme) => { const themeMemories = yearMemories.filter((memory) => memory.category === theme.value); if (!themeMemories.length) return null; return <button key={theme.value} type="button" onClick={() => { setSelectedYear(year); setSelectedTheme(theme.value); }} className="simple-recall-theme group relative min-h-48 overflow-hidden rounded-2xl border text-left cursor-pointer"><div className="absolute inset-0 bg-stone-200">{coverOf(themeMemories) && <img src={coverOf(themeMemories)} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover opacity-80 transition-transform duration-500 group-hover:scale-[1.05]" />}</div><div className="simple-recall-theme-scrim absolute inset-0" /><div className="relative flex min-h-48 flex-col justify-end p-4 text-white"><span className="text-xs tracking-[0.12em]">{theme.label}</span><strong className="mt-1 font-editorial-serif text-xl">{theme.description}</strong><span className="mt-2 flex items-center gap-1 text-[11px] opacity-85">{themeMemories.length} 段记忆 <ArrowRight size={13} /></span></div></button>; })}</div></section>;
            })}
          </div>
        )}
      </div>
    </section>
  );
}
