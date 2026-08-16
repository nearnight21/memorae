import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowLeft,
  Check,
  ImagePlus,
  LoaderCircle,
  Plus,
  Upload,
  X,
} from 'lucide-react';
import type { CategoryType, Memory, PinnedBy } from '../types';
import { selectLocalPhoto } from '../product/selectPhoto';
import { readPhotoMetadata } from '../product/photoMetadata';
import { reverseGeocodeCoordinates } from '../lib/geo';
import { convertGpsToAmap } from '../lib/locationApi';
import LocationMapSelection from './LocationMapSelection';
import LocationPicker from './LocationPicker';
import './AddMemoryDialog.css';

interface AddMemoryDialogProps {
  onClose: () => void;
  onAddMemory: (newMemory: Omit<Memory, 'id' | 'px' | 'py' | 'rotation'>) => Promise<void>;
  isFirstMemory?: boolean;
}

type CreateStep = 'source' | 'photo-review' | 'editor';
type SaveState = 'idle' | 'saving' | 'error';

interface SelectedLocation {
  name: string;
  lat: number;
  lng: number;
  country?: string;
  city?: string;
  district?: string;
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

export default function AddMemoryDialog({ onClose, onAddMemory, isFirstMemory = false }: AddMemoryDialogProps) {
  const [step, setStep] = useState<CreateStep>('source');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [category, setCategory] = useState<CategoryType>('travel');
  const [pastSelf, setPastSelf] = useState('');
  const [presentSelf, setPresentSelf] = useState('');
  const [tag, setTag] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [locationQuery, setLocationQuery] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null);
  const [detailLocation, setDetailLocation] = useState('');
  const [isCoverUploading, setIsCoverUploading] = useState(false);
  const [isGalleryUploading, setIsGalleryUploading] = useState(false);
  const [showLocationMap, setShowLocationMap] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [validationMessage, setValidationMessage] = useState('');
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const dateAutoRef = useRef(false);
  const locationAutoRef = useRef(false);
  const dateValueRef = useRef('');
  const locationValueRef = useRef('');
  const photoMetadataRequestRef = useRef(0);

  useEffect(() => {
    const submitWithShortcut = (event: KeyboardEvent) => {
      if (step !== 'editor' || event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey)) return;
      event.preventDefault();
      formRef.current?.requestSubmit();
    };

    window.addEventListener('keydown', submitWithShortcut);
    return () => window.removeEventListener('keydown', submitWithShortcut);
  }, [step]);

  const confirmLocation = (result: SelectedLocation) => {
    setSelectedLocation(result);
    setLocationQuery('');
    locationValueRef.current = result.name;
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
      const label = reverse?.label || reverse?.city || reverse?.country || '已读取照片 GPS';
      setDetailLocation((current) => current.trim() || reverse?.district || '');
      locationAutoRef.current = true;
      confirmLocation({
        name: label,
        lat: converted.lat,
        lng: converted.lng,
        country: reverse?.country,
        city: reverse?.city,
        district: reverse?.district,
      });
    }
  };

  const selectCover = async (file: File | undefined, nextStep: Extract<CreateStep, 'photo-review' | 'editor'> = 'editor') => {
    if (!file) return;
    setIsCoverUploading(true);
    try {
      setImageUrl(await selectLocalPhoto(file));
      // The first-memory review must show the settled EXIF values, not values
      // still being filled asynchronously underneath the next screen.
      await applyPhotoMetadata(file);
      setStep(nextStep);
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : '照片处理失败，请重试。');
    } finally {
      setIsCoverUploading(false);
    }
  };

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

    setSaveState('saving');
    setValidationMessage('');
    try {
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
        city: selectedLocation?.city?.trim() || undefined,
        lat: selectedLocation?.lat,
        lng: selectedLocation?.lng,
        detailLocation: detailLocation.trim() || undefined,
      });
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
          locationAutoRef.current = false;
          confirmLocation(selection);
          if (selection.district) setDetailLocation(selection.district);
          setShowLocationMap(false);
        }}
      />
    );
  }

  if (step === 'source') {
    return (
      <section className="memory-create-source" aria-label="添加记忆">
        <div className="memory-create-source-card">
          <button type="button" onClick={onClose} className="memory-create-dismiss" aria-label="关闭新增记忆">
            <X size={18} aria-hidden="true" />
          </button>
          <span className="memory-create-source-icon" aria-hidden="true"><Plus size={22} /></span>
          <h1>{isFirstMemory ? '先选择一张对你有意义的照片' : '添加一段记忆'}</h1>
          <p>{isFirstMemory
            ? '如果照片保留了拍摄信息，我们会自动填写时间和地点。'
            : <>从本地照片开始，或手动添加没有照片的记忆。<br />日期、地点和主题都可以稍后修改。</>}
          </p>
          <div className="memory-create-source-actions">
            <button
              type="button"
              className="memory-create-primary"
              onClick={() => sourceInputRef.current?.click()}
              disabled={isCoverUploading}
            >
              {isCoverUploading ? <LoaderCircle size={16} className="animate-spin" /> : <Upload size={16} />}
              {isFirstMemory ? '选择照片' : '导入本地照片'}
            </button>
            <button type="button" className="memory-create-secondary" onClick={isFirstMemory ? onClose : () => setStep('editor')}>
              {isFirstMemory ? '稍后再说' : '手动添加'}
            </button>
          </div>
          <p className="memory-create-source-privacy">照片与位置仅在设备内解密处理；离开设备时保持加密。</p>
          <input
            ref={sourceInputRef}
            type="file"
            accept="image/*"
            className="memory-create-file-input"
            onChange={(event) => {
              void selectCover(event.target.files?.[0], isFirstMemory ? 'photo-review' : 'editor');
              event.target.value = '';
            }}
          />
        </div>
      </section>
    );
  }

  if (step === 'photo-review') {
    return (
      <section className="memory-photo-review" aria-label="确认照片拍摄信息">
        <div className="memory-photo-review-card">
          <button type="button" onClick={() => setStep('source')} className="memory-create-dismiss" aria-label="重新选择照片">
            <X size={18} aria-hidden="true" />
          </button>
          <h1>已读到这张照片的拍摄信息</h1>
          <p>如果照片保留了拍摄信息，我们会先替你填写。确认后才会写入地图。</p>

          <dl className="memory-photo-review-readings">
            <div>
              <dt><Check size={16} aria-hidden="true" />拍摄时间</dt>
              <dd>{date || '未识别，可在下一步填写'}</dd>
            </div>
            <div>
              <dt><Check size={16} aria-hidden="true" />拍摄地点</dt>
              <dd>{locationName || '未识别，可在地图上选择'}</dd>
            </div>
          </dl>

          <div className="memory-photo-review-preview">
            {imageUrl && <img src={imageUrl} alt="已选择的照片" referrerPolicy="no-referrer" />}
            <div>
              <span>已选择 1 张照片</span>
              <strong>你可以在下一步确认或修改时间和地点</strong>
            </div>
          </div>

          <div className="memory-photo-review-actions">
            <button type="button" className="memory-create-primary" onClick={() => setStep('editor')}>确认后继续</button>
            <button type="button" className="memory-create-secondary" onClick={() => setShowLocationMap(true)}>地点不对？在地图上选择</button>
          </div>
          <small>自动识别仅用于预填，不会直接创建记忆。</small>
        </div>
      </section>
    );
  }

  return (
    <section className="memory-create-editor" aria-label="编辑新记忆">
      <header className="memory-editor-header">
        <p>足迹 / {selectedLocation?.country || '未标注地区'}{selectedLocation?.city ? ` / ${selectedLocation.city}` : ''}{locationName ? ` / ${locationName}` : ''}</p>
        <div className="memory-editor-header-actions">
          <button type="button" onClick={() => setStep('source')} className="memory-editor-back">
            <ArrowLeft size={16} aria-hidden="true" />
            返回
          </button>
          <button type="submit" form="new-memory-editor" className="memory-editor-complete" disabled={saveState === 'saving'}>
            {saveState === 'saving' ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} aria-hidden="true" />}
            完成
          </button>
        </div>
      </header>

      <form id="new-memory-editor" ref={formRef} className={`memory-editor-layout${isFirstMemory ? ' is-first-memory' : ''}`} onSubmit={(event) => { void submitMemory(event); }}>
        <section className="memory-editor-photo-column" aria-label="记忆照片">
          <div className="memory-editor-photo-frame">
            {imageUrl ? (
            <img src={imageUrl} alt="新记忆照片预览" referrerPolicy="no-referrer" className="memory-editor-photo-image" />
            ) : (
              <button type="button" className="memory-editor-photo-empty" onClick={() => coverInputRef.current?.click()}>
                <ImagePlus size={32} aria-hidden="true" />
                <span>添加照片</span>
                <small>也可以保存一段没有照片的记忆</small>
              </button>
            )}
            {imageUrl && (
              <button type="button" className="memory-editor-change-photo" onClick={() => coverInputRef.current?.click()}>
                <ImagePlus size={15} aria-hidden="true" />
                更换照片
              </button>
            )}
          </div>

          <div className="memory-editor-gallery" aria-label="随附照片">
            <span>{imageUrl ? `${galleryImages.length + 1} 张照片` : `${galleryImages.length} 张照片`}</span>
            {galleryImages.map((image, index) => (
              <span key={image} className="memory-editor-gallery-thumb">
                <img src={image} alt={`随附照片 ${index + 1}`} referrerPolicy="no-referrer" />
                <button
                  type="button"
                  onClick={() => setGalleryImages((images) => images.filter((item) => item !== image))}
                  aria-label={`移除随附照片 ${index + 1}`}
                >
                  <X size={13} aria-hidden="true" />
                </button>
              </span>
            ))}
            <button
              type="button"
              className="memory-editor-add-gallery"
              onClick={() => galleryInputRef.current?.click()}
              disabled={isGalleryUploading}
              aria-label="添加随附照片"
            >
              {isGalleryUploading ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={17} aria-hidden="true" />}
            </button>
          </div>
        </section>

        <article className="memory-editor-copy-column">
          <label className="memory-editor-title-label" htmlFor="new-memory-title">{isFirstMemory ? '给这段记忆起个名字（可选）' : '记忆标题'}</label>
          <input
            id="new-memory-title"
            className="memory-editor-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="给这段记忆起个名字"
            autoFocus
          />

          <div className="memory-editor-metadata">
            <input
              type="date"
              value={date}
              onChange={(event) => {
                dateAutoRef.current = false;
                dateValueRef.current = event.target.value;
                setDate(event.target.value);
              }}
              aria-label="日期"
              required
            />
            <LocationPicker
              selectedLabel={selectedLocation?.name ?? ''}
              query={locationQuery}
              onQueryChange={(value) => {
                locationAutoRef.current = false;
                locationValueRef.current = value;
                setLocationQuery(value);
                setSelectedLocation(null);
              }}
              onSelect={(candidate) => {
                locationAutoRef.current = false;
                confirmLocation({
                  name: candidate.shortName,
                  lat: candidate.lat,
                  lng: candidate.lng,
                  country: candidate.country,
                  city: candidate.city,
                  district: candidate.district,
                });
                if (candidate.district) setDetailLocation(candidate.district);
                // 输入提示的候选坐标不可被反查覆盖；反查只补齐城市、区县等展示层级。
                void reverseGeocodeCoordinates(candidate.lat, candidate.lng).then((reverse) => {
                  if (!reverse) return;
                  setSelectedLocation((current) => (
                    current?.lat === candidate.lat && current.lng === candidate.lng
                      ? {
                        ...current,
                        country: reverse.country ?? current.country,
                        city: reverse.city ?? current.city,
                        district: reverse.district ?? current.district,
                      }
                      : current
                  ));
                  if (reverse.district) setDetailLocation((current) => current || reverse.district || '');
                });
              }}
              placeholder="地点"
              inputClassName="memory-editor-location-input"
              onPickOnMap={() => setShowLocationMap(true)}
            />
          </div>
          {locationName.trim() && !isLocationConfirmed && <p className="memory-editor-location-status">尚未定位到地图</p>}

          {isFirstMemory && <p className="memory-editor-first-memory-note">先确认照片、时间和地点；其余内容都可以以后再写。</p>}

          {!isFirstMemory && <div className="memory-editor-themes" aria-label="主题">
              {CATEGORY_OPTIONS.map((option) => (
                <button key={option.value} type="button" className={category === option.value ? 'is-selected' : ''} onClick={() => setCategory(option.value)} aria-pressed={category === option.value}>
                  {option.label}
                </button>
              ))}
            </div>}

          <div className="memory-editor-divider" />

          <label className="memory-editor-reflection-label" htmlFor="new-memory-past">{isFirstMemory ? '写下你还记得的事（可选）' : '昔 当时的我'}</label>
          <textarea id="new-memory-past" className="memory-editor-reflection is-primary" value={pastSelf} onChange={(event) => setPastSelf(event.target.value)} placeholder="记下当时发生的事、心情和你看见的风景。" />

          {!isFirstMemory && <>
            <label className="memory-editor-reflection-label" htmlFor="new-memory-present">今 现在的我</label>
            <textarea id="new-memory-present" className="memory-editor-reflection" value={presentSelf} onChange={(event) => setPresentSelf(event.target.value)} placeholder="此刻回望，这段经历留下了什么？" />

            <details className="memory-editor-details">
              <summary>补充地点与标签</summary>
              <div className="memory-editor-detail-fields">
                <input value={tag} onChange={(event) => setTag(event.target.value)} placeholder="标签（可选）" aria-label="标签" />
                <input value={detailLocation} onChange={(event) => setDetailLocation(event.target.value)} placeholder="地点备注（可选）" aria-label="地点备注" />
              </div>
            </details>
          </>}

          <p className={`memory-editor-save-note ${saveState === 'error' ? 'is-error' : ''}`}>
            {saveState === 'saving' ? '正在加密并保存…' : saveState === 'error' ? validationMessage : '草稿仅保留在当前设备 · Ctrl + Enter 完成'}
          </p>
        </article>

        <input ref={coverInputRef} type="file" accept="image/*" className="memory-create-file-input" onChange={(event) => { void selectCover(event.target.files?.[0], 'editor'); event.target.value = ''; }} />
        <input ref={galleryInputRef} type="file" accept="image/*" className="memory-create-file-input" onChange={(event) => { void selectGalleryPhoto(event.target.files?.[0]); event.target.value = ''; }} />
      </form>
    </section>
  );
}
