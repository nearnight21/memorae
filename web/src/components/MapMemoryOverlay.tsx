import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Edit3, LoaderCircle, MoreHorizontal, RefreshCw, Trash2, X } from 'lucide-react';
import { CategoryType, Memory } from '../types';
import { hasResolvedAdministrativeLocation, reverseGeocodeCoordinates } from '../lib/geo';
import LocationPicker from './LocationPicker';
import { getOrCreatePreviewRequest } from './previewRequests';

interface ScreenPoint {
  x: number;
  y: number;
}

interface MapMemoryOverlayProps {
  memory: Memory;
  anchor: ScreenPoint | null;
  viewport: { width: number; height: number };
  onClose: () => void;
  onSaveMemory?: (memory: Memory) => Promise<void>;
  onDeleteMemory?: (id: string) => Promise<void>;
  onLoadPreviewPhoto?: (photoId: string) => Promise<string>;
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
  onSaveMemory,
  onDeleteMemory,
  onLoadPreviewPhoto,
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
  const [moreOpen, setMoreOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isOriginalOpen, setIsOriginalOpen] = useState(false);
  const [originalState, setOriginalState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [originalUrl, setOriginalUrl] = useState('');
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [locationQuery, setLocationQuery] = useState('');
  const [locationResolution, setLocationResolution] = useState<'idle' | 'resolving' | 'resolved' | 'error'>(
    locationNeedsResolution(memory) ? 'idle' : 'resolved',
  );
  const locationRequestRef = useRef(0);
  const previewRequestsRef = useRef(new Map<string, Promise<string>>());

  useEffect(() => {
    setPhotoIdx(0);
    setFailedPhotos([]);
    setIsEditing(false);
    setDraftMemory(memory);
    setSaveStatus('idle');
    setDeleteArmed(false);
    setMoreOpen(false);
    setIsDeleting(false);
    setIsOriginalOpen(false);
    setOriginalState('loading');
    setOriginalUrl('');
    setPreviewUrls({});
    setLocationQuery('');
    setLocationResolution(locationNeedsResolution(memory) ? 'idle' : 'resolved');
    locationRequestRef.current += 1;
  }, [memory.id]);

  const availablePhotos = photos.filter((photo) => !failedPhotos.includes(photo));
  const currentPhoto = availablePhotos[photoIdx] || availablePhotos[0] || '';
  const currentPhotoId = memory.photoIds?.[
    [memory.image, ...memory.gallery].indexOf(currentPhoto)
  ];
  const currentPreviewUrl = currentPhotoId ? previewUrls[currentPhotoId] : undefined;
  const displayedPhoto = currentPreviewUrl ?? currentPhoto;
  const activeMemory = isEditing ? draftMemory : memory;
  const locationParts = [activeMemory.country, activeMemory.city, activeMemory.detailLocation]
    .map((part) => part?.trim())
    .filter((part, index, list): part is string => Boolean(part) && list.indexOf(part) === index);
  const locationText = locationParts.join(' · ');
  const displayDate = activeMemory.date.replace(/[\-/]/g, '.');
  const detailLocation = [activeMemory.city, activeMemory.detailLocation]
    .map((part) => part?.trim())
    .filter((part, index, list): part is string => Boolean(part) && list.indexOf(part) === index)
    .join(' / ') || activeMemory.location?.name?.trim() || '';
  const metadataLocation = detailLocation || locationText;

  useEffect(() => {
    if (
      !currentPhotoId
      || !onLoadPreviewPhoto
      || currentPreviewUrl
    ) return;
    const previewRequest = getOrCreatePreviewRequest(
      previewRequestsRef.current,
      currentPhotoId,
      onLoadPreviewPhoto,
    );
    let cancelled = false;
    void previewRequest.then((source) => {
      if (!cancelled) {
        setPreviewUrls((current) => ({ ...current, [currentPhotoId]: source }));
      }
    }).catch(() => {
      // Keep showing the thumbnail when the preview is unavailable or offline.
    });
    return () => {
      cancelled = true;
    };
  }, [currentPhotoId, currentPreviewUrl, onLoadPreviewPhoto]);

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
    setDraftMemory(memory);
    setSaveStatus('idle');
    setIsEditing(true);
  };

  const cancelEditing = () => {
    locationRequestRef.current += 1;
    setDraftMemory(memory);
    setLocationQuery('');
    setLocationResolution(locationNeedsResolution(memory) ? 'idle' : 'resolved');
    setSaveStatus('idle');
    setIsEditing(false);
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
    const probeOriginal = (source: string) => {
      const probe = new Image();
      probe.onload = () => setOriginalState('ready');
      probe.onerror = () => setOriginalState('unavailable');
      probe.src = source;
    };
    if (currentPhotoId && onLoadOriginalPhoto) {
      setOriginalState('loading');
      setOriginalUrl('');
      void onLoadOriginalPhoto(currentPhotoId).then((source) => {
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
    setOriginalUrl(displayedPhoto);
    probeOriginal(displayedPhoto);
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
            key={displayedPhoto}
            src={displayedPhoto}
            alt={memory.title}
            referrerPolicy="no-referrer"
            initial={{ opacity: 0.25, scale: 1.025 }}
            animate={{ opacity: 0.95, scale: 1 }}
            exit={{ opacity: 0.18, scale: 0.985 }}
            transition={{ duration: 0.28 }}
            onError={() => {
              if (!currentPhoto) return;
              if (displayedPhoto !== currentPhoto && currentPhotoId) {
                setPreviewUrls((current) => {
                  const next = { ...current };
                  delete next[currentPhotoId];
                  return next;
                });
                return;
              }
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

      <motion.article
        className="map-memory-copy-feather map-ui-body pointer-events-auto absolute right-[2.5%] top-[12%] z-20 max-h-[76%] w-[43%] overflow-y-auto px-[5.5%] py-7 sm:right-[3.5%] sm:w-[40%] sm:py-8"
        initial={{ opacity: 0, x: 28 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ duration: 0.38, delay: 0.14 }}
      >
        <div className="map-memory-paper-header">
          <div className="map-memory-paper-status" aria-live="polite">
            {isEditing
              ? (saveStatus === 'saving' ? '正在保存' : saveStatus === 'saved' ? '已保存' : '编辑中')
              : (saveStatus === 'saved' ? '已保存' : '已同步')}
          </div>
          <div className="map-memory-paper-actions">
            {!isEditing && onSaveMemory && <button
              type="button"
              onClick={beginEditing}
              className="map-memory-paper-action map-memory-paper-edit"
              aria-label="编辑记忆"
              title="编辑记忆"
            >
              <Edit3 className="h-3.5 w-3.5" strokeWidth={1.6} />
              编辑
            </button>}
            {isEditing && onSaveMemory && <button
              type="button"
              onClick={() => void completeEditing()}
              disabled={saveStatus === 'saving' || (draftMemory.location?.name.trim() !== '' && locationResolution !== 'resolved')}
              className="map-memory-paper-complete"
            >
              {saveStatus === 'saving' ? '保存中…' : '完成'}
            </button>}
            {isEditing && <button
              type="button"
              onClick={cancelEditing}
              disabled={saveStatus === 'saving'}
              className="map-memory-paper-action"
            >
              取消
            </button>}
            {onDeleteMemory && <div className="map-memory-more-wrap">
              <button
                type="button"
                className="map-memory-more"
                onClick={() => setMoreOpen((open) => !open)}
                aria-label="更多操作"
                aria-expanded={moreOpen}
                aria-haspopup="menu"
                title="更多操作"
              >
                <MoreHorizontal className="h-4.5 w-4.5" strokeWidth={1.6} />
              </button>
              {moreOpen && <div className="map-memory-more-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setMoreOpen(false); setDeleteArmed(true); }}
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                  删除记忆
                </button>
              </div>}
            </div>}
          </div>
        </div>

        <div className="map-memory-paper-intro">
          {isEditing ? (
            <input
              value={draftMemory.title}
              onChange={(event) => updateDraft('title', event.target.value)}
              className="map-memory-inline-title map-ui-body w-full bg-transparent font-editorial-serif text-[30px] leading-tight outline-none sm:text-[38px]"
              aria-label="编辑记忆标题"
            />
          ) : (
            <h2 className="map-memory-paper-title font-editorial-serif text-[32px] leading-tight sm:text-[42px]">
              {memory.title}
            </h2>
          )}

          <div className="map-memory-meta-row">
            {isEditing ? (
              <input
                value={draftMemory.date}
                onChange={(event) => updateDraft('date', event.target.value)}
                className="map-memory-meta-edit map-memory-edit-date"
                aria-label="编辑记忆日期"
                placeholder="YYYY.MM.DD"
              />
            ) : <span className="map-memory-meta-text">{displayDate}</span>}

            <span className="map-memory-meta-separator" aria-hidden="true">·</span>

            {isEditing ? (
              <div className="map-memory-meta-edit map-memory-edit-location">
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
            ) : metadataLocation && (
              <span className="map-memory-meta-text">{metadataLocation}</span>
            )}

            <span className="map-memory-meta-separator" aria-hidden="true">·</span>

            {isEditing ? (
              <select
                value={draftMemory.category}
                onChange={(event) => updateDraft('category', event.target.value as CategoryType)}
                className="map-memory-meta-edit map-memory-edit-select"
                aria-label="编辑记忆主题"
              >
                {CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            ) : <span className="map-memory-meta-tag">{categoryLabel(memory.category)}</span>}
          </div>
        </div>

        <div className="map-memory-reflections">
          <section className="map-memory-reflection map-memory-reflection-past">
            <h3 className="map-memory-reflection-heading font-editorial-serif">当时的我</h3>
            {isEditing ? (
              <textarea
                value={draftMemory.pastSelf}
                onChange={(event) => updateDraft('pastSelf', event.target.value)}
                className="map-memory-edit-textarea map-ui-body-text"
                aria-label="编辑当时的我"
              />
            ) : <p className="map-ui-body-text">{memory.pastSelf}</p>}
          </section>

          {(readerMode === 'reflection' || isEditing) && <section className="map-memory-reflection map-memory-reflection-present">
              <h3 className="map-memory-reflection-heading font-editorial-serif">现在的我</h3>
            {isEditing ? (
              <textarea
                value={draftMemory.presentSelf}
                onChange={(event) => updateDraft('presentSelf', event.target.value)}
                className="map-memory-edit-textarea map-ui-body-text"
                aria-label="编辑现在的我"
              />
            ) : (
              <p className="map-ui-body-text">{memory.presentSelf}</p>
            )}
          </section>}
        </div>

        {isEditing && <p className={`map-memory-edit-hint ${saveStatus === 'error' ? 'is-error' : ''}`}>
          {saveStatus === 'error' ? '草稿保存失败，请检查地点后重试。' : '修改会即时保存在本地草稿中。'}
        </p>}
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
            <p className="mt-4 text-[15px] leading-7 text-[#d6d6cc]">{originalState === 'loading' ? '原图较大，正在按需安全读取。' : '预览仍可查看。原图读取失败，请重试或继续使用当前清晰度。'}</p>
            {originalState === 'loading' ? <div className="mt-7 h-2 overflow-hidden bg-[#30342f]"><div className="h-full w-2/3 animate-pulse bg-[var(--color-accent-fill)]" /></div> : <button type="button" onClick={loadOriginal} className="mt-6 inline-flex items-center gap-2 text-[15px] font-bold text-[var(--color-accent-fill)] cursor-pointer"><RefreshCw className="h-4 w-4" />重试加载原图</button>}
          </section>}
        </motion.div>}
      </AnimatePresence>
    </motion.div>
  );
}
