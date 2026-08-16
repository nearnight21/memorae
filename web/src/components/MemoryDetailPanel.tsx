import React, { useState } from "react";
import { motion } from "motion/react";
import { X, Calendar, MapPin, Edit3, Check, Plus, Image as ImageIcon, Upload } from "lucide-react";
import { Memory } from "../types";
import { selectLocalPhoto } from '../product/selectPhoto';
import LocationPicker from "./LocationPicker";

interface MemoryDetailPanelProps {
  memory: Memory;
  onClose: () => void;
  onUpdateMemory: (updatedMemory: Memory) => void;
  onSaveMemory: (updatedMemory: Memory) => Promise<void>;
}

export default function MemoryDetailPanel({
  memory,
  onClose,
  onUpdateMemory,
  onSaveMemory,
}: MemoryDetailPanelProps) {
  const [isEditingPresent, setIsEditingPresent] = useState(false);
  const [presentText, setPresentText] = useState(memory.presentSelf);
  const [showAddImage, setShowAddImage] = useState(false);
  // 新增记忆的首图是封面；默认先展示封面，再由用户选择随附照片。
  const [photoIdx, setPhotoIdx] = useState(0);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [locName, setLocName] = useState<string>(memory.location?.name ?? "");
  const [locMx, setLocMx] = useState<number | "">(memory.location?.mx ?? "");
  const [locMy, setLocMy] = useState<number | "">(memory.location?.my ?? "");
  const [locGeo, setLocGeo] = useState<{
    country?: string;
    city?: string;
    lat: number;
    lng: number;
  } | null>(null);
  const [detailLoc, setDetailLoc] = useState<string>(memory.detailLocation ?? "");


  const handleSavePresentText = () => {
    onUpdateMemory({ ...memory, presentSelf: presentText });
    setIsEditingPresent(false);
  };

  const handleR2Upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await selectLocalPhoto(file);
      onUpdateMemory({ ...memory, gallery: [...memory.gallery, url] });
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const openLocationEditor = () => {
    setLocName(memory.location?.name ?? "");
    setLocMx(memory.location?.mx ?? 50);
    setLocMy(memory.location?.my ?? 50);
    setLocGeo(null);
    setDetailLoc(memory.detailLocation ?? "");
    setIsEditingLocation(true);
  };

  const handleSaveLocation = () => {
    const trimmed = locName.trim();
    if (!trimmed) {
      onUpdateMemory({ ...memory, location: undefined });
      setIsEditingLocation(false);
      return;
    }
    const mx = typeof locMx === "number" ? Math.max(0, Math.min(100, locMx)) : 50;
    const my = typeof locMy === "number" ? Math.max(0, Math.min(100, locMy)) : 50;
    onUpdateMemory({
      ...memory,
      location: { name: trimmed, mx, my },
      detailLocation: detailLoc.trim() || undefined,
      // 通过搜索选定后写入精确坐标与国家/城市，地图直接采用不再猜测
      ...(locGeo
        ? {
            country: locGeo.country ?? memory.country,
            city: locGeo.city ?? memory.city,
            lat: locGeo.lat,
            lng: locGeo.lng,
          }
        : {}),
    });
    setIsEditingLocation(false);
  };

  const currentImage =
    photoIdx === 0 ? memory.image : memory.gallery[photoIdx - 1];

  const handleSaveToDb = async () => {
    setSaveStatus("saving");
    try {
      await onSaveMemory(memory);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      console.error(err);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      {/* Backdrop click to close */}
      <div className="absolute inset-0" onClick={onClose} />

      <motion.div
        initial={{ scale: 0.95, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 20, opacity: 0 }}
        className="w-full max-w-4xl bg-[#faf6ed] rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col md:flex-row h-[580px] z-10 border border-amber-950/25 relative paper-grain"
      >
        {/* Spine decoration */}
        <div className="hidden md:block w-7 bg-linear-to-r from-amber-950 via-stone-900 to-amber-950/80 border-r border-[#eddcb5] h-full flex flex-col items-center justify-center relative">
          <div className="w-[1px] bg-amber-500/10 h-full" />
          <div className="absolute top-8 w-2 h-2 rounded-full bg-yellow-600/80 border border-yellow-700/50 shadow-inner" />
          <div className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-yellow-600/80 border border-yellow-700/50 shadow-inner" />
          <div className="absolute bottom-8 w-2 h-2 rounded-full bg-yellow-600/80 border border-yellow-700/50 shadow-inner" />
        </div>

        {/* Left Page: Photo and Gallery */}
        <div className="flex-1 p-6 flex flex-col justify-between border-b md:border-b-0 md:border-r border-amber-900/10 bg-white/20">
          <div>
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex flex-col items-start gap-1.5 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold text-stone-100 bg-amber-900/85 uppercase tracking-wide">
                  {memory.tag}
                </span>
                {!isEditingLocation && memory.location && (
                  <span className="group/loc text-[10px] text-stone-500 font-mono flex items-center gap-1 max-w-[240px]">
                    <MapPin className="h-3.5 w-3.5 text-red-500 shrink-0" />
                    <span className="truncate">
                      {memory.location.name}
                      {memory.detailLocation ? `（${memory.detailLocation}）` : ''}
                    </span>
                    <button
                      onClick={openLocationEditor}
                      className="opacity-0 group-hover/loc:opacity-100 text-amber-700 hover:text-amber-900 transition-opacity shrink-0"
                      title="编辑地点"
                    >
                      <Edit3 className="h-3 w-3" />
                    </button>
                  </span>
                )}
                {!isEditingLocation && !memory.location && (
                  <button
                    onClick={openLocationEditor}
                    className="text-[10px] text-stone-400 hover:text-amber-700 font-mono inline-flex items-center gap-1 transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    <span>添加地点</span>
                  </button>
                )}
                </div>
                {isEditingLocation && (
                  <div className="mt-2 w-full flex flex-col gap-1.5 bg-amber-50/40 p-2.5 rounded-lg border border-amber-200/60 max-w-[320px]">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-red-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <LocationPicker
                          selectedLabel={locGeo ? locName : ''}
                          query={locGeo ? '' : locName}
                          onQueryChange={(value) => {
                            setLocName(value);
                            setLocGeo(null);
                          }}
                          onSelect={(c) => {
                            setLocName(c.shortName);
                            setLocGeo({ country: c.country, city: c.city, lat: c.lat, lng: c.lng });
                          }}
                          placeholder="搜索并选择地点（如：大理古城）"
                          inputClassName="w-full text-xs bg-white/70 border border-amber-200/60 rounded px-2 py-1 font-mono focus:outline-none focus:border-amber-400"
                        />
                      </div>
                    </div>
                    <input
                      id="edit-location-detail"
                      type="text"
                      value={detailLoc}
                      onChange={(e) => setDetailLoc(e.target.value)}
                      placeholder="详细位置（可选，不影响地图）：如 外公外婆家"
                      className="w-full text-[10px] bg-white/70 border border-amber-200/60 rounded px-2 py-1 font-mono focus:outline-none focus:border-amber-400"
                    />
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-stone-500">
                      <span className="w-7 shrink-0">mx</span>
                      <input
                        id="edit-location-mx"
                        type="number"
                        min={0}
                        max={100}
                        value={locMx}
                        onChange={(e) => setLocMx(e.target.value === "" ? "" : Number(e.target.value))}
                        className="w-16 bg-white/70 border border-amber-200/60 rounded px-1.5 py-0.5 focus:outline-none focus:border-amber-400"
                      />
                      <span className="w-7 shrink-0">my</span>
                      <input
                        id="edit-location-my"
                        type="number"
                        min={0}
                        max={100}
                        value={locMy}
                        onChange={(e) => setLocMy(e.target.value === "" ? "" : Number(e.target.value))}
                        className="w-16 bg-white/70 border border-amber-200/60 rounded px-1.5 py-0.5 focus:outline-none focus:border-amber-400"
                      />
                      <span className="text-stone-400 text-[9px] ml-1">0-100</span>
                    </div>
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => setIsEditingLocation(false)}
                        className="text-[10px] px-2 py-0.5 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded font-semibold"
                      >
                        取消
                      </button>
                      <button
                        id="btn-save-location"
                        onClick={handleSaveLocation}
                        className="text-[10px] px-2 py-0.5 bg-amber-900 hover:bg-amber-950 text-stone-100 rounded font-semibold inline-flex items-center gap-1"
                      >
                        <Check className="h-3 w-3" />
                        <span>{locName.trim() ? "更新地点" : "清除地点"}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={onClose}
                className="md:hidden p-1 bg-stone-200/60 rounded-full text-stone-500 hover:text-stone-800"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            {/* Main Photo */}
            <div className="bg-[#fcfaf2] p-4 pb-6 border border-stone-200 rounded-sm shadow-lg max-w-[340px] mx-auto transform rotate-[1deg] overflow-hidden group">
              <div
                onClick={() =>
                  setLightboxImg(
                    photoIdx === 0
                      ? memory.image
                      : memory.gallery[photoIdx - 1]
                  )
                }
                className="aspect-4/3 relative bg-stone-950 overflow-hidden leading-none rounded-xs border border-stone-200/40 cursor-pointer transition-all duration-300 hover:scale-[1.02]"
              >
                <img
                  src={currentImage}
                  alt={memory.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover grayscale-[5%] group-hover:grayscale-0 transition-all duration-300 pointer-events-none"
                />
              </div>
              <h3 className="text-center font-hand font-bold text-xl text-stone-800 mt-4 leading-none">
                {memory.title}
              </h3>
              <p className="text-center font-mono text-[9px] text-stone-400 mt-1 leading-none">
                {memory.date}
              </p>
            </div>
          </div>

          {/* Gallery Strip */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[10px] font-bold font-mono tracking-widest text-[#5c3e21]/70 uppercase">
                随附底片墙 ({memory.gallery.length} PHOTOS)
              </h4>
              <button
                id="btn-trigger-add-gallery"
                onClick={() => setShowAddImage(!showAddImage)}
                className="text-[10px] font-semibold font-display text-amber-700 hover:text-amber-800 inline-flex items-center gap-1"
              >
                <Plus className="h-3 w-3" />
                <span>追加写实照</span>
              </button>
            </div>

            {showAddImage && (
              <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-amber-200/30 bg-[#fcf9f2] px-3 py-2 shadow-sm">
                <span className="text-[10px] text-stone-500">选择后先在本机预览，点击底部“保存”时加密。</span>
                <label
                  className={
                    "flex items-center justify-center w-8 h-8 rounded-lg bg-amber-800 hover:bg-amber-700 text-[#fcf9f2] cursor-pointer transition-all hover:scale-105 active:scale-95 shrink-0" +
                    (uploading ? " pointer-events-none opacity-60" : "")
                  }
                >
                  <Upload className="h-4 w-4" />
                  <span className="text-[10px]">选择照片</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploading}
                    onChange={handleR2Upload}
                  />
                </label>
              </div>
            )}

            {/* Filmstrip */}
            <div className="flex gap-2 overflow-x-auto py-2 px-0.5 scroll-smooth snap-x snap-mandatory" style={{ scrollbarWidth: "thin", scrollbarColor: "#a88a6d transparent" }}>
              {memory.gallery.map((imgUrl, i) => (
                <div
                  key={i}
                  onClick={() => setPhotoIdx(i + 1)}
                  className="h-18 bg-stone-800 border border-stone-200/60 rounded shrink-0 overflow-hidden shadow-md transform hover:scale-105 active:scale-95 transition-all relative group cursor-pointer snap-start" style={{ flex: "0 0 calc(25% - 6px)" }}
                >
                  {/* SHOT overlay with delete button */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[8px] text-white font-mono uppercase">
                    SHOT #{i + 1}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateMemory({
                          ...memory,
                          gallery: memory.gallery.filter(
                            (_x, idx) => idx !== i
                          ),
                        });
                      }}
                      className="text-white/60 hover:text-white text-[10px] leading-none cursor-pointer ml-2 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                  <img
                    src={imgUrl}
                    alt={`Detail ${i}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Page: Diaries */}
        <div className="flex-1 p-6 flex flex-col justify-between relative bg-[#fcf9f2]">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 hidden md:block p-1 bg-stone-200/60 rounded-full text-stone-500 hover:text-stone-800"
          >
            <X className="h-4.5 w-4.5" />
          </button>

          <div className="flex flex-col gap-6 mt-4 md:mt-0">
            {/* Past Self */}
            <div className="flex gap-3 bg-amber-50/30 p-4 rounded-xl border border-amber-900/10 shadow-sm">
              <div className="flex flex-col items-center">
                <div className="w-6 h-6 rounded-full bg-amber-200/60 flex items-center justify-center text-amber-800 text-[10px] font-bold">
                  昔
                </div>
                <div className="w-px grow bg-amber-300/40 mt-0.5" />
              </div>
              <div>
                <h4 className="text-[11px] font-bold text-stone-600 font-display">
                  当时的我：
                </h4>
                <p className="text-stone-700 font-hand text-lg font-medium leading-relaxed">
                  {memory.pastSelf}
                </p>
              </div>
            </div>

            {/* Present Self */}
            <div className="flex gap-3 bg-amber-50/30 p-4 rounded-xl border border-amber-900/10 shadow-sm relative group">
              <div className="flex flex-col items-center">
                <div className="w-6 h-6 rounded-full bg-amber-200/60 flex items-center justify-center text-amber-800 text-[10px] font-bold">
                  今
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-[11px] font-bold text-stone-600 font-display">
                    现在的我：
                  </h4>
                  {!isEditingPresent && (
                    <button
                      onClick={() => setIsEditingPresent(true)}
                      className="opacity-0 group-hover:opacity-100 text-amber-700 hover:text-amber-900 text-[10px] font-semibold font-display inline-flex items-center gap-1 transition-opacity cursor-pointer"
                    >
                      <Edit3 className="h-3 w-3" />
                      <span>重新撰写</span>
                    </button>
                  )}
                </div>
                {isEditingPresent ? (
                  <div className="space-y-2">
                    <textarea
                      value={presentText}
                      onChange={(e) => setPresentText(e.target.value)}
                      className="w-full bg-white/60 border border-amber-200 rounded-lg p-2 text-sm font-hand text-stone-700 resize-none h-24 focus:outline-none focus:border-amber-400"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setIsEditingPresent(false)}
                        className="px-3 py-1 bg-stone-200 hover:bg-stone-300 text-stone-700 text-[10px] font-semibold rounded"
                      >
                        取消
                      </button>
                      <button
                        onClick={handleSavePresentText}
                        className="px-3 py-1 bg-amber-900 hover:bg-amber-950 text-stone-100 text-[10px] font-semibold rounded inline-flex items-center gap-1"
                      >
                        <Check className="h-3 w-3" />
                        <span>更新留墨</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-stone-700 font-hand text-lg font-medium leading-relaxed">
                    {memory.presentSelf}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-stone-200 bg-[#fdfdfc] p-2 rounded -mx-2 -mb-2 mt-4 text-[10px] text-stone-400 font-mono flex items-center justify-between">
            <span>旅行笔记页 · camp memories ledger</span>
            <span>纸张：淡黄草纸纹理</span>
            <button
              onClick={handleSaveToDb}
              disabled={saveStatus === "saving"}
              className="text-stone-500 hover:text-amber-700 no-underline hover:underline cursor-pointer font-mono disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saveStatus === "idle" && "保存"}
              {saveStatus === "saving" && "保存中..."}
              {saveStatus === "saved" && "✓ 已保存"}
              {saveStatus === "error" && "✗ 失败"}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Lightbox */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightboxImg(null)}
        >
          <button
            onClick={() => setLightboxImg(null)}
            className="absolute top-4 right-4 text-white/60 hover:text-white text-2xl z-10"
          >
            ✕
          </button>
          <img
            src={lightboxImg}
            alt={memory.title}
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
