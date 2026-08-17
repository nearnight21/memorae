import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bookmark, ChevronLeft, ChevronRight, Cloud, Edit3, LoaderCircle, RefreshCw, Trash2, X } from 'lucide-react';
import { CategoryType, Memory } from '../types';
import { hasResolvedAdministrativeLocation, reverseGeocodeCoordinates } from '../lib/geo';
import LocationPicker from './LocationPicker';

interface ScreenPoint {
  x: number;
  y: number;
}

interface MapMemoryOverlayProps {
  memory: Memory;
  anchor: ScreenPoint | null;
  viewport: { width: number; height: number };
  onClose: () => void;
  onEditMemory?: (memory: Memory) => void;
  onSaveMemory?: (memory: Memory) => Promise<void>;
  onDeleteMemory?: (id: string) => Promise<void>;
  onLoadOriginalPhoto?: (photoId: string) => Promise<string>;
  readerMode?: 'reflection' | 'journal';
}

const CATEGORY_OPTIONS: Array<{ value: CategoryType; label: string }> = [
  { value: 'travel', label: '旅行' },
  { value: 'growth', label: '成长' },
  { value: 'motorcycle', label: '日常' },
  { value: 'photography', label: '瞬间' },
];

const categoryLabel = (category: CategoryType) =>
  CATEGORY_OPTIONS.find((option) => option.value === category)?.label ?? '未分类';

const yearFromDate = (date: string, fallback: number) => {
  const year = Number.parseInt(date.trim().slice(0, 4), 10);
  return Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : fallback;
};

function locationNeedsResolution(memory: Memory): boolean {
  const country = memory.country?.trim() || '';
  const isChina = country.includes('中国') || country.includes('中國');
  return !memory.city?.trim()
    || !memory.province?.trim()
    || (isChina && /(?:区|县|旗|镇)$/.test(memory.city.trim()));
}

export default function MapMemoryOverlay({
  memory,
  anchor,
  viewport,
  onClose,
  onEditMemory,
  onSaveMemory,
  onDeleteMemory,
  onLoadOriginalPhoto,
  readerMode = 'reflection',
}: MapMemoryOverlayProps) {
  const photos = useMemo(
    () => Array.from(new Set(
      (readerMode === 'journal' ? [...memory.gallery, memory.image] : [memory.image, ...memory.gallery])
        .filter(Boolean),
    )),
    [memory.image, memory.gallery, readerMode]
  );
  const [photoIdx, setPhotoIdx] = useState(0);
  const [failedPhotos, setFailedPhotos] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [draftMemory, setDraftMemory] = useState<Memory>(memory);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isOriginalOpen, setIsOriginalOpen] = useState(false);
  const [originalState, setOriginalState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [originalUrl, setOriginalUrl] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [locationResolution, setLocationResolution] = useState<'idle' | 'resolving' | 'resolved' | 'error'>(
    locationNeedsResolution(memory) ? 'idle' : 'resolved',
  );
  const locationRequestRef = useRef(0);

  useEffect(() => {
    setPhotoIdx(0);
    setFailedPhotos([]);
    setIsEditing(false);
    setDraftMemory(memory);
    setSaveStatus('idle');
    setDeleteArmed(false);
    setIsDeleting(false);
    setIsOriginalOpen(false);
    setOriginalState('loading');
    setOriginalUrl('');
    setLocationQuery('');
    setLocationResolution(locationNeedsResolution(memory) ? 'idle' : 'resolved');
    locationRequestRef.current += 1;
  }, [memory.id]);

  const availablePhotos = photos.filter((photo) => !failedPhotos.includes(photo));
  const currentPhoto = availablePhotos[photoIdx] || availablePhotos[0] || '';
  const activeMemory = isEditing ? draftMemory : memory;
  const locationParts = [activeMemory.country, activeMemory.city, activeMemory.detailLocation]
    .map((part) => part?.trim())
    .filter((part, index, list): part is string => Boolean(part) && list.indexOf(part) === index);
  const locationText = locationParts.join(' · ');

  const photoCenter = {
    x: viewport.width * (viewport.width < 900 ? 0.39 : 0.34),
    y: viewport.height * 0.48,
  };
  const connectorEnd = {
    x: viewport.width * 0.28,
    y: viewport.height * 0.35,
  };
  const connectorPath = anchor
    ? `M ${anchor.x} ${anchor.y} C ${anchor.x - 70} ${anchor.y + 4}, ${connectorEnd.x + 80} ${connectorEnd.y - 12}, ${connectorEnd.x} ${connectorEnd.y}`
    : '';

  const goPhoto = (direction: -1 | 1) => {
    if (availablePhotos.length <= 1) return;
    setPhotoIdx((index) => (index + direction + availablePhotos.length) % availablePhotos.length);
  };

  const beginEditing = () => {
    if (onEditMemory) {
      onEditMemory(memory);
      return;
    }
    setDraftMemory(memory);
    setSaveStatus('idle');
    setIsEditing(true);
  };

  const updateDraft = <K extends keyof Memory>(key: K, value: Memory[K]) => {
    setDraftMemory((current) => ({ ...current, [key]: value }));
  };

  const updateDraftLocationQuery = (name: string) => {
    locationRequestRef.current += 1;
    setLocationQuery(name);
    setLocationResolution('idle');
    setDraftMemory((current) => ({
      ...current,
      location: name.trim() || current.location
        ? { ...(current.location ?? { mx: 50, my: 50, name: '' }), name }
        : undefined,
      country: undefined,
      province: undefined,
      city: undefined,
      district: undefined,
      adcode: undefined,
      locationProvider: undefined,
      locationProviderId: undefined,
      lat: undefined,
      lng: undefined,
    }));
  };

  const saveMemory = async (): Promise<boolean> => {
    if (!onSaveMemory || saveStatus === 'saving') return false;
    if (draftMemory.location?.name.trim() && locationResolution !== 'resolved') {
      setSaveStatus('error');
      return false;
    }
    const updated = {
      ...draftMemory,
      year: yearFromDate(draftMemory.date, memory.year),
      title: draftMemory.title.trim(),
      date: draftMemory.date.trim(),
      pastSelf: draftMemory.pastSelf.trim(),
      presentSelf: draftMemory.presentSelf.trim(),
      location: draftMemory.location?.name.trim()
        ? { ...draftMemory.location, name: draftMemory.location.name.trim() }
        : undefined,
    };
    setSaveStatus('saving');
    try {
      await onSaveMemory(updated);
      setDraftMemory(updated);
      setSaveStatus('saved');
      window.setTimeout(() => setSaveStatus('idle'), 2400);
      return true;
    } catch (error) {
      console.error(error);
      setSaveStatus('error');
      return false;
    }
  };

  const completeEditing = async () => {
    if (await saveMemory()) setIsEditing(false);
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!isEditing || (!event.ctrlKey && !event.metaKey) || event.key !== 'Enter') return;
      event.preventDefault();
      void completeEditing();
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [isEditing, draftMemory]);

  const deleteMemory = async () => {
    if (!onDeleteMemory || isDeleting) return;
    setIsDeleting(true);
    try {
      await onDeleteMemory(memory.id);
      onClose();
    } catch (error) {
      console.error(error);
      setIsDeleting(false);
    }
  };

  const loadOriginal = () => {
    const sourceIndex = photos.indexOf(currentPhoto);
    const photoId = sourceIndex >= 0 ? memory.photoIds?.[sourceIndex] : undefined;
    const probeOriginal = (source: string) => {
      const probe = new Image();
      probe.onload = () => setOriginalState('ready');
      probe.onerror = () => setOriginalState('unavailable');
      probe.src = source;
    };
    if (photoId && onLoadOriginalPhoto) {
      setOriginalState('loading');
      setOriginalUrl('');
      void onLoadOriginalPhoto(photoId).then((source) => {
        setOriginalUrl(source);
        probeOriginal(source);
      }).catch(() => setOriginalState('unavailable'));
      return;
    }
    if (!currentPhoto) {
      setOriginalState('unavailable');
      return;
    }
    setOriginalState('loading');
    setOriginalUrl(currentPhoto);
    probeOriginal(currentPhoto);
  };

  const openOriginal = () => {
    setIsOriginalOpen(true);
    loadOriginal();
  };

  return (
    <motion.div
      id="map-memory-overlay"
      className="pointer-events-none absolute inset-0 z-[1001] overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28 }}
    >
      {anchor && (
        <svg className="absolute inset-0 z-[15] h-full w-full overflow-visible" aria-hidden="true">
          <motion.path
            d={connectorPath}
            fill="none"
            stroke="var(--color-accent-fill)"
            strokeWidth="1.4"
            strokeDasharray="3 7"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.78 }}
            transition={{ duration: 0.65, delay: 0.16, ease: 'easeOut' }}
          />
          <circle
            cx={anchor.x}
            cy={anchor.y}
            r="4"
            fill="var(--color-accent-fill)"
            stroke="var(--color-bg-surface)"
            strokeWidth="2"
          />
        </svg>
      )}

      <motion.div
        className="absolute left-[64px] top-[12%] z-10 h-[72%] w-[58%] sm:left-[72px] sm:w-[56%]"
        initial={{
          opacity: 0,
          scale: 0.18,
          x: anchor ? anchor.x - photoCenter.x : 80,
          y: anchor ? anchor.y - photoCenter.y : 30,
        }}
        animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
        exit={{
          opacity: 0,
          scale: 0.24,
          x: anchor ? anchor.x - photoCenter.x : 60,
          y: anchor ? anchor.y - photoCenter.y : 20,
        }}
        transition={{ type: 'spring', damping: 24, stiffness: 210 }}
      >
        <AnimatePresence mode="wait">
          <motion.img
            key={currentPhoto}
            src={currentPhoto}
            alt={memory.title}
            referrerPolicy="no-referrer"
            initial={{ opacity: 0.25, scale: 1.025 }}
            animate={{ opacity: 0.95, scale: 1 }}
            exit={{ opacity: 0.18, scale: 0.985 }}
            transition={{ duration: 0.28 }}
            onError={() => {
              if (!currentPhoto) return;
              setFailedPhotos((failed) => failed.includes(currentPhoto) ? failed : [...failed, currentPhoto]);
              setPhotoIdx(0);
            }}
            className="map-memory-photo-mask h-full w-full object-cover"
          />
        </AnimatePresence>

        {currentPhoto && <button
          type="button"
          onClick={openOriginal}
          className="pointer-events-auto absolute inset-0 z-10 cursor-zoom-in"
          aria-label="查看原图"
          title="查看原图"
        />}

        {availablePhotos.length > 1 && (
          <div className="map-photo-toolbar pointer-events-auto absolute bottom-[7%] left-1/2 z-20 flex -translate-x-1/2 items-center gap-5">
            <button
              type="button"
              onClick={() => goPhoto(-1)}
              aria-label="上一张照片"
              className="map-photo-nav-control flex h-10 w-10 items-center justify-center rounded-full border backdrop-blur-sm transition-colors cursor-pointer"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="font-mono text-[13px] tracking-[0.14em] drop-shadow-md">
              {String(photoIdx + 1).padStart(2, '0')} / {String(availablePhotos.length).padStart(2, '0')}
            </span>
            <button
              type="button"
              onClick={() => goPhoto(1)}
              aria-label="下一张照片"
              className="map-photo-nav-control flex h-10 w-10 items-center justify-center rounded-full border backdrop-blur-sm transition-colors cursor-pointer"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}
      </motion.div>

      <p className="map-memory-breadcrumb map-ui-muted pointer-events-none absolute left-12 top-8 z-30 text-[11px] tracking-[0.08em]">
        足迹 / {locationText || '未标注地点'}
      </p>

      {isEditing && onSaveMemory && <button
        type="button"
        onClick={() => void completeEditing()}
        disabled={saveStatus === 'saving' || (draftMemory.location?.name.trim() !== '' && locationResolution !== 'resolved')}
        aria-label="保存修改并完成编辑"
        title="保存修改并完成编辑"
        className="map-memory-complete map-ui-control pointer-events-auto absolute right-5 top-6 z-30 flex h-10 min-w-[82px] items-center justify-center rounded-full border px-4 text-[12px] transition-colors disabled:opacity-60 cursor-pointer"
      >
        {saveStatus === 'saving' ? '保存中…' : '完成'}
      </button>}

      <motion.article
        className="map-memory-copy-feather map-ui-body pointer-events-auto absolute right-[2.5%] top-[15%] z-20 max-h-[72%] w-[43%] overflow-y-auto px-[5%] py-10 sm:right-[3.5%] sm:w-[40%]"
        initial={{ opacity: 0, x: 28 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ duration: 0.38, delay: 0.14 }}
      >
        <div className="mb-7">
          {isEditing ? (
            <input
              value={draftMemory.title}
              onChange={(event) => updateDraft('title', event.target.value)}
              className="map-memory-inline-title map-ui-body w-full border-0 border-b bg-transparent pb-2 font-editorial-serif text-[30px] leading-tight outline-none sm:text-[38px]"
              aria-label="编辑记忆标题"
            />
          ) : (
            <h2 className="font-editorial-serif text-[32px] leading-tight tracking-[0.08em] sm:text-[42px]">
              {memory.title}
            </h2>
          )}

          <div className="map-memory-meta-row mt-5 flex flex-wrap items-center gap-2">
            {isEditing ? (
              <input
                value={draftMemory.date}
                onChange={(event) => updateDraft('date', event.target.value)}
                className="map-memory-edit-chip map-memory-edit-date"
                aria-label="编辑记忆日期"
                placeholder="YYYY.MM.DD"
              />
            ) : <span className="map-memory-meta-chip">{memory.date}</span>}

            {isEditing ? (
              <div className="map-memory-edit-chip map-memory-edit-location">
                <LocationPicker
                  selectedLabel={draftMemory.location?.name ?? ''}
                  query={locationQuery}
                  onQueryChange={updateDraftLocationQuery}
                  onSelect={(candidate) => {
                    const requestId = locationRequestRef.current + 1;
                    locationRequestRef.current = requestId;
                    setLocationQuery('');
                    setDraftMemory((current) => ({
                      ...current,
                      location: {
                        name: candidate.shortName,
                        mx: current.location?.mx ?? 50,
                        my: current.location?.my ?? 50,
                      },
                      country: candidate.country ?? current.country,
                      province: undefined,
                      city: undefined,
                      district: undefined,
                      adcode: undefined,
                      locationProvider: candidate.provider,
                      locationProviderId: candidate.providerId,
                      lat: candidate.lat,
                      lng: candidate.lng,
                    }));
                    setLocationResolution('resolving');
                    void reverseGeocodeCoordinates(candidate.lat, candidate.lng).then((reverse) => {
                      if (requestId !== locationRequestRef.current) return;
                      if (!hasResolvedAdministrativeLocation(reverse)) {
                        setLocationResolution('error');
                        return;
                      }
                      setDraftMemory((current) => (
                        current.lat === candidate.lat && current.lng === candidate.lng
                          ? {
                            ...current,
                            country: reverse.country,
                            province: reverse.province,
                            city: reverse.city,
                            district: reverse.district,
                            adcode: reverse.adcode,
                            locationProvider: reverse.provider,
                            detailLocation: current.detailLocation || reverse.district,
                          }
                          : current
                      ));
                      setLocationResolution('resolved');
                    });
                  }}
                  placeholder="地点"
                  inputClassName="map-memory-edit-chip-input"
                />
              </div>
            ) : (memory.location?.name || locationText) && (
              <span className="map-memory-meta-chip">{memory.location?.name || locationText}</span>
            )}

            {isEditing ? (
              <select
                value={draftMemory.category}
                onChange={(event) => updateDraft('category', event.target.value as CategoryType)}
                className="map-memory-edit-chip map-memory-edit-select"
                aria-label="编辑记忆主题"
              >
                {CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            ) : <span className="map-memory-meta-chip">{categoryLabel(memory.category)}</span>}
          </div>
        </div>

        <div className="map-ui-accent-border mt-7 border-l pl-7">
          <section className="relative pb-7">
            <span className="map-ui-accent map-ui-accent-border map-ui-subtle font-editorial-serif absolute -left-[43px] top-0 flex h-8 w-8 items-center justify-center rounded-full border text-sm">
              昔
            </span>
            <h3 className="map-ui-accent font-editorial-serif text-[16px] tracking-[0.12em]">当时的我</h3>
            {isEditing ? (
              <textarea
                value={draftMemory.pastSelf}
                onChange={(event) => updateDraft('pastSelf', event.target.value)}
                className="map-memory-edit-textarea map-ui-body-text mt-3 min-h-28 w-full resize-y px-3 py-2 text-[13px] leading-7 outline-none"
                aria-label="编辑当时的我"
              />
            ) : <p className="map-ui-body-text mt-3 whitespace-pre-wrap text-[13px] leading-7">{memory.pastSelf}</p>}
          </section>

          {(readerMode === 'reflection' || isEditing) && <section className="relative">
            <span className="map-ui-accent map-ui-accent-border map-ui-subtle font-editorial-serif absolute -left-[43px] top-0 flex h-8 w-8 items-center justify-center rounded-full border text-sm">
              今
            </span>
            <div className="flex items-center justify-between gap-3">
              <h3 className="map-ui-accent font-editorial-serif text-[16px] tracking-[0.12em]">现在的我</h3>
              {!isEditing && onSaveMemory && <button
                type="button"
                onClick={beginEditing}
                className="map-ui-accent map-ui-accent-hover flex items-center gap-1.5 text-[10px] transition-colors cursor-pointer"
              >
                <Edit3 className="h-3.5 w-3.5" />
                编辑
              </button>}
            </div>
            {isEditing ? (
              <textarea
                value={draftMemory.presentSelf}
                onChange={(event) => updateDraft('presentSelf', event.target.value)}
                className="map-memory-edit-textarea map-ui-body-text mt-3 min-h-24 w-full resize-y px-3 py-2 text-[13px] leading-7 outline-none"
                aria-label="编辑现在的我"
              />
            ) : (
              <p className="map-ui-body-text mt-3 whitespace-pre-wrap text-[13px] leading-7">{memory.presentSelf}</p>
            )}
          </section>}
        </div>

        {onSaveMemory && <div className="mt-8 flex items-center gap-3 text-[11px]">
          {isEditing && <button
            type="button"
            onClick={() => void saveMemory()}
            disabled={saveStatus === 'saving'}
            className="map-ui-accent map-ui-accent-hover flex items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
            aria-label="保存记忆修改"
          >
            <Bookmark className="h-4 w-4" strokeWidth={1.5} />
            {saveStatus === 'saving' ? '保存中…' : saveStatus === 'saved' ? '已保存' : '保存修改'}
          </button>}
          {!isEditing && <button
            type="button"
            onClick={() => void saveMemory()}
            disabled={saveStatus === 'saving'}
            className="map-ui-accent map-ui-accent-hover flex items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Bookmark className="h-4.5 w-4.5" strokeWidth={1.5} />
            {saveStatus === 'saving' ? '保存中…' : '保存记忆'}
          </button>}
          {!isEditing && <span className="map-ui-muted">|</span>}
          <span className={`map-ui-save-status flex items-center gap-1.5 ${saveStatus === 'error' ? 'is-error' : ''}`}>
            <Cloud className="h-4 w-4" strokeWidth={1.5} />
            {isEditing
              ? (saveStatus === 'saving' ? '正在保存草稿…' : saveStatus === 'error' ? '草稿保存失败' : '草稿已保存 · Ctrl + Enter 完成')
              : (saveStatus === 'error' ? '同步失败' : saveStatus === 'saved' ? '已同步' : '等待保存')}
          </span>
        </div>}

        {onDeleteMemory && (
          <div className="mt-5 border-t border-[color:var(--color-border-subtle)] pt-4 text-[11px]">
            <button
              type="button"
              aria-label="删除记忆"
              onClick={() => setDeleteArmed(true)}
              className="map-ui-save-status inline-flex items-center gap-2 transition-colors hover:text-[var(--color-danger)] cursor-pointer"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.5} />
              删除记忆
            </button>
          </div>
        )}
      </motion.article>

      <button
        id="btn-close-map-memory"
        type="button"
        onClick={onClose}
        aria-label="收起记忆"
        className="map-ui-control pointer-events-auto absolute right-5 top-6 z-30 flex h-10 items-center gap-2 rounded-full border px-3.5 text-[11px] backdrop-blur-md transition-colors cursor-pointer"
      >
        <X className="h-4.5 w-4.5" strokeWidth={1.5} />
        收起记忆
      </button>

      <AnimatePresence>
        {deleteArmed && <motion.div
          className="pointer-events-auto absolute inset-0 z-[80] grid place-items-center bg-[rgba(10,13,13,0.58)] p-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isDeleting) setDeleteArmed(false);
          }}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-memory-title"
            className="w-full max-w-[540px] rounded-2xl bg-[var(--color-bg-surface)] px-9 py-8 shadow-[0_8px_24px_rgba(61,54,44,0.24)]"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
          >
            <h2 id="delete-memory-title" className="text-[28px] font-bold leading-9 text-[var(--color-text-primary)]">删除这段记忆？</h2>
            <p className="mt-4 text-[16px] leading-6 text-[var(--color-text-secondary)]">将移除照片索引、位置和加密缩略图。原图不会进入回收站。</p>
            <div className="mt-8 flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteArmed(false)} disabled={isDeleting} className="h-10 rounded-[10px] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] px-4 text-[15px] font-bold text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-subtle)] disabled:opacity-50 cursor-pointer">取消</button>
              <button type="button" onClick={() => void deleteMemory()} disabled={isDeleting} className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-[var(--color-danger)] px-4 text-[15px] font-bold text-[var(--color-bg-surface)] transition-colors hover:brightness-95 disabled:opacity-50 cursor-pointer">
                {isDeleting && <LoaderCircle className="h-4 w-4 animate-spin" />}
                {isDeleting ? '删除中…' : '删除记忆'}
              </button>
            </div>
          </motion.section>
        </motion.div>}
      </AnimatePresence>

      <AnimatePresence>
        {isOriginalOpen && <motion.div
          className="pointer-events-auto absolute inset-0 z-[90] bg-[#090a09] text-[var(--color-bg-surface)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <p className="absolute left-12 top-8 z-10 text-[13px]">{memory.title} / {locationText || '未标注地点'}</p>
          <p className="absolute left-1/2 top-8 z-10 -translate-x-1/2 text-[13px]">{originalState === 'loading' ? '正在加载原图' : originalState === 'unavailable' ? '原图不可用' : '原图'}</p>
          <button type="button" onClick={() => setIsOriginalOpen(false)} aria-label="关闭原图" className="absolute right-7 top-6 z-10 grid h-11 w-11 place-items-center rounded-full bg-[#1f211f] text-[var(--color-bg-surface)] cursor-pointer"><X className="h-5 w-5" /></button>

          {originalState === 'ready' && <img src={originalUrl} alt={memory.title} referrerPolicy="no-referrer" onError={() => setOriginalState('unavailable')} className="h-full w-full object-contain" />}
          {originalState !== 'ready' && <section className="absolute left-1/2 top-1/2 w-[min(620px,calc(100%-40px))] -translate-x-1/2 -translate-y-1/2 bg-[rgba(10,13,13,0.84)] px-14 py-10">
            <h2 className="text-[26px] font-bold">{originalState === 'loading' ? '正在加载原图' : '原图暂时不可用'}</h2>
            <p className="mt-4 text-[15px] leading-7 text-[#d6d6cc]">{originalState === 'loading' ? '原图较大，正在从本地安全存储读取。' : '预览仍可查看。原图读取失败，请重试或继续使用当前清晰度。'}</p>
            {originalState === 'loading' ? <div className="mt-7 h-2 overflow-hidden bg-[#30342f]"><div className="h-full w-2/3 animate-pulse bg-[var(--color-accent-fill)]" /></div> : <button type="button" onClick={loadOriginal} className="mt-6 inline-flex items-center gap-2 text-[15px] font-bold text-[var(--color-accent-fill)] cursor-pointer"><RefreshCw className="h-4 w-4" />重试加载原图</button>}
          </section>}
        </motion.div>}
      </AnimatePresence>
    </motion.div>
  );
}
