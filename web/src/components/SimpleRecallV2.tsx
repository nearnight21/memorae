import { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { CategoryType, Memory } from '../types';
import './SimpleRecallV2.css';

interface SimpleRecallV2Props {
  memories: Memory[];
  onClose: () => void;
  onSelectMemory: (memory: Memory) => void;
}

type RecallTheme = 'travel' | 'growth' | 'daily';

interface RecallThemeDefinition {
  value: RecallTheme;
  label: string;
  accent: string;
  categories: CategoryType[];
}

const THEMES: RecallThemeDefinition[] = [
  { value: 'travel', label: '旅行', accent: 'travel', categories: ['travel'] },
  { value: 'growth', label: '成长', accent: 'growth', categories: ['growth'] },
  { value: 'daily', label: '日常', accent: 'daily', categories: ['motorcycle', 'photography'] },
];

function timestampOf(memory: Memory) {
  const parsed = Date.parse(memory.date.replace(/\./g, '-'));
  return Number.isNaN(parsed) ? memory.year : parsed;
}

function placeOf(memory: Memory) {
  return memory.city || memory.country || memory.location?.name || memory.detailLocation || '未标注地点';
}

function summaryOf(memory: Memory) {
  return memory.pastSelf.trim() || memory.presentSelf.trim() || memory.tag.trim() || '这段记忆还没有留下文字。';
}

function memoriesForTheme(memories: Memory[], theme: RecallThemeDefinition) {
  return memories
    .filter((memory) => theme.categories.includes(memory.category))
    .sort((left, right) => timestampOf(right) - timestampOf(left));
}

function groupByYear(memories: Memory[]) {
  return memories.reduce<Map<number, Memory[]>>((groups, memory) => {
    const entries = groups.get(memory.year) || [];
    entries.push(memory);
    groups.set(memory.year, entries);
    return groups;
  }, new Map());
}

export default function SimpleRecallV2({ memories, onClose, onSelectMemory }: SimpleRecallV2Props) {
  const [selectedTheme, setSelectedTheme] = useState<RecallTheme | null>(null);

  const years = useMemo(
    () => Array.from(new Set(memories.map((memory) => memory.year))).sort((left, right) => right - left),
    [memories],
  );
  const selectedThemeInfo = THEMES.find((theme) => theme.value === selectedTheme) || null;
  const themeMemories = useMemo(
    () => (selectedThemeInfo ? memoriesForTheme(memories, selectedThemeInfo) : []),
    [memories, selectedThemeInfo],
  );
  const memoriesByYear = useMemo(() => groupByYear(themeMemories), [themeMemories]);

  return (
    <section className="simple-recall-v2" aria-label="简易回顾">
      <div className="simple-recall-shell">
        <header className="simple-recall-header">
          <div>
            <h1>回顾</h1>
            <p className="simple-recall-description">
              {selectedThemeInfo
                ? `${selectedThemeInfo.label} · ${themeMemories.length} 段记忆 · 按时间连续浏览`
                : '按时间回望，也按主题重新发现那些片段'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="simple-recall-return">
            <ArrowLeft size={16} aria-hidden="true" />
            回到足迹
          </button>
        </header>

        {selectedThemeInfo ? (
          <ThemeMemoryList
            theme={selectedThemeInfo}
            memories={themeMemories}
            memoriesByYear={memoriesByYear}
            onChooseTheme={setSelectedTheme}
            onSelectMemory={onSelectMemory}
          />
        ) : (
          <ThemeSummary memories={memories} years={years} onChooseTheme={setSelectedTheme} />
        )}
      </div>
    </section>
  );
}

function ThemeSummary({
  memories,
  years,
  onChooseTheme,
}: {
  memories: Memory[];
  years: number[];
  onChooseTheme: (theme: RecallTheme) => void;
}) {
  return (
    <main className="simple-recall-summary">
      <nav className="simple-recall-year-index" aria-label="回顾包含的年份">
        <span className="simple-recall-year-index-item simple-recall-year-index-current">全部</span>
        {years.map((year) => <span key={year} className="simple-recall-year-index-item">{year}</span>)}
      </nav>

      <section className="simple-recall-theme-section" aria-labelledby="simple-recall-theme-heading">
        <p id="simple-recall-theme-heading" className="simple-recall-section-label">按主题</p>
        <div className="simple-recall-theme-grid">
          {THEMES.map((theme) => {
            const entries = memoriesForTheme(memories, theme);
            return (
              <button
                key={theme.value}
                type="button"
                className={`simple-recall-theme-card simple-recall-theme-card-${theme.accent}`}
                onClick={() => onChooseTheme(theme.value)}
              >
                <span className="simple-recall-theme-accent" aria-hidden="true" />
                <span className="simple-recall-theme-name">{theme.label}</span>
                <span className="simple-recall-theme-count">{entries.length} 段记忆</span>
                <span className="simple-recall-card-divider" aria-hidden="true" />
                <span className="simple-recall-theme-examples">
                  {entries.length === 0 ? <span>还没有记录</span> : entries.slice(0, 2).map((memory) => (
                    <span key={memory.id}>{memory.year} · {memory.title}</span>
                  ))}
                </span>
                <span className="simple-recall-theme-action">查看主题记忆 <span aria-hidden="true">→</span></span>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function ThemeMemoryList({
  theme,
  memories,
  memoriesByYear,
  onChooseTheme,
  onSelectMemory,
}: {
  theme: RecallThemeDefinition;
  memories: Memory[];
  memoriesByYear: Map<number, Memory[]>;
  onChooseTheme: (theme: RecallTheme | null) => void;
  onSelectMemory: (memory: Memory) => void;
}) {
  const years = Array.from(memoriesByYear.keys()).sort((left, right) => right - left);

  return (
    <main className="simple-recall-list-view">
      <div className="simple-recall-theme-filter" aria-label="主题筛选">
        <span className="simple-recall-filter-label">主题</span>
        <button type="button" onClick={() => onChooseTheme(null)} className="simple-recall-filter-button">全部</button>
        {THEMES.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`simple-recall-filter-button ${option.value === theme.value ? 'is-active' : ''}`}
            onClick={() => onChooseTheme(option.value)}
            aria-pressed={option.value === theme.value}
          >
            {option.label}
          </button>
        ))}
      </div>

      {memories.length === 0 ? (
        <div className="simple-recall-empty">
          <p>这个主题暂时还没有记忆。</p>
          <button type="button" onClick={() => onChooseTheme(null)}>回到主题</button>
        </div>
      ) : (
        <div className="simple-recall-timeline">
          {years.map((year) => (
            <section key={year} className="simple-recall-timeline-year" aria-labelledby={`recall-year-${year}`}>
              <h2 id={`recall-year-${year}`}>{year}</h2>
              <span className="simple-recall-timeline-rail" aria-hidden="true" />
              <div className="simple-recall-timeline-memories">
                {memoriesByYear.get(year)?.map((memory) => (
                  <button
                    key={memory.id}
                    type="button"
                    className="simple-recall-memory-row"
                    onClick={() => onSelectMemory(memory)}
                  >
                    <span className="simple-recall-memory-photo">
                      {memory.image ? <img src={memory.image} alt="" referrerPolicy="no-referrer" /> : <span>暂无照片</span>}
                    </span>
                    <span className="simple-recall-memory-copy">
                      <strong>{memory.title}</strong>
                      <span className="simple-recall-memory-meta">{memory.date} · {placeOf(memory)} · {theme.label}</span>
                      <span className="simple-recall-memory-summary">{summaryOf(memory)}</span>
                    </span>
                    <span className="simple-recall-memory-open">打开记忆 <span aria-hidden="true">→</span></span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
