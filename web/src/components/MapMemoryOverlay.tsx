import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bookmark, Check, ChevronLeft, ChevronRight, Cloud, Edit3, X } from 'lucide-react';
import { Memory } from '../types';
import { memoryToDb, supabase } from '../supabase';

interface ScreenPoint {
  x: number;
  y: number;
}

interface MapMemoryOverlayProps {
  memory: Memory;
  anchor: ScreenPoint | null;
  viewport: { width: number; height: number };
  onClose: () => void;
  onUpdateMemory: (memory: Memory) => void;
}

export default function MapMemoryOverlay({
  memory,
  anchor,
  viewport,
  onClose,
  onUpdateMemory,
}: MapMemoryOverlayProps) {
  const photos = useMemo(
    () => Array.from(new Set([memory.image, ...memory.gallery].filter(Boolean))),
    [memory.image, memory.gallery]
  );
  const [photoIdx, setPhotoIdx] = useState(0);
  const [failedPhotos, setFailedPhotos] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [presentDraft, setPresentDraft] = useState(memory.presentSelf);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    setPhotoIdx(0);
    setFailedPhotos([]);
    setIsEditing(false);
    setPresentDraft(memory.presentSelf);
    setSaveStatus('idle');
  }, [memory.id, memory.presentSelf]);

  const availablePhotos = photos.filter((photo) => !failedPhotos.includes(photo));
  const currentPhoto = availablePhotos[photoIdx] || availablePhotos[0] || '';
  const locationParts = [memory.country, memory.city, memory.location?.name]
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

  const commitText = () => {
    onUpdateMemory({ ...memory, presentSelf: presentDraft });
    setIsEditing(false);
    setSaveStatus('idle');
  };

  const saveMemory = async () => {
    const updated = { ...memory, presentSelf: presentDraft };
    onUpdateMemory(updated);
    setSaveStatus('saving');
    try {
      const { error } = await supabase.from('memories').update(memoryToDb(updated)).eq('id', memory.id);
      if (error) throw error;
      setSaveStatus('saved');
      window.setTimeout(() => setSaveStatus('idle'), 2400);
    } catch (error) {
      console.error(error);
      setSaveStatus('error');
    }
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
            stroke="#9F7D3B"
            strokeWidth="1.4"
            strokeDasharray="3 7"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.78 }}
            transition={{ duration: 0.65, delay: 0.16, ease: 'easeOut' }}
          />
          <circle cx={anchor.x} cy={anchor.y} r="4" fill="#A58443" stroke="#FAF7EF" strokeWidth="2" />
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

        {availablePhotos.length > 1 && (
          <div className="pointer-events-auto absolute bottom-[7%] left-1/2 z-20 flex -translate-x-1/2 items-center gap-5 text-[#F8F3E8]">
            <button
              type="button"
              onClick={() => goPhoto(-1)}
              aria-label="上一张照片"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/60 bg-[#3D3932]/28 backdrop-blur-sm transition-colors hover:bg-[#3D3932]/48 cursor-pointer"
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
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/60 bg-[#3D3932]/28 backdrop-blur-sm transition-colors hover:bg-[#3D3932]/48 cursor-pointer"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}
      </motion.div>

      <motion.article
        className="map-memory-copy-feather pointer-events-auto absolute right-[2.5%] top-[15%] z-20 max-h-[72%] w-[43%] overflow-y-auto px-[5%] py-10 text-[#302E29] sm:right-[3.5%] sm:w-[40%]"
        initial={{ opacity: 0, x: 28 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ duration: 0.38, delay: 0.14 }}
      >
        <div className="mb-7">
          {memory.tag && (
            <span className="inline-flex rounded-full border border-[#A88646]/55 px-3 py-1 text-[10px] tracking-[0.12em] text-[#8F6F34]">
              {memory.tag}
            </span>
          )}
          {locationText && <p className="mt-3 text-[11px] tracking-[0.08em] text-[#686257]">{locationText}</p>}
          <p className="mt-2 font-mono text-[10px] text-[#6F695E]">{memory.date}</p>
        </div>

        <h2 className="font-editorial-serif text-[32px] leading-tight tracking-[0.08em] sm:text-[42px]">
          {memory.title}
        </h2>

        <div className="mt-7 border-l border-[#A88646]/70 pl-7">
          <section className="relative pb-7">
            <span className="font-editorial-serif absolute -left-[43px] top-0 flex h-8 w-8 items-center justify-center rounded-full border border-[#A88646]/60 bg-[#F7F2E7]/72 text-sm text-[#8F6F34]">
              昔
            </span>
            <h3 className="font-editorial-serif text-[16px] tracking-[0.12em] text-[#8F6F34]">当时的我</h3>
            <p className="mt-3 whitespace-pre-wrap text-[13px] leading-7 text-[#46423B]">{memory.pastSelf}</p>
          </section>

          <section className="relative">
            <span className="font-editorial-serif absolute -left-[43px] top-0 flex h-8 w-8 items-center justify-center rounded-full border border-[#A88646]/60 bg-[#F7F2E7]/72 text-sm text-[#8F6F34]">
              今
            </span>
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-editorial-serif text-[16px] tracking-[0.12em] text-[#8F6F34]">现在的我</h3>
              <button
                type="button"
                onClick={isEditing ? commitText : () => setIsEditing(true)}
                className="flex items-center gap-1.5 text-[10px] text-[#9A7738] transition-colors hover:text-[#6F5227] cursor-pointer"
              >
                {isEditing ? <Check className="h-3.5 w-3.5" /> : <Edit3 className="h-3.5 w-3.5" />}
                {isEditing ? '完成' : '编辑'}
              </button>
            </div>
            {isEditing ? (
              <textarea
                value={presentDraft}
                onChange={(event) => setPresentDraft(event.target.value)}
                className="mt-3 min-h-32 w-full resize-y border-0 border-b border-[#A88646]/45 bg-white/22 px-0 py-2 text-[13px] leading-7 text-[#3F3B35] outline-none"
                aria-label="编辑现在的我"
              />
            ) : (
              <p className="mt-3 whitespace-pre-wrap text-[13px] leading-7 text-[#46423B]">{presentDraft}</p>
            )}
          </section>
        </div>

        <div className="mt-8 flex items-center gap-3 text-[11px]">
          <button
            type="button"
            onClick={saveMemory}
            disabled={saveStatus === 'saving'}
            className="flex items-center gap-2 text-[#8D6D32] transition-colors hover:text-[#634A24] disabled:opacity-50 cursor-pointer"
          >
            <Bookmark className="h-4.5 w-4.5" strokeWidth={1.5} />
            {saveStatus === 'saving' ? '保存中…' : '保存记忆'}
          </button>
          <span className="text-[#9A9387]">|</span>
          <span className={`flex items-center gap-1.5 ${saveStatus === 'error' ? 'text-red-700' : 'text-[#647A52]'}`}>
            <Cloud className="h-4 w-4" strokeWidth={1.5} />
            {saveStatus === 'error' ? '同步失败' : saveStatus === 'saved' ? '已同步' : '等待保存'}
          </span>
        </div>
      </motion.article>

      <button
        id="btn-close-map-memory"
        type="button"
        onClick={onClose}
        aria-label="收起记忆"
        className="pointer-events-auto absolute right-5 top-6 z-30 flex h-10 items-center gap-2 rounded-full border border-[#AFA99B]/65 bg-[#FAF7EF]/90 px-3.5 text-[11px] text-[#403D37] shadow-[0_6px_18px_rgba(52,48,41,0.13)] backdrop-blur-md transition-colors hover:bg-white cursor-pointer"
      >
        <X className="h-4.5 w-4.5" strokeWidth={1.5} />
        收起记忆
      </button>
    </motion.div>
  );
}
