import { useState, useEffect, useRef } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { searchPlaces, PlaceCandidate } from '../lib/geo';

interface LocationPickerProps {
  /** 当前地点名 */
  value: string;
  /** 手动输入时回调 */
  onChange: (name: string) => void;
  /** 从候选中选中时回调（携带坐标与国家/城市） */
  onSelect: (c: PlaceCandidate) => void;
  placeholder?: string;
  inputClassName?: string;
}

/**
 * 地点搜索选择器：输入关键词 → Nominatim 候选下拉 → 选中带回真实坐标。
 * 选中后地图可直接使用存储坐标，不再依赖名称猜测。
 */
export default function LocationPicker({
  value,
  onChange,
  onSelect,
  placeholder,
  inputClassName,
}: LocationPickerProps) {
  const [candidates, setCandidates] = useState<PlaceCandidate[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<number | undefined>(undefined);
  const wrapRef = useRef<HTMLDivElement>(null);
  // 选中候选后父组件会回填 value，跳过这次回填触发的搜索
  const skipSearchRef = useRef(false);

  useEffect(() => {
    window.clearTimeout(debounceRef.current);
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }
    if (!value.trim()) {
      setCandidates([]);
      setOpen(false);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      setSearching(true);
      const list = await searchPlaces(value);
      setSearching(false);
      setCandidates(list);
      setOpen(list.length > 0);
    }, 400);
    return () => window.clearTimeout(debounceRef.current);
  }, [value]);

  // 点击组件外部时收起下拉
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => candidates.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className={inputClassName}
      />
      {searching && (
        <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-stone-400 pointer-events-none" />
      )}
      {open && (
        <ul className="absolute z-50 left-0 right-0 mt-1 bg-[#fdfcf7] border border-amber-900/25 rounded-lg shadow-xl max-h-52 overflow-y-auto">
          {candidates.map((c, i) => (
            <li key={`${c.lat}-${c.lng}-${i}`}>
              <button
                type="button"
                onClick={() => {
                  skipSearchRef.current = true;
                  onSelect(c);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-amber-50 transition-colors flex gap-2 items-start cursor-pointer"
              >
                <MapPin className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-stone-800">{c.shortName}</span>
                  <span className="block text-[10px] text-stone-500 font-mono line-clamp-1">
                    {c.displayName}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
