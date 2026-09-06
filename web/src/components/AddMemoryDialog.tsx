import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowLeft,
  Calendar,
  Check,
  ImagePlus,
  Loader2,
  LoaderCircle,
  Plus,
  Tag,
  X,
} from 'lucide-react';
import type { CategoryType, Memory, MemoryLocationDraft, PinnedBy } from '../types';
import { selectLocalPhoto } from '../product/selectPhoto';
import { readPhotoMetadata } from '../product/photoMetadata';
import { hasResolvedAdministrativeLocation, resolvePlaceCandidate, reverseGeocodeCoordinates, type PlaceCandidate } from '../lib/geo';
import { convertGpsToAmap } from '../lib/locationApi';
import { resolveLocationWithRetry } from '../lib/locationLookup';
import LocationMapSelection from './LocationMapSelection';
import LocationPicker from './LocationPicker';
import './AddMemoryDialog.css';

interface AddMemoryDialogProps {
  onClose: () => void;
  onAddMemory?: (newMemory: Omit<Memory, 'id' | 'px' | 'py' | 'rotation'>) => Promise<void>;
  onSaveMemory?: (memory: Memory) => Promise<void>;
  memory?: Memory;
  isFirstMemory?: boolean;
  initialLocation?: MemoryLocationDraft;
  initialPhoto?: File;
}

type SaveState = 'idle' | 'saving' | 'error';
type LocationResolution = 'idle' | 'resolving' | 'resolved' | 'error';

interface SelectedLocation {
  name: string;
  lat: number;
  lng: number;
  country?: string;
  province?: string;
  city?: string;
  district?: string;
  adcode?: string;
  provider?: 'amap' | 'bigdatacloud';
  providerId?: string;
}

const CATEGORY_OPTIONS: Array<{ value: CategoryType; label: string }> = [
  { value: 'travel', label: '旅行' },
  { value: 'growth', label: '成长' },
  { value: 'motorcycle', label: '日常' },
  { value: 'photography', label: '瞬间' },
];

function defaultTag(category: CategoryType) {
  if (category === 'travel') return '足迹';
  if (category === 'growth') return '成长';
  if (category === 'motorcycle') return '日常';
  return '瞬间';
}

function dateFromFileTimestamp(timestamp: number): string | undefined {
  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) return undefined;
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function dateInputValue(date: string, fallbackYear?: number): string {
  const match = date.trim().match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
  if (match) {
    const [, year, month, day] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return fallbackYear ? `${fallbackYear}-01-01` : '';
}

function selectedLocationFromMemory(memory?: Memory): SelectedLocation | null {
  if (!memory?.location?.name || !Number.isFinite(memory.lat) || !Number.isFinite(memory.lng)) return null;
  return {
    name: memory.location.name,
    lat: memory.lat as number,
    lng: memory.lng as number,
    country: memory.country,
    province: memory.province,
    city: memory.city,
    district: memory.district ?? memory.detailLocation,
    adcode: memory.adcode,
    provider: memory.locationProvider,
    providerId: memory.locationProviderId,
  };
}

function selectedLocationFromDraft(draft?: MemoryLocationDraft): SelectedLocation | null {
  if (!draft || !Number.isFinite(draft.lat) || !Number.isFinite(draft.lng)) return null;
  return {
    name: draft.name,
    lat: draft.lat,
    lng: draft.lng,
    country: draft.country,
    province: draft.province,
    city: draft.city,
    district: draft.district,
    adcode: draft.adcode,
    provider: draft.provider,
    providerId: draft.providerId,
  };
}

function locationNeedsResolution(location: SelectedLocation | null): boolean {
  if (!location) return false;
  const country = location.country?.trim() || '';
  const isChina = country.includes('中国') || country.includes('中國');
  return !location.city?.trim()
    || !location.province?.trim()
    || (isChina && /(?:区|县|旗|镇)$/.test(location.city.trim()));
}

export default function AddMemoryDialog({
  onClose,
  onAddMemory,
  onSaveMemory,
  memory,
  isFirstMemory = false,
  initialLocation: initialLocationDraft,
  initialPhoto,
}: AddMemoryDialogProps) {
  const isEditing = Boolean(memory);
  const initialLocation = selectedLocationFromMemory(memory) ?? selectedLocationFromDraft(initialLocationDraft);
  const [title, setTitle] = useState(memory?.title ?? '');
  const [date, setDate] = useState(() => dateInputValue(memory?.date ?? '', memory?.year));
  const [category, setCategory] = useState<CategoryType>(memory?.category ?? 'travel');
  const [pastSelf, setPastSelf] = useState(memory?.pastSelf ?? '');
  const [presentSelf, setPresentSelf] = useState(memory?.presentSelf ?? '');
  const [tag, setTag] = useState(memory?.tag ?? '');
  const [imageUrl, setImageUrl] = useState(memory?.image ?? '');
  const [galleryImages, setGalleryImages] = useState<string[]>(memory?.gallery ?? []);
  const [locationQuery, setLocationQuery] = useState(initialLocation ? '' : (memory?.location?.name ?? ''));
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(initialLocation);
  const [locationResolution, setLocationResolution] = useState<LocationResolution>(
    initialLocation && !locationNeedsResolution(initialLocation) ? 'resolved' : 'idle',
  );
  const [detailLocation, setDetailLocation] = useState(memory?.detailLocation ?? '');
  const [isCoverUploading, setIsCoverUploading] = useState(false);
  const [isGalleryUploading, setIsGalleryUploading] = useState(false);
  const [showLocationMap, setShowLocationMap] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [validationMessage, setValidationMessage] = useState('');
  const coverInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const dateAutoRef = useRef(false);
  const locationAutoRef = useRef(false);
  const dateValueRef = useRef(date);
  const locationValueRef = useRef(initialLocation?.name ?? '');
  const photoMetadataRequestRef = useRef(0);
  const locationRequestRef = useRef(0);

  useEffect(() => {
    const submitWithShortcut = (event: KeyboardEvent) => {
      if (showLocationMap || event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey)) return;
      event.preventDefault();
      formRef.current?.requestSubmit();
    };

    window.addEventListener('keydown', submitWithShortcut);
    return () => window.removeEventListener('keydown', submitWithShortcut);
  }, [showLocationMap]);

  useEffect(() => {
    if (!initialLocation || !locationNeedsResolution(initialLocation)) return;
    const requestId = locationRequestRef.current + 1;
    locationRequestRef.current = requestId;
    let cancelled = false;
    setLocationResolution('resolving');
    void resolveLocationWithRetry(
      () => reverseGeocodeCoordinates(initialLocation.lat, initialLocation.lng),
    ).then((reverse) => {
      if (cancelled || requestId !== locationRequestRef.current) return;
      if (!hasResolvedAdministrativeLocation(reverse)) {
        setLocationResolution('error');
        return;
      }
      confirmLocation({
        ...initialLocation,
        // 地图创建入口只传坐标和占位名；反查成功后必须展示真实 POI 或格式化地址。
        name: reverse.placeName?.trim() || reverse.label?.trim() || reverse.formattedAddress?.trim() || initialLocation.name,
        country: reverse.country ?? initialLocation.country,
        province: reverse.province ?? initialLocation.province,
        city: reverse.city ?? initialLocation.city,
        district: reverse.district ?? initialLocation.district,
        adcode: reverse.adcode ?? initialLocation.adcode,
        provider: reverse.provider ?? initialLocation.provider,
      });
      setDetailLocation((current) => current || reverse.district || '');
      setLocationResolution('resolved');
    });
    return () => {
      cancelled = true;
    };
  }, [initialLocation?.lat, initialLocation?.lng, initialLocation?.city, initialLocation?.province]);

  const confirmLocation = (result: SelectedLocation) => {
    setSelectedLocation(result);
    setLocationQuery('');
    locationValueRef.current = result.name;
  };

  const selectLocationCandidate = async (candidate: PlaceCandidate) => {
    const requestId = locationRequestRef.current + 1;
    locationRequestRef.current = requestId;
    locationAutoRef.current = false;
    confirmLocation({
      name: candidate.shortName,
      lat: candidate.lat,
      lng: candidate.lng,
      country: candidate.country,
      district: candidate.district,
      adcode: candidate.adcode,
      provider: candidate.provider,
      providerId: candidate.providerId,
    });
    setLocationResolution('resolving');
    const resolved = await resolveLocationWithRetry(
      () => resolvePlaceCandidate(candidate),
    );
    if (requestId !== locationRequestRef.current) return;
    if (!hasResolvedAdministrativeLocation(resolved)) {
      setLocationResolution('error');
      setValidationMessage('地点的行政信息尚未确认，请重试或在地图上选择。');
      return;
    }
    confirmLocation({
      name: candidate.shortName,
      lat: candidate.lat,
      lng: candidate.lng,
      country: resolved.country,
      province: resolved.province,
      city: resolved.city,
      district: resolved.district,
      adcode: resolved.adcode,
      provider: resolved.provider,
      providerId: candidate.providerId,
    });
    setDetailLocation((current) => current || resolved.district || '');
    setLocationResolution('resolved');
    setValidationMessage('');
  };

  const locationName = selectedLocation?.name ?? locationQuery;
  const isLocationConfirmed = selectedLocation !== null;

  const applyPhotoMetadata = async (file: File) => {
    const requestId = photoMetadataRequestRef.current + 1;
    photoMetadataRequestRef.current = requestId;
    const metadata = await readPhotoMetadata(file);
    if (requestId !== photoMetadataRequestRef.current) return;

    const detectedDate = metadata.date || dateFromFileTimestamp(file.lastModified);
    if (detectedDate && (!dateValueRef.current.trim() || dateAutoRef.current)) {
      dateAutoRef.current = true;
      dateValueRef.current = detectedDate;
      setDate(detectedDate);
    }

    const hasGps = metadata.latitude !== undefined && metadata.longitude !== undefined;
    if (hasGps && (!locationValueRef.current.trim() || locationAutoRef.current)) {
      const latitude = metadata.latitude as number;
      const longitude = metadata.longitude as number;
      const converted = await convertGpsToAmap({ lat: latitude, lng: longitude });
      if (requestId !== photoMetadataRequestRef.current || (!locationAutoRef.current && locationValueRef.current.trim())) return;
      if (!converted) return;
      const reverse = await reverseGeocodeCoordinates(converted.lat, converted.lng);
      if (requestId !== photoMetadataRequestRef.current || (!locationAutoRef.current && locationValueRef.current.trim())) return;
      if (!hasResolvedAdministrativeLocation(reverse)) {
        setLocationResolution('error');
        return;
      }
      const label = reverse?.label || reverse?.city || reverse?.country || '已读取照片 GPS';
      setDetailLocation((current) => current.trim() || reverse?.district || '');
      locationAutoRef.current = true;
      confirmLocation({
        name: label,
        lat: converted.lat,
        lng: converted.lng,
        country: reverse?.country,
        province: reverse?.province,
        city: reverse?.city,
        district: reverse?.district,
        adcode: reverse?.adcode,
        provider: reverse?.provider,
      });
      setLocationResolution('resolved');
    }
  };

  const selectCover = async (file: File | undefined) => {
    if (!file) return;
    setIsCoverUploading(true);
    try {
      setImageUrl(await selectLocalPhoto(file));
      await applyPhotoMetadata(file);
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : '照片处理失败，请重试。');
    } finally {
      setIsCoverUploading(false);
    }
  };

  useEffect(() => {
    if (isEditing || !initialPhoto) return;
    void selectCover(initialPhoto);
  }, [initialPhoto, isEditing]);

  const selectGalleryPhoto = async (file: File | undefined) => {
    if (!file) return;
    setIsGalleryUploading(true);
    try {
      const image = await selectLocalPhoto(file);
      setGalleryImages((images) => images.includes(image) ? images : [...images, image]);
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : '照片处理失败，请重试。');
    } finally {
      setIsGalleryUploading(false);
    }
  };

  const submitMemory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saveState === 'saving') return;

    const parsedYear = Number.parseInt(date.split('-')[0], 10);
    if (!Number.isInteger(parsedYear) || parsedYear < 1900 || parsedYear > 2100) {
      setSaveState('error');
      setValidationMessage('请填写有效的日期。');
      return;
    }
    if (isFirstMemory && (!imageUrl || !isLocationConfirmed)) {
      setSaveState('error');
      setValidationMessage('第一段记忆需要确认照片、时间和地点。');
      return;
    }
    if (locationName.trim() && (!isLocationConfirmed || locationResolution !== 'resolved')) {
      setSaveState('error');
      setValidationMessage('请等待地点行政信息确认完成后再保存。');
      return;
    }

    setSaveState('saving');
    setValidationMessage('');
    try {
      if (memory) {
        if (!onSaveMemory) throw new Error('当前记忆无法保存。');
        const hasUnconfirmedLocationText = !selectedLocation && Boolean(locationQuery.trim());
        await onSaveMemory({
          ...memory,
          title: title.trim() || '未命名记忆',
          date: date.replace(/-/g, '.'),
          year: parsedYear,
          category,
          tag: tag.trim() || defaultTag(category),
          image: imageUrl,
          gallery: galleryImages.filter((image) => image && image !== imageUrl),
          pastSelf: pastSelf.trim(),
          presentSelf: presentSelf.trim(),
          location: locationName.trim()
            ? {
                name: locationName.trim(),
                mx: memory.location?.mx ?? 50,
                my: memory.location?.my ?? 50,
              }
            : undefined,
          country: selectedLocation?.country?.trim() || (hasUnconfirmedLocationText ? undefined : memory.country),
          province: selectedLocation?.province?.trim() || (hasUnconfirmedLocationText ? undefined : memory.province),
          city: selectedLocation?.city?.trim() || (hasUnconfirmedLocationText ? undefined : memory.city),
          district: selectedLocation?.district?.trim() || (hasUnconfirmedLocationText ? undefined : memory.district),
          adcode: selectedLocation?.adcode?.trim() || (hasUnconfirmedLocationText ? undefined : memory.adcode),
          locationProvider: selectedLocation?.provider || (hasUnconfirmedLocationText ? undefined : memory.locationProvider),
          locationProviderId: selectedLocation?.providerId || (hasUnconfirmedLocationText ? undefined : memory.locationProviderId),
          lat: selectedLocation?.lat ?? (hasUnconfirmedLocationText ? undefined : memory.lat),
          lng: selectedLocation?.lng ?? (hasUnconfirmedLocationText ? undefined : memory.lng),
          detailLocation: detailLocation.trim() || undefined,
        });
      } else {
        if (!onAddMemory) throw new Error('当前记忆无法创建。');
        await onAddMemory({
          title: title.trim() || '未命名记忆',
          date: date.replace(/-/g, '.'),
          year: parsedYear,
          category,
          tag: tag.trim() || defaultTag(category),
          image: imageUrl,
          gallery: galleryImages.filter((image) => image && image !== imageUrl),
          pastSelf: pastSelf.trim(),
          presentSelf: presentSelf.trim(),
          pinnedBy: 'pin' as PinnedBy,
          location: locationName.trim() ? { name: locationName.trim(), mx: 50, my: 50 } : undefined,
          country: selectedLocation?.country?.trim() || undefined,
          province: selectedLocation?.province?.trim() || undefined,
          city: selectedLocation?.city?.trim() || undefined,
          district: selectedLocation?.district?.trim() || undefined,
          adcode: selectedLocation?.adcode?.trim() || undefined,
          locationProvider: selectedLocation?.provider,
          locationProviderId: selectedLocation?.providerId,
          lat: selectedLocation?.lat,
          lng: selectedLocation?.lng,
          detailLocation: detailLocation.trim() || undefined,
        });
      }
      onClose();
    } catch (error) {
      console.error(error);
      setSaveState('error');
      setValidationMessage('保存失败，请检查后重试。');
    }
  };

  if (showLocationMap) {
    return (
      <LocationMapSelection
        initialCoordinates={selectedLocation ? { lat: selectedLocation.lat, lng: selectedLocation.lng } : null}
        fallbackName={locationName}
        onCancel={() => setShowLocationMap(false)}
          onConfirm={(selection) => {
            locationRequestRef.current += 1;
            if (!selection.resolved) {
              setLocationResolution('error');
              setValidationMessage('地点的行政信息尚未确认，请重试。');
              setShowLocationMap(false);
              return;
            }
          locationAutoRef.current = false;
          confirmLocation(selection);
          setLocationResolution('resolved');
          setValidationMessage('');
          if (selection.district) setDetailLocation(selection.district);
          setShowLocationMap(false);
        }}
      />
    );
  }

  return (
    <div className="memory-create-editor fixed inset-0 z-[1200] flex items-center justify-center overflow-hidden" aria-label={isEditing ? '修改记忆' : '创作新记忆'}>
      {/* 沉静暗调夜幕背景，彻底消除刺眼地图底色干扰，点击外部可收起 */}
      <div className="map-journal-backdrop absolute inset-0" onClick={onClose} aria-hidden="true" />

      {/* 双页旅行手帐创作画卷 */}
      <main className="map-journal-folio pointer-events-auto relative z-10">
        {/* 书脊折痕装订线、锁线孔与垂落红丝带 */}
        <div className="map-journal-spine" aria-hidden="true" />
        <div className="map-journal-ribbon" aria-hidden="true" />
        <div className="map-journal-spine-stitches" aria-hidden="true">
          <span className="map-journal-stitch" />
          <span className="map-journal-stitch" />
          <span className="map-journal-stitch" />
        </div>

        {/* 左页：实体相纸台或复古相角插槽 */}
        <section className="map-journal-page map-journal-page-photo" aria-label="记忆照片">
          <div className="map-journal-photo-stage">
            {imageUrl ? (
              <>
                {/* 冲印相纸卡框（右上与左下贴手撕和纸胶带） */}
                <div className="map-journal-photo-paper group">
                  <div className="map-journal-tape is-tr" aria-hidden="true" />
                  <div className="map-journal-tape is-bl" aria-hidden="true" />

                  <div className="map-journal-photo-inner">
                    <img src={imageUrl} alt={isEditing ? '记忆照片预览' : '新记忆照片预览'} referrerPolicy="no-referrer" className="map-journal-photo-img" />
                    <div className="map-journal-photo-gloss" aria-hidden="true" />
                  </div>

                  <button
                    type="button"
                    onClick={() => coverInputRef.current?.click()}
                    className="map-journal-change-photo-btn"
                  >
                    <ImagePlus size={13} aria-hidden="true" />
                    <span>更换照片</span>
                  </button>
                </div>

                {/* 随附底片画廊 */}
                <div className="map-journal-filmstrip" aria-label="随附照片">
                  {galleryImages.map((image, index) => (
                    <div key={image} className="map-journal-film-thumb group/thumb">
                      <img src={image} alt={`随附底片 ${index + 1}`} referrerPolicy="no-referrer" className="map-journal-film-img" />
                      <button
                        type="button"
                        onClick={() => setGalleryImages((images) => images.filter((item) => item !== image))}
                        aria-label={`移除随附照片 ${index + 1}`}
                        className="map-journal-film-remove"
                      >
                        <X size={10} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    disabled={isGalleryUploading}
                    aria-label="添加随附照片"
                    className="map-journal-film-add"
                    title="添加随附照片"
                  >
                    {isGalleryUploading ? <LoaderCircle size={14} className="animate-spin" /> : <Plus size={14} aria-hidden="true" />}
                  </button>
                </div>
              </>
            ) : (
              /* 未选照片时的复古相角槽位 */
              <div
                className="map-journal-slot-paper cursor-pointer group"
                onClick={() => coverInputRef.current?.click()}
                role="button"
                tabIndex={0}
              >
                <div className="map-journal-corner is-tl" aria-hidden="true" />
                <div className="map-journal-corner is-tr" aria-hidden="true" />
                <div className="map-journal-corner is-bl" aria-hidden="true" />
                <div className="map-journal-corner is-br" aria-hidden="true" />

                <div className="map-journal-slot-inner">
                  <ImagePlus size={38} className="text-amber-900/40 group-hover:text-amber-900/70 transition-colors" />
                  <span className="font-editorial-serif text-stone-700 text-sm font-medium mt-2">
                    放入一张旅行照片
                  </span>
                  <small className="text-stone-400 text-[11px] mt-1">
                    （也可以保存一段纯文字记忆）
                  </small>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 右页：双时态手帐信笺表单 */}
        <section className="map-journal-page map-journal-page-letter" aria-label="手帐信笺">
          <form id="new-memory-editor" ref={formRef} className="flex flex-col h-full justify-between" onSubmit={(event) => { void submitMemory(event); }}>
            <div>
              {/* 顶部手帐操作区 */}
              <header className="map-journal-header">
                <div className="map-journal-tagline">
                  <span className="map-journal-tagline-text">
                    {isEditing ? '· 修改记忆档案 ·' : '· 新记忆创作档案 ·'}
                  </span>
                </div>
                <div className="map-journal-actions">
                  <button type="button" onClick={onClose} className="map-journal-action-btn is-cancel">
                    <ArrowLeft size={13} aria-hidden="true" />
                    <span>{isEditing ? '返回地图' : '取消'}</span>
                  </button>
                  <button
                    type="submit"
                    className="map-journal-action-btn is-save"
                    disabled={saveState === 'saving' || (locationName.trim().length > 0 && locationResolution !== 'resolved')}
                  >
                    {saveState === 'saving' ? (
                      <>
                        <LoaderCircle size={14} className="animate-spin" />
                        <span>保存中</span>
                      </>
                    ) : (
                      <>
                        <Check size={14} strokeWidth={2} />
                        <span>{isEditing ? '保存修改' : '完成'}</span>
                      </>
                    )}
                  </button>
                </div>
              </header>

              {/* 标题 */}
              <div className="map-journal-intro">
                <input
                  id="new-memory-title"
                  className="map-journal-title-input font-editorial-serif"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={isFirstMemory ? '给这段记忆起个名字（可选）' : '给这段记忆起个名字'}
                  autoFocus
                />

                {/* 编辑表单字段（日期、主题、地点） */}
                <div className="map-journal-edit-form">
                  <div className="map-journal-edit-row">
                    <div className="map-journal-field-group">
                      <label htmlFor="new-memory-date" className="map-journal-field-label">日期</label>
                      <div className="map-journal-input-wrap">
                        <Calendar size={14} className="text-amber-900/50 ml-2.5 shrink-0" aria-hidden="true" />
                        <input
                          id="new-memory-date"
                          type="date"
                          value={date}
                          onChange={(event) => {
                            dateAutoRef.current = false;
                            dateValueRef.current = event.target.value;
                            setDate(event.target.value);
                          }}
                          className="map-journal-input"
                          aria-label="日期"
                          required
                        />
                      </div>
                    </div>

                    {!isFirstMemory && (
                      <div className="map-journal-field-group">
                        <label htmlFor="new-memory-category" className="map-journal-field-label">主题</label>
                        <div className="map-journal-input-wrap">
                          <Tag size={14} className="text-amber-900/50 ml-2.5 shrink-0" aria-hidden="true" />
                          <select
                            id="new-memory-category"
                            value={category}
                            onChange={(event) => setCategory(event.target.value as CategoryType)}
                            className="map-journal-select"
                            aria-label="主题"
                          >
                            {CATEGORY_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="map-journal-field-group is-location">
                    <div className="flex items-center justify-between">
                      <label className="map-journal-field-label">地点</label>
                      {locationName.trim() && !isLocationConfirmed && (
                        <span className="map-journal-location-badge is-resolving">尚未定位到地图</span>
                      )}
                      {isLocationConfirmed && locationResolution === 'resolving' && (
                        <span className="map-journal-location-badge is-resolving">正在确认地点行政信息…</span>
                      )}
                      {isLocationConfirmed && locationResolution === 'error' && (
                        <span className="map-journal-location-badge is-error">地点确认失败，请重新选择</span>
                      )}
                      {isLocationConfirmed && locationResolution === 'resolved' && (
                        <span className="map-journal-location-badge is-resolved">已定位到地图</span>
                      )}
                    </div>
                    <div className="map-journal-input-wrap is-picker">
                      <LocationPicker
                        selectedLabel={selectedLocation?.name ?? ''}
                        query={locationQuery}
                        onQueryChange={(value) => {
                          locationRequestRef.current += 1;
                          locationAutoRef.current = false;
                          locationValueRef.current = value;
                          setLocationQuery(value);
                          setSelectedLocation(null);
                          setLocationResolution('idle');
                        }}
                        onSelect={(candidate) => { void selectLocationCandidate(candidate); }}
                        placeholder="输入地点，或点击右侧图钉在大地图上选择"
                        inputClassName="map-journal-location-input"
                        onPickOnMap={() => setShowLocationMap(true)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 双时态时光轴（昔与今） */}
              <div className="map-journal-thread">
                <div className="map-journal-thread-rail" aria-hidden="true">
                  <span className="map-journal-thread-node is-past">昔</span>
                  <span className="map-journal-thread-line" />
                  <span className="map-journal-thread-node is-present">今</span>
                </div>

                <div className="map-journal-thread-content">
                  <section className="map-journal-entry">
                    <h3 className="map-journal-entry-heading font-editorial-serif">
                      {isFirstMemory ? '写下你还记得的事（可选）' : '当时的我'}
                    </h3>
                    <textarea
                      id="new-memory-past"
                      className="map-journal-textarea"
                      value={pastSelf}
                      onChange={(event) => setPastSelf(event.target.value)}
                      placeholder="记下当时发生的事、心情和你看见的风景…"
                    />
                  </section>

                  {!isFirstMemory && (
                    <section className="map-journal-entry is-present">
                      <h3 className="map-journal-entry-heading font-editorial-serif">现在的我</h3>
                      <textarea
                        id="new-memory-present"
                        className="map-journal-textarea"
                        value={presentSelf}
                        onChange={(event) => setPresentSelf(event.target.value)}
                        placeholder="此刻回望，这段经历留下了什么？"
                      />
                    </section>
                  )}
                </div>
              </div>

              {!isFirstMemory && (
                <details className="map-journal-details mt-3">
                  <summary className="text-[11.5px] font-medium text-amber-900/60 hover:text-amber-900 cursor-pointer">
                    补充地点备注与标签
                  </summary>
                  <div className="grid grid-cols-2 gap-2.5 mt-2">
                    <input
                      value={tag}
                      onChange={(event) => setTag(event.target.value)}
                      placeholder="标签（如：自驾游）"
                      className="map-journal-input border border-amber-900/20 rounded px-2 bg-white/70"
                      aria-label="标签"
                    />
                    <input
                      value={detailLocation}
                      onChange={(event) => setDetailLocation(event.target.value)}
                      placeholder="地点备注（如：老街路口）"
                      className="map-journal-input border border-amber-900/20 rounded px-2 bg-white/70"
                      aria-label="地点备注"
                    />
                  </div>
                </details>
              )}
            </div>

            <p className={`map-journal-hint ${saveState === 'error' ? 'is-error' : ''}`}>
              {saveState === 'saving'
                ? '正在加密并保存…'
                : saveState === 'error'
                ? validationMessage
                : isEditing
                ? '修改会在当前设备加密保存 · 按 Ctrl + Enter 完成'
                : '草稿仅保留在当前设备 · 按 Ctrl + Enter 完成'}
            </p>
          </form>
        </section>
      </main>

      <input ref={coverInputRef} type="file" accept="image/*" className="memory-create-file-input" onChange={(event) => { void selectCover(event.target.files?.[0]); event.target.value = ''; }} />
      <input ref={galleryInputRef} type="file" accept="image/*" className="memory-create-file-input" onChange={(event) => { void selectGalleryPhoto(event.target.files?.[0]); event.target.value = ''; }} />
    </div>
  );
}
