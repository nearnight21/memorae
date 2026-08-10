import React from 'react';
import { motion } from 'motion/react';
import { Memory, PinnedBy } from '../types';

interface MemoryCardProps {
  key?: React.Key;
  memory: Memory;
  isHovered: boolean;
  onHover: (id: string | null) => void;
  onClick: () => void;
  onDelete: (id: string) => void;
}

export default function MemoryCard({
  memory,
  isHovered,
  onHover,
  onClick,
  onDelete,
}: MemoryCardProps) {

  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [imageLoaded, setImageLoaded] = React.useState(false);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmingDelete) {
      onDelete(memory.id);
    } else {
      setConfirmingDelete(true);
      setTimeout(() => setConfirmingDelete(false), 2600);
    }
  };

  const { title, date, tag, image, pinnedBy, px, py, rotation } = memory;
  const [imgSrc, setImgSrc] = React.useState(image);

  // Render the selected fastening hardware
  const renderFastener = (type: PinnedBy) => {
    switch (type) {
      case 'pin':
        return (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-40">
            {/* Bronze Pushpin Head */}
            <div className="w-3.5 h-3.5 bg-red-650 rounded-full border border-red-700 shadow-[0_2px_4px_rgba(0,0,0,0.5),_inset_0_1px_1px_rgba(255,255,255,0.4)] flex items-center justify-center">
              <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
            </div>
            {/* Pin shaft shadow diagonal */}
            <div className="absolute w-1 h-3.5 bg-black/50 blur-[0.5px] -rotate-45 translate-x-1 translate-y-1 origin-top"></div>
          </div>
        );
      case 'magnet':
        return (
          <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 z-40">
            {/* Round metallic magnet */}
            <div className="w-4 h-4 bg-zinc-400 rounded-full border border-zinc-500 shadow-md flex items-center justify-center">
              <div className="w-2.5 h-2.5 bg-zinc-500 rounded-full border border-stone-600 shadow-inner flex items-center justify-center">
                <div className="w-1 h-1 bg-zinc-300 rounded-full opacity-60"></div>
              </div>
            </div>
          </div>
        );
      case 'clip':
        return (
          <div className="absolute -top-3 left-[28%] z-40 transform rotate-[10deg]">
            {/* Silver paper clip overlapping the photo edge */}
            <div className="w-3.5 h-7 border-2 border-stone-400/95 rounded-full shadow-md flex justify-center bg-stone-300/10 pointer-events-none">
              <div className="w-2 h-4 border-r-2 border-b-2 border-stone-400/90 rounded-b-full mt-2"></div>
            </div>
          </div>
        );
      case 'tape':
      default:
        return (
          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-40 transform -rotate-2 origin-center">
            {/* Texturized translucent masking adhesive tape */}
            <div className="w-12 h-4.5 bg-yellow-100/60 border border-yellow-200/25 shadow-sm rounded-sm backdrop-blur-[0.5px] flex items-center justify-center relative overflow-hidden">
              {/* Torn borders style */}
              <div className="absolute left-0 inset-y-0 w-1.5 bg-stone-800/5 [clip-path:polygon(0_0,100%_20%,0_40%,100%_60%,0_80%,100%_100%)]"></div>
              <div className="absolute right-0 inset-y-0 w-1.5 bg-stone-800/5 [clip-path:polygon(100%_0,0_20%,100%_40%,0_60%,100%_80%,0_100%)]"></div>
              <div className="text-[6px] font-mono tracking-widest text-[#5c4013]/30 uppercase select-none">
                REMEMBER
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <motion.div
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.85, opacity: 0 }}
      whileHover={{ 
        y: -6,
        rotate: rotation + (rotation > 0 ? -1.5 : 1.5),
        z: 40,
        boxShadow: '0 20px 35px -5px rgba(0,0,0,0.4), 0 8px 10px -6px rgba(0,0,0,0.3)',
      }}
      onMouseEnter={() => onHover(memory.id)}
      onMouseLeave={() => onHover(null)}
      onClick={onClick}
      className={`absolute cursor-pointer p-2.5 pb-3 bg-stone-50 border border-stone-200 shadow-md rounded-sm select-none transition-shadow ease-out duration-300 pointer-events-auto h-52 w-[142px] overflow-hidden`}
      style={{
        left: `${px}%`,
        top: `${py}%`,
        transform: `rotate(${rotation}deg)`,
        transformOrigin: 'top center',
      }}
    >
      {/* Light bulb reflection overlay across the photo */}
      <div className="absolute inset-0 bg-linear-to-tr from-transparent via-white/5 to-white/10 pointer-events-none z-10"></div>

      {/* Delete button — shows on hover, two-step confirm to avoid accidents */}
      {isHovered && (
        <button
          onClick={handleDeleteClick}
          onMouseEnter={() => onHover(memory.id)}
          className={`absolute top-1 right-1 z-50 flex items-center justify-center rounded-full backdrop-blur-sm transition-all duration-200 select-none ${confirmingDelete ? "bg-red-600/90 text-white text-[8px] font-bold px-2 h-5" : "bg-black/40 text-white/80 hover:bg-red-600/90 hover:text-white h-5 w-5 text-xs"}`}
          title={confirmingDelete ? "再点一次确认删除" : "删除"}
        >
          {confirmingDelete ? "确认?" : "×"}
        </button>
      )}

      {/* Render pin/fastener hardware */}
      {renderFastener(pinnedBy)}

      {/* Main Polaroid Photo Area */}
      <div className="w-full h-34 bg-stone-900 border border-stone-200/50 relative overflow-hidden rounded-xs">
        {/* Placeholder background spinner */}
        {!imageLoaded && (
          <div className="absolute inset-0 bg-stone-900 flex items-center justify-center text-[9px] text-stone-550 font-mono">
            LOADING...
          </div>
        )}
        
        <img key={imgSrc}
          src={imgSrc}
          alt={title}
          referrerPolicy="no-referrer"
          onLoad={() => setImageLoaded(true)}
          onError={() => { if (memory.gallery && memory.gallery.length > 0 && imgSrc === image) { setImgSrc(memory.gallery[0]); } else { setImageLoaded(true); } }}
          className="absolute inset-0 w-full h-full object-cover grayscale-[10%] group-hover:grayscale-0 transition-all duration-300"
        />
        
        {/* Category Badge overlay on image */}
        <div className="absolute bottom-1.5 left-1.5 z-10 bg-black/60 backdrop-blur-[1px] px-1.5 py-0.5 rounded text-[8px] font-bold text-accent tracking-wide uppercase text-stone-100 uppercase scale-90 origin-bottom-left">
          {tag}
        </div>
      </div>

      {/* Polaroid Caption Footer */}
      <div className="mt-2.5 flex flex-col justify-between h-8 relative select-none">
        {/* Handwritten Tag underneath */}
        <div className="h-full flex flex-col justify-center leading-none text-center">
          <span 
            className="font-hand font-bold text-base text-stone-800 line-clamp-1 h-5 select-none"
            style={{ transform: 'rotate(-0.5deg)' }}
          >
            {title}
          </span>
          <span className="font-mono text-[8px] text-stone-400 mt-0.5">
            {date}
          </span>
        </div>
      </div>

      {/* Details/Tooltip showing ONLY when hovered */}
      {isHovered && (
        <div 
          className="absolute inset-x-2 bottom-2 bg-stone-900/90 text-[9px] p-2 rounded text-stone-200 flex flex-col gap-0.5 transition-all z-40 shadow-xl opacity-95 animate-fade-in line-clamp-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="font-bold font-display uppercase tracking-wider text-amber-400">
            {memory.category === 'travel' 
              ? '✦ 漫旅印迹' 
              : memory.category === 'growth' 
              ? '✦ 生长轨迹' 
              : memory.category === 'motorcycle' 
              ? '✦ 孤骑摩风' 
              : '✦ 手工摄影'}
          </div>
          <div className="font-sans line-clamp-2 font-light leading-snug">
            {memory.pastSelf}
          </div>
        </div>
      )}
    </motion.div>
  );
}
