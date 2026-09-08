import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  Loader2,
  LoaderCircle,
  MapPin,
  MoreHorizontal,
  PenLine,
  RefreshCw,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { CategoryType, Memory } from '../types';
import { hasResolvedAdministrativeLocation, reverseGeocodeCoordinates } from '../lib/geo';
import LocationMapSelection from './LocationMapSelection';
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
  const reduceMotion = useReducedMotion();
  const [narrowJournal, setNarrowJournal] = useState(() => window.matchMedia('(max-width: 860px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 860px)');
    const update = () => setNarrowJournal(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const pageTransition = { duration: reduceMotion ? 0.12 : 0.5, ease: [0.25, 0.1, 0.25, 1] as const };
  const closeTransition = { duration: reduceMotion ? 0.12 : 0.38, ease: [0.32, 0, 0.24, 1] as const };
  const pageAngle = reduceMotion || narrowJournal ? 0 : 55;
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
  const [showLocationMap, setShowLocationMap] = useState(false);
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
    setShowLocationMap(false);
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
    setShowLocationMap(false);
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

  if (showLocationMap) {
    const coords = (Number.isFinite(draftMemory.lat) && Number.isFinite(draftMemory.lng))
      ? { lat: draftMemory.lat as number, lng: draftMemory.lng as number }
      : null;
    return (
      <LocationMapSelection
        initialCoordinates={coords}
        fallbackName={draftMemory.location?.name ?? ''}
        onCancel={() => setShowLocationMap(false)}
        onConfirm={(selection) => {
          locationRequestRef.current += 1;
          if (!selection.resolved) {
            setLocationResolution('error');
            setShowLocationMap(false);
            return;
          }
          setLocationQuery('');
          setDraftMemory((current) => ({
            ...current,
            location: {
              name: selection.name,
              mx: current.location?.mx ?? 50,
              my: current.location?.my ?? 50,
            },
            country: selection.country,
            province: selection.province,
            city: selection.city,
            district: selection.district,
            adcode: selection.adcode,
            locationProvider: selection.provider,
            locationProviderId: selection.providerId,
            lat: selection.lat,
            lng: selection.lng,
            detailLocation: selection.district ?? current.detailLocation,
          }));
          setLocationResolution('resolved');
          setShowLocationMap(false);
        }}
      />
    );
  }

  return (
    <motion.div
      id="map-memory-overlay"
      className="pointer-events-none absolute inset-0 z-[1001] flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={closeTransition}
    >
      {/* 沉静暗色背景蒙层，点击外部随手合上手帐 */}
      <motion.div
        className="map-journal-backdrop pointer-events-auto absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={closeTransition}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 双页旅行折页手帐主画卷 */}
      <motion.main
        className="map-journal-folio pointer-events-auto relative z-10"
        initial={{ opacity: 0, y: reduceMotion ? 0 : 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{
          opacity: 0,
          scale: reduceMotion || narrowJournal ? 1 : 0.94,
          y: reduceMotion ? 0 : 12,
          transition: closeTransition,
        }}
        transition={pageTransition}
      >
        {/* 书脊折痕装订线、锁线孔与自然垂落书签丝带 */}
        <div className="map-journal-spine" aria-hidden="true" />
        <div className="map-journal-ribbon" aria-hidden="true" />
        <div className="map-journal-spine-stitches" aria-hidden="true">
          <span className="map-journal-stitch" />
          <span className="map-journal-stitch" />
          <span className="map-journal-stitch" />
        </div>

        {/* 左页：实体冲印相纸台（向内对折闭合） */}
        <motion.div
          className="map-journal-page-motion is-photo"
          initial={{ rotateY: -pageAngle }}
          animate={{ rotateY: 0 }}
          exit={{ rotateY: pageAngle, opacity: reduceMotion || narrowJournal ? 0 : 0.15 }}
          transition={closeTransition}
        >
        <motion.section className="map-journal-page map-journal-page-photo" aria-label="照片记忆"
          initial={{ opacity: reduceMotion || narrowJournal ? 0 : 0.85 }} animate={{ opacity: 1 }}
          transition={{ duration: reduceMotion ? 0.12 : 0.24 }}>
          {currentPhoto ? (
            <div className="map-journal-photo-stage">
              {/* 底层错落相纸（多图时自然微旋转） */}
              {availablePhotos.length > 1 && (
                <div className="map-journal-photo-stack is-back" aria-hidden="true" />
              )}
              {availablePhotos.length > 2 && (
                <div className="map-journal-photo-stack is-middle" aria-hidden="true" />
              )}

              {/* 冲印相纸画幅（右上和左下贴半透明和纸胶带，带立体阴影与白边） */}
              <div
                className="map-journal-photo-paper cursor-zoom-in group"
                onClick={openOriginal}
                role="button"
                tabIndex={0}
                aria-label="查看原图"
                title="点击查看高清原图"
              >
                {/* 贴在相纸角上的手撕和纸胶带 */}
                <div className="map-journal-tape is-tr" aria-hidden="true" />
                <div className="map-journal-tape is-bl" aria-hidden="true" />

                <div className="map-journal-photo-inner">
                  <AnimatePresence mode="wait">
                    <motion.img
                      key={displayedPhoto}
                      src={displayedPhoto}
                      alt={memory.title}
                      referrerPolicy="no-referrer"
                      initial={{ opacity: 0.3, scale: 1.02 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0.2, scale: 0.98 }}
                      transition={{ duration: 0.25 }}
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
                      className="map-journal-photo-img"
                    />
                  </AnimatePresence>
                  <div className="map-journal-photo-gloss" aria-hidden="true" />
                </div>

                {/* 相纸右下角暗房打印编号 */}
                {availablePhotos.length > 1 && (
                  <div className="map-journal-photo-badge font-mono">
                    <span>{String(photoIdx + 1).padStart(2, '0')}</span>
                    <span className="opacity-40">/</span>
                    <span>{String(availablePhotos.length).padStart(2, '0')}</span>
                  </div>
                )}
              </div>

              {/* 跨页旅行双环航空邮戳 */}
              <div className="map-journal-postmark" aria-hidden="true">
                <span className="map-journal-postmark-code">MEMORAE</span>
                <span className="map-journal-postmark-date">{displayDate.replace(/\./g, '')}</span>
              </div>

              {/* 随附底片画廊缩略条（Filmstrip） */}
              {availablePhotos.length > 1 && (
                <div className="map-journal-filmstrip" aria-label="底片画廊" role="tablist">
                  {availablePhotos.map((photo, index) => {
                    const isActive = index === photoIdx;
                    return (
                      <button
                        key={`${photo}-${index}`}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        aria-label={`切换到第 ${index + 1} 张照片`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPhotoIdx(index);
                        }}
                        className={`map-journal-film-thumb ${isActive ? 'is-active' : ''}`}
                      >
                        <img
                          src={photo}
                          alt={`缩略图 ${index + 1}`}
                          referrerPolicy="no-referrer"
                          className="map-journal-film-img"
                        />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 翻页切换控制器 */}
              {availablePhotos.length > 1 && (
                <div className="map-journal-photo-nav" aria-label="翻看随附照片">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); goPhoto(-1); }}
                    aria-label="上一张照片"
                    className="map-journal-nav-btn"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="map-journal-nav-hint font-mono">
                    {photoIdx + 1} / {availablePhotos.length}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); goPhoto(1); }}
                    aria-label="下一张照片"
                    className="map-journal-nav-btn"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* 无照片记忆时的典雅手绘手帐素描白页 */
            <div className="map-journal-photo-empty">
              <div className="map-journal-compass-seal">
                <Compass className="h-12 w-12 stroke-[1.2] text-amber-900/35" />
                <span className="font-editorial-serif text-amber-900/50 text-xs tracking-widest uppercase mt-3">
                  Memory Coordinates
                </span>
                <span className="text-[12px] font-mono text-stone-500 mt-1">
                  {metadataLocation || '纯文字珍藏回忆'}
                </span>
              </div>
            </div>
          )}
        </motion.section>
        </motion.div>

        {/* 右页：双时态时间轴手帐信笺（向内对折闭合） */}
        <motion.div
          className="map-journal-page-motion is-letter"
          initial={{ rotateY: pageAngle }}
          animate={{ rotateY: 0 }}
          exit={{ rotateY: -pageAngle, opacity: reduceMotion || narrowJournal ? 0 : 0.15 }}
          transition={closeTransition}
        >
        <motion.section className="map-journal-page map-journal-page-letter" aria-label="回忆信笺"
          initial={{ opacity: reduceMotion || narrowJournal ? 0 : 0.85 }} animate={{ opacity: 1 }}
          transition={{ duration: reduceMotion ? 0.12 : 0.24 }}>
          {/* 顶部手帐操作与状态栏 */}
          <header className="map-journal-header">
            <div className="map-journal-tagline">
              <span className="map-journal-tagline-text">
                {isEditing ? '· 草稿书写中 ·' : saveStatus === 'saved' ? '· 已密文固化 ·' : '· 旅人档案 ·'}
              </span>
            </div>

            <div className="map-journal-actions">
              {!isEditing && onSaveMemory && (
                <button
                  type="button"
                  onClick={beginEditing}
                  className="map-journal-action-btn is-edit"
                  aria-label="编辑记忆"
                  title="编辑这页记忆"
                >
                  <PenLine className="h-3.5 w-3.5" strokeWidth={1.7} />
                  <span>编辑</span>
                </button>
              )}
              {isEditing && (
                <button
                  type="button"
                  onClick={cancelEditing}
                  disabled={saveStatus === 'saving'}
                  className="map-journal-action-btn is-cancel"
                >
                  取消
                </button>
              )}
              {isEditing && onSaveMemory && (
                <button
                  type="button"
                  onClick={() => void completeEditing()}
                  disabled={saveStatus === 'saving' || (draftMemory.location?.name.trim() !== '' && locationResolution !== 'resolved')}
                  className="map-journal-action-btn is-save"
                >
                  {saveStatus === 'saving' ? (
                    <>
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      <span>保存中</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" strokeWidth={2} />
                      <span>保存</span>
                    </>
                  )}
                </button>
              )}
              {onDeleteMemory && (
                <div className="map-memory-more-wrap">
                  <button
                    type="button"
                    className="map-journal-action-btn is-icon"
                    onClick={() => setMoreOpen((open) => !open)}
                    aria-label="更多操作"
                    aria-expanded={moreOpen}
                    aria-haspopup="menu"
                    title="更多操作"
                  >
                    <MoreHorizontal className="h-4 w-4" strokeWidth={1.6} />
                  </button>
                  {moreOpen && (
                    <div className="map-memory-more-menu" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => { setMoreOpen(false); setDeleteArmed(true); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
                        删除这页记忆
                      </button>
                    </div>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="合上手帐"
                title="合上手帐 (Esc)"
                className="map-journal-action-btn is-icon is-close"
              >
                <X className="h-4 w-4" strokeWidth={1.7} />
              </button>
            </div>
          </header>

          {/* 标题与元数据区域 */}
          <div className="map-journal-intro">
            {isEditing ? (
              <input
                value={draftMemory.title}
                onChange={(event) => updateDraft('title', event.target.value)}
                placeholder="给这段记忆起个名字"
                className="map-journal-title-input font-editorial-serif"
                aria-label="编辑记忆标题"
                autoFocus
              />
            ) : (
              <h2 className="map-journal-title font-editorial-serif">
                {memory.title || '未命名记忆'}
              </h2>
            )}

            {!isEditing ? (
              /* 只读状态下的优雅元数据行：带日历、图钉与主题徽章 */
              <div className="map-journal-meta-row" aria-label="记忆信息">
                <span className="map-journal-meta-item">
                  <Calendar className="h-3.5 w-3.5 text-amber-800/65" aria-hidden="true" />
                  <time>{displayDate}</time>
                </span>
                {metadataLocation && (
                  <>
                    <span className="map-journal-meta-dot" aria-hidden="true">·</span>
                    <span className="map-journal-meta-item">
                      <MapPin className="h-3.5 w-3.5 text-amber-800/65" aria-hidden="true" />
                      <span>{metadataLocation}</span>
                    </span>
                  </>
                )}
                <span className="map-journal-meta-dot" aria-hidden="true">·</span>
                <span className="map-journal-meta-tag font-sans">
                  <Tag className="h-3 w-3 text-amber-900/50" aria-hidden="true" />
                  <span>{categoryLabel(memory.category)}</span>
                </span>
              </div>
            ) : (
              /* 编辑状态下的结构化表单排版：两行清晰分离 */
              <div className="map-journal-edit-form">
                <div className="map-journal-edit-row">
                  <div className="map-journal-field-group">
                    <label htmlFor="edit-journal-date" className="map-journal-field-label">日期</label>
                    <div className="map-journal-input-wrap">
                      <Calendar className="h-3.5 w-3.5 text-amber-900/50 ml-2.5 shrink-0" aria-hidden="true" />
                      <input
                        id="edit-journal-date"
                        type="date"
                        value={draftMemory.date.replace(/\./g, '-')}
                        onChange={(event) => updateDraft('date', event.target.value.replace(/-/g, '.'))}
                        className="map-journal-input"
                        aria-label="编辑记忆日期"
                        required
                      />
                    </div>
                  </div>

                  <div className="map-journal-field-group">
                    <label htmlFor="edit-journal-category" className="map-journal-field-label">主题</label>
                    <div className="map-journal-input-wrap">
                      <Tag className="h-3.5 w-3.5 text-amber-900/50 ml-2.5 shrink-0" aria-hidden="true" />
                      <select
                        id="edit-journal-category"
                        value={draftMemory.category}
                        onChange={(event) => updateDraft('category', event.target.value as CategoryType)}
                        className="map-journal-select"
                        aria-label="编辑记忆主题"
                      >
                        {CATEGORY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="map-journal-field-group is-location">
                  <div className="flex items-center justify-between">
                    <label className="map-journal-field-label">地点</label>
                    {locationResolution === 'resolving' && (
                      <span className="map-journal-location-badge is-resolving">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        正在解析行政信息…
                      </span>
                    )}
                    {locationResolution === 'error' && (
                      <span className="map-journal-location-badge is-error">
                        需在地图上重新选点
                      </span>
                    )}
                    {locationResolution === 'resolved' && draftMemory.location?.name && (
                      <span className="map-journal-location-badge is-resolved">
                        已定位到地图
                      </span>
                    )}
                  </div>
                  <div className="map-journal-input-wrap is-picker">
                    <LocationPicker
                      selectedLabel={draftMemory.location?.name ?? ''}
                      query={locationQuery}
                      onQueryChange={updateDraftLocationQuery}
                      onPickOnMap={() => setShowLocationMap(true)}
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
                      placeholder="输入地点，或点击右侧图钉在大地图上选择"
                      inputClassName="map-journal-location-input"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 双时态时光轴（The Thread） */}
          <div className="map-journal-thread">
            {/* 贯穿始终的时空线轨 */}
            <div className="map-journal-thread-rail" aria-hidden="true">
              <span className="map-journal-thread-node is-past">昔</span>
              <span className="map-journal-thread-line" />
              <span className="map-journal-thread-node is-present">今</span>
            </div>

            {/* 叙事正文区域 */}
            <div className="map-journal-thread-content">
              {/* 当时的我 */}
              <section className="map-journal-entry">
                <h3 className="map-journal-entry-heading font-editorial-serif">当时的我</h3>
                {isEditing ? (
                  <textarea
                    value={draftMemory.pastSelf}
                    onChange={(event) => updateDraft('pastSelf', event.target.value)}
                    placeholder="记下当时发生的事、心情和你看见的风景…"
                    className="map-journal-textarea"
                    aria-label="编辑当时的我"
                  />
                ) : memory.pastSelf ? (
                  <p className="map-journal-entry-text">{memory.pastSelf}</p>
                ) : (
                  <p className="map-journal-entry-empty font-editorial-serif italic">
                    当时未曾留下只字片语…
                  </p>
                )}
              </section>

              {/* 现在的我 */}
              {(readerMode === 'reflection' || isEditing || memory.presentSelf) && (
                <section className="map-journal-entry is-present">
                  <h3 className="map-journal-entry-heading font-editorial-serif">现在的我</h3>
                  {isEditing ? (
                    <textarea
                      value={draftMemory.presentSelf}
                      onChange={(event) => updateDraft('presentSelf', event.target.value)}
                      placeholder="此刻回望，这段经历留下了什么？"
                      className="map-journal-textarea"
                      aria-label="编辑现在的我"
                    />
                  ) : memory.presentSelf ? (
                    <p className="map-journal-entry-text">{memory.presentSelf}</p>
                  ) : (
                    <p className="map-journal-entry-empty font-editorial-serif italic">
                      时光漫过，你尚未写下此刻的回望…
                    </p>
                  )}
                </section>
              )}
            </div>
          </div>

          {/* 右下角复古旅行档案编码印戳（压住版面视觉重心，杜绝空虚感） */}
          {!isEditing && (
            <div className="map-journal-archival-stamp font-editorial-serif" aria-hidden="true">
              <div className="map-journal-archival-inner">
                <span className="map-journal-archival-code">ARCHIVE · {memory.year || (memory.date ? memory.date.slice(0, 4) : 'MEM')}</span>
                <span className="map-journal-archival-loc font-mono">{detailLocation || 'TRAVEL RECORD'}</span>
              </div>
            </div>
          )}

          {isEditing && (
            <p className={`map-journal-hint ${saveStatus === 'error' ? 'is-error' : ''}`}>
              {saveStatus === 'error'
                ? '草稿保存失败，请检查地点是否已完成定位后再重试。'
                : '修改会即时保存在本地草稿中 · 按 Ctrl + Enter 可快捷保存。'}
            </p>
          )}
        </motion.section>
        </motion.div>
      </motion.main>

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
