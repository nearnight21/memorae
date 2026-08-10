import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CalendarDays } from 'lucide-react';
import { Memory } from '../types';

interface TimelineViewProps {
  memories: Memory[];
  onSelectMemory: (m: Memory) => void;
}

// 从 date（"2025.04.10" / "2025-04-10"）提取月份键
const monthKeyOf = (m: Memory): string => m.date.split(/[.\-]/)[1] ?? '??';
const monthLabel = (key: string): string =>
  key === '??' ? '未知月份' : `${parseInt(key, 10) || 0}月`;

export default function TimelineView({ memories, onSelectMemory }: TimelineViewProps) {
  const [viewYear, setViewYear] = useState<number | null>(null);
  const [viewMonth, setViewMonth] = useState<string | null>(null);

  const years = Array.from(new Set(memories.map((m) => m.year))).sort((a, b) => b - a);
  const yearMemories = viewYear === null ? [] : memories.filter((m) => m.year === viewYear);
  const months = Array.from(new Set(yearMemories.map(monthKeyOf))).sort();
  const monthMemories =
    viewMonth === null
      ? []
      : yearMemories
          .filter((m) => monthKeyOf(m) === viewMonth)
          .sort((a, b) => a.date.localeCompare(b.date));

  const backToYears = () => {
    setViewYear(null);
    setViewMonth(null);
  };

  return (
    <div className="h-screen w-screen overflow-y-auto bg-[#1A1A18] text-[#E8DEC8]">
      <div className="max-w-5xl mx-auto px-5 pt-20 pb-24">
        {/* 面包屑 */}
        <nav className="flex items-center gap-1.5 text-xs font-mono text-[#9C947C] mb-6">
          <button
            onClick={backToYears}
            className={`hover:text-amber-400 transition-colors ${viewYear === null ? 'text-amber-400' : ''}`}
          >
            <CalendarDays className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
            时间线
          </button>
          {viewYear !== null && (
            <>
              <span>/</span>
              <button
                onClick={() => setViewMonth(null)}
                className={`hover:text-amber-400 transition-colors ${viewMonth === null ? 'text-amber-400' : ''}`}
              >
                {viewYear}
              </button>
            </>
          )}
          {viewMonth !== null && (
            <>
              <span>/</span>
              <span className="text-amber-400">{monthLabel(viewMonth)}</span>
            </>
          )}
        </nav>

        {memories.length === 0 ? (
          <p className="text-sm text-[#9C947C] font-mono pt-16 text-center">
            还没有记忆。回到软木板钉入第一张吧。
          </p>
        ) : (
          <AnimatePresence mode="wait">
            {/* 层级 1：年份 */}
            {viewYear === null && (
              <motion.div
                key="years"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
              >
                {years.map((y) => {
                  const list = memories.filter((m) => m.year === y);
                  const cover = list[0]?.image;
                  return (
                    <button
                      key={y}
                      onClick={() => setViewYear(y)}
                      className="relative h-36 rounded-xl overflow-hidden border border-[#3a352e] bg-[#23211D] text-left group cursor-pointer"
                    >
                      {cover && (
                        <img
                          src={cover}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="absolute inset-0 w-full h-full object-cover opacity-25 group-hover:opacity-40 group-hover:scale-105 transition duration-300"
                        />
                      )}
                      <div className="absolute inset-0 bg-linear-to-t from-black/70 to-transparent" />
                      <div className="absolute bottom-3 left-4">
                        <div className="text-3xl font-bold font-display">{y}</div>
                        <div className="text-[11px] font-mono text-[#9C947C] mt-0.5">
                          {list.length} 条记忆
                        </div>
                      </div>
                    </button>
                  );
                })}
              </motion.div>
            )}

            {/* 层级 2：月份 */}
            {viewYear !== null && viewMonth === null && (
              <motion.div
                key={`months-${viewYear}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
                className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
              >
                {months.map((mk) => {
                  const list = yearMemories.filter((m) => monthKeyOf(m) === mk);
                  return (
                    <button
                      key={mk}
                      onClick={() => setViewMonth(mk)}
                      className="h-20 rounded-lg border border-[#3a352e] bg-[#23211D] text-left px-4 flex flex-col justify-center hover:border-amber-600/50 hover:bg-[#2a2721] transition-colors cursor-pointer"
                    >
                      <div className="text-lg font-bold font-display">{monthLabel(mk)}</div>
                      <div className="text-[11px] font-mono text-[#9C947C]">{list.length} 条记忆</div>
                    </button>
                  );
                })}
              </motion.div>
            )}

            {/* 层级 3：该月记忆 */}
            {viewMonth !== null && (
              <motion.div
                key={`memories-${viewYear}-${viewMonth}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
                className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4"
              >
                {monthMemories.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => onSelectMemory(m)}
                    className="group bg-[#23211D] border border-[#3a352e] rounded-lg overflow-hidden text-left hover:border-amber-600/50 transition-colors cursor-pointer"
                  >
                    <div className="h-28 overflow-hidden bg-stone-900">
                      <img
                        src={m.image}
                        alt={m.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      />
                    </div>
                    <div className="p-2.5">
                      <div className="text-xs font-semibold font-display line-clamp-1">{m.title}</div>
                      <div className="text-[10px] font-mono text-[#9C947C] mt-1">
                        {m.date}
                        {m.tag ? ` · ${m.tag}` : ''}
                      </div>
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
