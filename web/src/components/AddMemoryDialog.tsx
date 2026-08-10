import React, { useState } from 'react';
import { X, Plus, Image as ImageIcon, Sparkles, Check, Upload, Loader2, Images, MapPin } from 'lucide-react';
import { uploadImage } from '../supabase';
import { Memory, CategoryType, PinnedBy } from '../types';
import { geocodeAddress } from '../lib/geo';
import LocationPicker from './LocationPicker';
import LocationMapPicker from './LocationMapPicker';

interface AddMemoryDialogProps {
  onClose: () => void;
  onAddMemory: (newMemory: Omit<Memory, 'id' | 'px' | 'py' | 'rotation'>) => void;
}

export default function AddMemoryDialog({
  onClose,
  onAddMemory,
}: AddMemoryDialogProps) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [category, setCategory] = useState<CategoryType>('travel');
  const [tag, setTag] = useState('');
  const [pastSelf, setPastSelf] = useState('');
  const [presentSelf, setPresentSelf] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [galleryInput, setGalleryInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isGalleryUploading, setIsGalleryUploading] = useState(false);
  const [pinnedBy, setPinnedBy] = useState<PinnedBy>('pin');
  const [locationName, setLocationName] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [detailLocation, setDetailLocation] = useState('');
  const [isResolvingLocation, setIsResolvingLocation] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Pre-configured elegant themed Unsplash stock pools
  const categoryImagePresets: Record<CategoryType, string[]> = {
    travel: [
      'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1527631746610-bca00a040d60?auto=format&fit=crop&w=600&q=80',
    ],
    growth: [
      'https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?auto=format&fit=crop&w=600&q=80',
    ],
    motorcycle: [
      'https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80',
    ],
    photography: [
      'https://images.unsplash.com/photo-1495707902641-75cac588d2e9?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&w=600&q=80',
      'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=600&q=80',
    ],
  };

  const autofillPresetImage = () => {
    const list = categoryImagePresets[category];
    const item = list[Math.floor(Math.random() * list.length)];
    setImageUrl(item);
  };

  const handleLocalUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsUploading(true);
      try {
        const url = await uploadImage(file, 'camp_');
        setImageUrl(url);
      } catch (err: any) {
        console.error('Upload failed:', err);
        alert('Image upload failed: ' + (err.message || 'Unknown error'));
      } finally {
        setIsUploading(false);
      }
    }
  };

  const addGalleryImage = (url: string) => {
    const normalizedUrl = url.trim();
    if (!normalizedUrl) return;
    setGalleryImages((images) =>
      images.includes(normalizedUrl) ? images : [...images, normalizedUrl]
    );
    setGalleryInput('');
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsGalleryUploading(true);
    try {
      addGalleryImage(await uploadImage(file, 'gallery_'));
    } catch (err: any) {
      console.error('Gallery upload failed:', err);
      alert('随附照片上传失败：' + (err.message || '未知错误'));
    } finally {
      setIsGalleryUploading(false);
      e.target.value = '';
    }
  };

  const applyLocationCoordinates = (result: {
    country?: string;
    city?: string;
    lat: number;
    lng: number;
  }) => {
    setCountry(result.country ?? '');
    setCity(result.city ?? '');
    setLat(result.lat);
    setLng(result.lng);
  };

  const handleResolveLocation = async () => {
    const query = locationName.trim();
    if (!query) return;

    setIsResolvingLocation(true);
    try {
      const result = await geocodeAddress(query);
      if (!result) {
        alert('暂时无法定位这个地点，请从下拉候选中选择，或稍后重试。');
        return;
      }
      applyLocationCoordinates(result);
    } finally {
      setIsResolvingLocation(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !date || !pastSelf || !presentSelf) return;

    // Use current customized or fall back to preset
    const activeImage = imageUrl.trim() || categoryImagePresets[category][0];

    // Auto-extract year from date string (e.g., "2025-04-12" or "2025.04.12")
    let parsedYear = 2025;
    if (date) {
      const parts = date.split(/[-.]/);
      if (parts.length > 0) {
        const y = parseInt(parts[0], 10);
        if (!isNaN(y) && y > 1900 && y < 2100) {
          parsedYear = y;
        }
      }
    }

    onAddMemory({
      title,
      date: date.includes('-') ? date.replace(/-/g, '.') : date,
      year: parsedYear,
      category,
      tag: tag.trim() || (category === 'travel' ? '足迹' : category === 'growth' ? '成长' : category === 'motorcycle' ? '日常' : '瞬间'),
      image: activeImage,
      gallery: galleryImages.filter((url) => url && url !== activeImage),
      pastSelf,
      presentSelf,
      pinnedBy,
      location: locationName.trim() ? { name: locationName.trim(), mx: 0, my: 0 } : undefined,
      country: country.trim() || undefined,
      city: city.trim() || undefined,
      lat: lat ?? undefined,
      lng: lng ?? undefined,
      detailLocation: detailLocation.trim() || undefined,
    });

    setIsSuccess(true);
    setTimeout(() => {
      setIsSuccess(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      {/* Clicking outside stops dialog */}
      <div className="absolute inset-0" onClick={onClose}></div>

      <div className="bg-[#faf6ed] shadow-[0_24px_50px_rgba(0,0,0,0.5)] border border-amber-900/40 w-full max-w-xl rounded-2xl overflow-hidden text-stone-800 flex flex-col p-6 relative paper-grain z-10 max-h-[92vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-stone-405 hover:text-stone-700 bg-stone-200/50 hover:bg-stone-200 rounded-full transition-all"
        >
          <X className="h-4.5 w-4.5" />
        </button>

        {/* Title */}
        <div className="border-b border-stone-250 pb-3.5 mb-4">
          <h3 className="text-lg font-bold font-display text-amber-950 uppercase flex items-center gap-2">
            <Plus className="h-4.5 w-4.5 text-amber-700" />
            <span>钉入一张新记忆的照片</span>
          </h3>
          <p className="text-[10px] text-stone-400 font-mono mt-0.5 uppercase">PIN A NEW MEMOIR CARD ON THE CORKBOARD</p>
        </div>

        {isSuccess ? (
          <div className="flex-1 py-12 flex flex-col items-center justify-center gap-3 text-center">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center shadow-md">
              <Check className="h-6 w-6" />
            </div>
            <div>
              <h5 className="font-bold text-center text-sm font-display text-emerald-800">记忆已牢固钉入！</h5>
              <p className="text-xs text-stone-500 font-sans mt-1">
                Polaroid 照片卡将会出现在旅行木板的分类区域中...
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Row 1: Title & Tag */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold font-mono tracking-wider text-stone-500 uppercase">
                  记忆标题 *
                </label>
                <input
                  id="add-input-title"
                  type="text"
                  required
                  placeholder="例如：京都竹林寻幽"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="bg-[#fdfcf7] border border-amber-900/25 rounded px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-hidden font-display"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold font-mono tracking-wider text-stone-500 uppercase">
                  类别角标 (可选标签)
                </label>
                <input
                  id="add-input-tag"
                  type="text"
                  placeholder="例如：独自出发 / 热烈"
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  className="bg-[#fdfcf7] border border-amber-900/25 rounded px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-hidden"
                />
              </div>
            </div>

            {/* Row 2: Date & Category */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold font-mono tracking-wider text-stone-500 uppercase">
                  记忆具体日期 *
                </label>
                <input
                  id="add-input-date"
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  onClick={(e) => {
                    try {
                      (e.target as HTMLInputElement).showPicker();
                    } catch (err) {}
                  }}
                  className="bg-[#fdfcf7] border border-amber-900/25 rounded px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none font-mono cursor-pointer w-full text-stone-700 hover:border-amber-600/55 transition-colors"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold font-mono tracking-wider text-stone-500 uppercase">
                  白板分类区域
                </label>
                <select
                  id="add-select-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as CategoryType)}
                  className="bg-[#fdfcf7] border border-amber-900/25 rounded px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-amber-500 outline-none cursor-pointer text-stone-700"
                >
                  <option value="travel">左上：旅途足迹 (Travel & Journeys)</option>
                  <option value="growth">右上：自我成长 (Inner Growth)</option>
                  <option value="motorcycle">左下：日常烟火 (Daily Joys & Life)</option>
                  <option value="photography">右下：美好瞬间 (Captured Moments)</option>
                </select>
              </div>
            </div>

            {/* 地点定位与地图微调 */}
            <section className="rounded-xl border border-amber-900/20 bg-[#fffdf8]/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <div>
                  <h4 className="text-[11px] font-bold font-display tracking-wide text-amber-950">地点与地图微调</h4>
                  <p className="mt-0.5 text-[9px] font-mono text-stone-400">
                    写下地点后自动获取大致坐标；在地图上点击或拖动图钉即可微调。
                  </p>
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                <div className="min-w-0 flex-1">
                  <LocationPicker
                    value={locationName}
                    onChange={(value) => {
                      setLocationName(value);
                      setCountry('');
                      setCity('');
                      setLat(null);
                      setLng(null);
                    }}
                    onSelect={(candidate) => {
                      setLocationName(candidate.shortName);
                      applyLocationCoordinates(candidate);
                    }}
                    placeholder="写下地点，例如：大理古城"
                    inputClassName="w-full bg-[#fdfcf7] border border-amber-900/25 rounded-lg px-2.5 py-2 text-xs focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-hidden"
                  />
                </div>
                <button
                  id="btn-resolve-location"
                  type="button"
                  onClick={handleResolveLocation}
                  disabled={!locationName.trim() || isResolvingLocation}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-900 px-3 text-[10px] font-semibold text-stone-100 transition-colors hover:bg-stone-900 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isResolvingLocation ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
                  定位
                </button>
              </div>

              {lat !== null && lng !== null ? (
                <div className="mt-3 space-y-2">
                  <LocationMapPicker
                    lat={lat}
                    lng={lng}
                    onChange={(nextLat, nextLng) => {
                      setLat(nextLat);
                      setLng(nextLng);
                    }}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[9px] font-mono text-stone-500">
                    <span>{country || city ? `自动识别：${[country, city].filter(Boolean).join(' · ')}` : '已手动调整地图位置'}</span>
                    <span>{lat.toFixed(5)}, {lng.toFixed(5)}</span>
                  </div>
                </div>
              ) : (
                <div className="mt-3 rounded-lg border border-dashed border-amber-900/20 bg-amber-50/40 px-3 py-2 text-[9px] font-mono text-stone-400">
                  从候选中选择，或点击“定位”后显示可微调地图。
                </div>
              )}

              <div className="mt-3 border-t border-amber-900/10 pt-3">
                <label className="text-[10px] font-bold font-mono tracking-wider text-stone-500 uppercase">
                  地点备注（可选）
                </label>
                <input
                  id="add-input-detail-location"
                  type="text"
                  placeholder="例如：外公外婆家 / 巷口老面馆"
                  value={detailLocation}
                  onChange={(e) => setDetailLocation(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-amber-900/25 bg-[#fdfcf7] px-2.5 py-1.5 text-xs outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                />
              </div>
            </section>

            {/* 图片模块 */}
            <section className="rounded-xl border border-amber-900/20 bg-[#fffdf8]/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-[11px] font-bold font-display tracking-wide text-amber-950 flex items-center gap-1.5">
                    <Images className="h-3.5 w-3.5 text-amber-700" />
                    添加图片
                  </h4>
                  <p className="text-[9px] text-stone-400 font-mono mt-0.5">
                    先选一张封面图，也可以一起添加随附照片
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-mono text-amber-800">
                  {galleryImages.length} 张随附照片
                </span>
              </div>

              <div className="mt-3 grid grid-cols-[104px_minmax(0,1fr)] gap-3">
                <div className="aspect-4/3 overflow-hidden rounded-lg border border-amber-900/20 bg-stone-100 shadow-sm">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt="封面预览"
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="h-full w-full flex flex-col items-center justify-center gap-1 text-stone-400">
                      <ImageIcon className="h-5 w-5" />
                      <span className="text-[9px] font-mono">封面预览</span>
                    </div>
                  )}
                </div>

                <div className="min-w-0 space-y-2">
                  <label
                    className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border border-dashed px-3 text-[10px] font-semibold transition-colors cursor-pointer ${
                      isUploading
                        ? 'border-amber-300 bg-amber-50 text-amber-800 pointer-events-none'
                        : 'border-amber-900/30 bg-[#fdfcf7] text-stone-600 hover:border-amber-600 hover:bg-amber-50/60'
                    }`}
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        正在上传封面图…
                      </>
                    ) : (
                      <>
                        <Upload className="h-3.5 w-3.5 text-amber-700" />
                        点击选择封面图
                      </>
                    )}
                    <input
                      id="add-input-cover-file"
                      type="file"
                      accept="image/*"
                      disabled={isUploading}
                      onChange={handleLocalUpload}
                      className="hidden"
                    />
                  </label>

                  <div className="flex items-center gap-2 rounded-lg border border-amber-900/20 bg-[#fdfcf7] px-2.5 py-1.5">
                    <ImageIcon className="h-3.5 w-3.5 shrink-0 text-stone-400" />
                    <input
                      id="add-input-image"
                      type="url"
                      placeholder="或粘贴封面图片 URL"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      className="min-w-0 flex-1 bg-transparent text-[10px] font-mono text-stone-700 outline-none placeholder:text-stone-400"
                    />
                    {imageUrl ? (
                      <button
                        type="button"
                        onClick={() => setImageUrl('')}
                        className="shrink-0 px-1 text-xs text-stone-400 hover:text-stone-700"
                        title="清除封面图"
                        aria-label="清除封面图"
                      >
                        ✕
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={autofillPresetImage}
                        className="shrink-0 inline-flex items-center gap-1 rounded border border-amber-200/70 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800 hover:bg-amber-100"
                      >
                        <Sparkles className="h-2.5 w-2.5" />
                        自动配图
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-3 border-t border-amber-900/10 pt-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-[10px] font-bold font-mono tracking-wider text-stone-500">随附照片（可选）</span>
                  <label
                    className={`inline-flex items-center gap-1 text-[9px] font-semibold text-amber-800 cursor-pointer ${
                      isGalleryUploading ? 'pointer-events-none opacity-60' : 'hover:text-amber-950'
                    }`}
                  >
                    {isGalleryUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                    {isGalleryUploading ? '上传中…' : '上传本地照片'}
                    <input
                      id="add-input-gallery-file"
                      type="file"
                      accept="image/*"
                      disabled={isGalleryUploading}
                      onChange={handleGalleryUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="flex gap-2">
                  <input
                    id="add-input-gallery-url"
                    type="url"
                    placeholder="粘贴随附照片 URL"
                    value={galleryInput}
                    onChange={(e) => setGalleryInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addGalleryImage(galleryInput);
                      }
                    }}
                    className="min-w-0 flex-1 rounded-lg border border-amber-900/20 bg-[#fdfcf7] px-2.5 py-1.5 text-[10px] font-mono outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => addGalleryImage(galleryInput)}
                    disabled={!galleryInput.trim()}
                    className="rounded-lg bg-amber-900 px-2.5 py-1.5 text-[10px] font-semibold text-stone-100 transition-colors hover:bg-stone-900 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    添加
                  </button>
                </div>

                {galleryImages.length > 0 && (
                  <div className="mt-2 flex gap-2 overflow-x-auto pb-0.5">
                    {galleryImages.map((url, index) => (
                      <div key={url} className="group relative h-14 w-18 shrink-0 overflow-hidden rounded-md border border-amber-900/20 bg-stone-100">
                        <img src={url} alt={`随附照片 ${index + 1}`} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                        <button
                          type="button"
                          onClick={() => setGalleryImages((images) => images.filter((image) => image !== url))}
                          className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/65 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100"
                          title={`移除随附照片 ${index + 1}`}
                          aria-label={`移除随附照片 ${index + 1}`}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* 固定方式 */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold font-mono tracking-wider text-stone-500 uppercase">
                固定方式（选择图钉样式）
              </label>
              <div className="grid grid-cols-4 gap-2 py-1">
                {(['pin', 'magnet', 'clip', 'tape'] as PinnedBy[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setPinnedBy(type)}
                    className={`text-[10px] py-1.5 rounded border capitalize transition-all cursor-pointer ${
                      pinnedBy === type
                        ? 'bg-amber-950 text-stone-100 border-amber-950 shadow-md font-semibold'
                        : 'bg-[#fdfcf7] text-stone-600 border-stone-250 hover:bg-stone-200/40'
                    }`}
                  >
                    {type === 'pin'
                      ? '📌 图钉'
                      : type === 'magnet'
                      ? '🧲 磁铁'
                      : type === 'clip'
                      ? '📎 夹子'
                      : '📜 胶带'}
                  </button>
                ))}
              </div>
            </div>

            {/* Row 4: Diaries side-by-side */}
            <div className="grid grid-cols-1 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold font-mono tracking-wider text-stone-500 uppercase">
                  当时的我 (当时感受与心情记录) *
                </label>
                <textarea
                  id="add-input-past"
                  required
                  rows={2}
                  placeholder="描写你刚站在那一刻时的激动、恐惧、迷路或憧憬..."
                  value={pastSelf}
                  onChange={(e) => setPastSelf(e.target.value)}
                  className="w-full bg-[#fdfcf7] border border-amber-900/25 rounded p-2.5 text-stone-800 font-hand text-lg leading-relaxed focus:ring-1 focus:ring-amber-500 resize-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold font-mono tracking-wider text-stone-500 uppercase">
                  现在的我留书 (沉淀感悟) *
                </label>
                <textarea
                  id="add-input-present"
                  required
                  rows={2}
                  placeholder="多年后再坐回到帐篷中的自己，对这段回忆如何评价？有什么收获与自豪？"
                  value={presentSelf}
                  onChange={(e) => setPresentSelf(e.target.value)}
                  className="w-full bg-[#fdfcf7] border border-[#a18262]/50 rounded p-2.5 text-stone-800 font-hand text-lg leading-relaxed focus:ring-1 focus:ring-amber-500 resize-none"
                />
              </div>
            </div>

            {/* Submit row */}
            <div className="mt-4 pt-3 border-t border-stone-250 flex items-center justify-between">
              <span className="text-[10px] text-stone-500 font-mono">
                * 为必填字段。照片会自动随机分配位置角度
              </span>

              <button
                id="btn-confirm-add-memory"
                type="submit"
                className="bg-amber-950 hover:bg-stone-900 border border-amber-900/20 text-stone-100 font-display text-xs font-semibold px-5 py-2 rounded-lg flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
              >
                <span>将回忆钉到白板</span>
                <span>✦</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
