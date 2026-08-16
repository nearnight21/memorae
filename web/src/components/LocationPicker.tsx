import { useState, useEffect, useRef } from 'react';
import { MapPin, MapPinned, Loader2 } from 'lucide-react';
import { searchPlaces, PlaceCandidate } from '../lib/geo';

interface LocationPickerProps {
  /** 已确认地点的展示名。它不会触发新的搜索。 */
  selectedLabel: string;
  /** 用户正在输入的搜索文本。 */
  query: string;
  onQueryChange: (query: string) => void;
  /** 从候选中选中时回调（携带坐标与国家/城市） */
  onSelect: (c: PlaceCandidate) => void;
  placeholder?: string;
  inputClassName?: string;
  /** 在当前编辑状态中进入全屏地图选点。 */
  onPickOnMap?: () => void;
}

/**
 * 地点搜索选择器：查询文本与已确认地点完全分离。
 * 选中候选后只写入候选自身的坐标，不会再用地点名称进行第二次搜索。
 */
export default function LocationPicker({
  selectedLabel,
  query,
  onQueryChange,
  onSelect,
  placeholder,
  inputClassName,
  onPickOnMap,
}: LocationPickerProps) {
  const [candidates, setCandidates] = useState<PlaceCandidate[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<number | undefined>(undefined);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setCandidates([]);
      setOpen(false);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      setSearching(true);
      const list = await searchPlaces(query);
      setSearching(false);
      setCandidates(list);
      setOpen(list.length > 0);
    }, 400);
    return () => window.clearTimeout(debounceRef.current);
  }, [query]);

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
        value={query || selectedLabel}
        onChange={(e) => onQueryChange(e.target.value)}
        onFocus={() => candidates.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className={inputClassName}
        style={onPickOnMap ? { paddingRight: 40 } : undefined}
      />
      {searching && (
        <Loader2 className={`absolute ${onPickOnMap ? 'right-10' : 'right-2.5'} top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-stone-400 pointer-events-none`} />
      )}
      {onPickOnMap && (
        <button
          type="button"
          onClick={onPickOnMap}
          title="在地图上选择"
          aria-label="在地图上选择"
          className="absolute right-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-stone-500 transition-colors hover:bg-amber-100/70 hover:text-amber-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-700"
        >
          <MapPinned className="h-3.5 w-3.5" strokeWidth={1.7} />
        </button>
      )}
      {open && (
        <ul className="absolute z-50 left-0 right-0 mt-1 bg-[#fdfcf7] border border-amber-900/25 rounded-lg shadow-xl max-h-52 overflow-y-auto">
          {candidates.map((c, i) => (
            <li key={`${c.lat}-${c.lng}-${i}`}>
              <button
                type="button"
                onClick={() => {
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
