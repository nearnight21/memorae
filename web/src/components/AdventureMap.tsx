import React from 'react';
import { Compass, Pin } from 'lucide-react';
import { Memory } from '../types';

interface AdventureMapProps {
  year: number;
  activeYearMemories: Memory[];
  hoveredMemoryId: string | null;
  onHoverMemory: (id: string | null) => void;
}

export default function AdventureMap({
  year,
  activeYearMemories,
  hoveredMemoryId,
  onHoverMemory,
}: AdventureMapProps) {
  // Define vintage map colors per year for subtle chronological paper aging feel
  const mapPaperColor = 
    year === 2024 ? 'bg-[#ebdcb4]' : // Warm beige for early route
    year === 2025 ? 'bg-[#e2d09e]' : // Deeper amber-gold for archipelago odyssey
    'bg-[#dfd5bc]';                  // Muted sage-parchment for higher peak destination

  // Decorative border shading overlay
  const borderVignette =
    year === 2024 ? 'border-[#cfb784] shadow-[inset_0_0_24px_rgba(100,50,10,0.15)]' :
    year === 2025 ? 'border-[#c1a76a] shadow-[inset_0_0_28px_rgba(80,40,5,0.22)]' :
    'border-[#beae82] shadow-[inset_0_0_30px_rgba(70,55,20,0.20)]';

  return (
    <div
      className={`absolute ${mapPaperColor} rounded-lg shadow-inner border border-amber-900/30 p-4 paper-grain shadow-amber-950/20 flex flex-col justify-between overflow-hidden transition-colors duration-500`}
      style={{
        left: '29%',
        top: '23%',
        width: '42%',
        height: '52%',
        transform: year === 2024 ? 'rotate(-0.5deg)' : year === 2025 ? 'rotate(0.8deg)' : 'rotate(-0.3deg)',
      }}
    >
      {/* Tape holds on the map corners holding down different angles */}
      {year === 2024 && (
        <>
          <div className="absolute -top-1 left-8 w-12 h-4 bg-amber-100/40 backdrop-blur-[1px] border-b border-amber-250/25 -rotate-3 shadow-xs origin-center" />
          <div className="absolute -bottom-1 right-12 w-14 h-4 bg-amber-100/40 backdrop-blur-[1px] border-b border-amber-250/25 -rotate-1 shadow-xs origin-center" />
        </>
      )}
      {year === 2025 && (
        <>
          <div className="absolute top-4 -left-3 w-4 h-12 bg-amber-200/35 backdrop-blur-[1px] border-r border-amber-300/20 rotate-12 shadow-xs origin-center" />
          <div className="absolute -bottom-1 right-6 w-12 h-4 bg-[#b59e7a]/30 border-t border-[#8c7451]/30 rotate-2 shadow-xs origin-center" />
        </>
      )}
      {year === 2026 && (
        <>
          {/* Ornate metallic corners instead of tapes for the final peak map */}
          <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-stone-800/40 rounded-tl-sm" />
          <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-stone-800/40 rounded-tr-sm" />
          <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-stone-800/40 rounded-bl-sm" />
          <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-stone-800/40 rounded-br-sm" />
        </>
      )}

      {/* Vignette ambient shadows inside the map */}
      <div className={`absolute inset-0 pointer-events-none border rounded-lg ${borderVignette}`} />

      {/* RENDER CUSTOM SVG GEOGRAPHY CORRESPONDING TO THE SPECIFIC YEAR */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.24] pointer-events-none" xmlns="http://www.w3.org/2000/svg">
        {/* ========================================= */}
        {/* YEAR 2024: FORESTS, WILDERNESSES & MAINLAND */}
        {/* ========================================= */}
        {year === 2024 && (
          <>
            {/* Compass rose background grid */}
            <line x1="20%" y1="0%" x2="20%" y2="100%" stroke="#8a5e3c" strokeWidth="0.5" strokeDasharray="2 3" />
            <line x1="50%" y1="0%" x2="50%" y2="100%" stroke="#8a5e3c" strokeWidth="0.5" strokeDasharray="2 3" />
            <line x1="80%" y1="0%" x2="80%" y2="100%" stroke="#8a5e3c" strokeWidth="0.5" strokeDasharray="2 3" />
            <line x1="0%" y1="30%" x2="100%" y2="30%" stroke="#8a5e3c" strokeWidth="0.5" strokeDasharray="2 3" />
            <line x1="0%" y1="70%" x2="100%" y2="70%" stroke="#8a5e3c" strokeWidth="0.5" strokeDasharray="2 3" />

            {/* Mainland Coastline */}
            <path
              d="M 0,40 Q 25,60 40,95 T 80,120 T 110,95 T 140,160 T 180,210 T 260,240 M 260,240 T 340,210 T 400,310"
              fill="none"
              stroke="#8a5e3c"
              strokeWidth="1.5"
              className="opacity-75"
            />

            {/* Pine forest trees icon drawings */}
            <g stroke="#8a5e3c" strokeWidth="0.85" fill="none" className="opacity-70">
              {/* Forest cluster left */}
              <polygon points="25,185 20,195 30,195" />
              <polygon points="32,183 27,193 37,193" />
              <polygon points="18,190 13,200 23,200" />
              {/* Forest cluster middle */}
              <polygon points="120,65 116,73 124,73" />
              <polygon points="126,63 122,71 130,71" />
            </g>

            {/* Mountain ridges */}
            <g stroke="#8a5e3c" strokeWidth="1" fill="none" className="opacity-70">
              <path d="M 45,170 L 52,158 L 59,170" />
              <path d="M 50,170 L 56,162 L 62,170" />
              <path d="M 38,173 L 44,163 L 50,173" />
            </g>

            {/* Sea waves and a little boat */}
            <path d="M 280,110 Q 285,105 290,110 T 300,110" fill="none" stroke="#8a5e3c" strokeWidth="0.75" />
            <path d="M 310,135 Q 315,130 320,135 T 330,135" fill="none" stroke="#8a5e3c" strokeWidth="0.75" />

            {/* Retro Sailboat drawing */}
            <g transform="translate(250, 60)" stroke="#8a5e3c" strokeWidth="0.9" fill="none" className="opacity-75">
              <path d="M 3,12 L 21,12 L 18,16 L 6,16 Z" fill="#8a5e3c" fillOpacity="0.1" />
              <line x1="12" y1="2" x2="12" y2="12" />
              <path d="M 12,2 Q 6,6 12,10" />
              <path d="M 12,4 Q 17,7 12,11" />
            </g>
          </>
        )}

        {/* ========================================= */}
        {/* YEAR 2025: NAUTICAL ARCHIPELAGO & ISLANDS */}
        {/* ========================================= */}
        {year === 2025 && (
          <>
            {/* Marine nautical circles helper overlay */}
            <circle cx="50%" cy="50%" r="20%" stroke="#8a5e3c" strokeWidth="0.4" strokeDasharray="3 6" />
            <circle cx="50%" cy="50%" r="40%" stroke="#8a5e3c" strokeWidth="0.4" strokeDasharray="3 6" />
            <line x1="0%" y1="50%" x2="100%" y2="50%" stroke="#8a5e3c" strokeWidth="0.4" strokeDasharray="4 8" />
            <line x1="50%" y1="0%" x2="50%" y2="100%" stroke="#8a5e3c" strokeWidth="0.4" strokeDasharray="4 8" />

            {/* Scattered Islands contours */}
            <g stroke="#8a5e3c" strokeWidth="1.25" fill="#ede1b0" fillOpacity="0.25" className="opacity-80">
              {/* West Isle */}
              <path d="M 30,55 C 50,45 65,55 55,75 C 45,85 20,80 30,55 Z" />
              {/* Central Reef */}
              <path d="M 120,150 C 145,135 160,150 150,175 C 135,185 110,180 120,150 Z" />
              {/* East archipelago strip */}
              <path d="M 270,80 C 290,75 300,90 295,110 C 280,120 260,105 270,80 Z" />
              <circle cx="310" cy="115" r="5" />
              <circle cx="255" cy="70" r="4.5" />
              {/* South Cape */}
              <path d="M 190,230 C 220,220 240,240 220,260 C 200,270 180,250 190,230 Z" />
            </g>

            {/* Deep ocean trench dashed contours */}
            <path d="M 70,120 Q 95,100 120,130 T 90,170 Z" fill="none" stroke="#8a5e3c" strokeWidth="0.6" strokeDasharray="2 3" className="opacity-50" />

            {/* Sea Monster / Kraken tail emerging from the deep! */}
            <g transform="translate(85, 140)" stroke="#8a5e3c" strokeWidth="1.1" fill="#8a5e3c" fillOpacity="0.15" className="opacity-80">
              <path d="M 0,20 Q 8,-12 18,-2 Q 22,-20 30,5 Q 16,3 0,20" />
              <path d="M 10,7 Q 15,3 15,-2" />
              <circle cx="18" cy="1" r="1" />
              <circle cx="15" cy="4" r="1" />
            </g>

            {/* Compass direction angles lines originating from center compass */}
            <line x1="50%" y1="50%" x2="10%" y2="20%" stroke="#8a5e3c" strokeWidth="0.35" className="opacity-45" />
            <line x1="50%" y1="50%" x2="90%" y2="80%" stroke="#8a5e3c" strokeWidth="0.35" className="opacity-45" />
            <line x1="50%" y1="50%" x2="15%" y2="85%" stroke="#8a5e3c" strokeWidth="0.35" className="opacity-45" />
            <line x1="50%" y1="50%" x2="85%" y2="15%" stroke="#8a5e3c" strokeWidth="0.35" className="opacity-45" />
          </>
        )}

        {/* ========================================= */}
        {/* YEAR 2026: GRAND SUMMITS & CONTOUR LINES */}
        {/* ========================================= */}
        {year === 2026 && (
          <>
            {/* Triangulation/Star constellation background chart */}
            <line x1="30%" y1="20%" x2="55%" y2="50%" stroke="#8a5e3c" strokeWidth="0.4" className="opacity-40" />
            <line x1="55%" y1="50%" x2="80%" y2="25%" stroke="#8a5e3c" strokeWidth="0.4" className="opacity-40" />
            <line x1="55%" y1="50%" x2="50%" y2="85%" stroke="#8a5e3c" strokeWidth="0.4" className="opacity-40" />
            <circle cx="30%" cy="20%" r="2" fill="#8a5e3c" />
            <circle cx="80%" cy="25%" r="2" fill="#8a5e3c" />
            <circle cx="50%" cy="85%" r="1.5" fill="#8a5e3c" />

            {/* High Highland elevation contour lines (Concentric heights) */}
            <g stroke="#8a5e3c" strokeWidth="0.8" fill="none" className="opacity-70">
              {/* Ridge 1: High Peak */}
              <path d="M 120,120 Q 155,90 205,110 T 225,160 T 175,200 T 115,170 Z" strokeWidth="0.75" />
              <path d="M 135,130 Q 165,105 195,120 T 210,155 T 170,185 T 130,160 Z" strokeWidth="1" />
              <path d="M 150,140 Q 175,120 185,130 T 195,150 T 165,170 T 145,150 Z" strokeWidth="1.25" />
              {/* Summit center point mark */}
              <polygon points="172,143 175,138 178,143" fill="#8a5e3c" />

              {/* Ridge 2: Subsidiary peak */}
              <path d="M 230,170 Q 255,160 275,180 T 265,210 T 225,200 Z" strokeWidth="0.6" />
              <path d="M 242,180 Q 257,173 265,185 T 257,200 Z" strokeWidth="0.8" />
            </g>

            {/* High-altitude curly clouds / mists */}
            <g stroke="#8a5e3c" strokeWidth="0.85" fill="none" className="opacity-60">
              <path d="M 35,45 C 45,35 60,35 60,45 C 60,55 45,55 35,45 M 32,48 C 42,40 52,44 50,52" />
              <path d="M 315,65 C 325,55 340,55 340,65 C 340,75 325,75 315,65 M 312,68 C 322,60 332,64 330,72" />
            </g>

            {/* Classic Vintage Hot Air Balloon drifting floating */}
            <g transform="translate(60, 110)" stroke="#8a5e3c" strokeWidth="0.9" fill="none" className="opacity-80">
              {/* Balloon Envelope */}
              <path d="M 8,0 C 15,-1 19,8 14,14 C 11,17 9,19 9,21 L 7,21 C 7,19 5,17 2,14 C -3,8 1,-1 8,0 Z M 5,2 C 8,0 10,0 11,2 M 2.5,7 C 6,5 10,5 13.5,7 M 2,12 C 5.5,10 10.5,10 14,12" />
              {/* Hanging ropes and basket */}
              <line x1="4.5" y1="21" x2="4.5" y2="24.5" strokeWidth="0.6" />
              <line x1="11.5" y1="21" x2="11.5" y2="24.5" strokeWidth="0.6" />
              <rect x="5.5" y="24.5" width="5" height="3.5" rx="0.5" fill="#8a5e3c" fillOpacity="0.1" />
            </g>
          </>
        )}
      </svg>

      {/* Map Header */}
      <div className="z-10 flex items-start justify-between">
        <div>
          <h3 className="text-xs font-bold font-display tracking-widest text-[#5c3e21] uppercase">
            {year === 2024 ? '启程·荒原林境' : year === 2025 ? '行远·千屿群岛' : '登临·绝巅云图'}
          </h3>
          <p className="text-[8.5px] text-[#805e3b] font-mono leading-none tracking-wider">
            {year === 2024 ? 'THE WILD BEYOND · 2024' : year === 2025 ? 'ARCHIPELAGO PASSAGE · 2025' : 'THE HIGHEST PEAKS · 2026'}
          </p>
        </div>
        <Compass className={`h-5 w-5 text-[#8a5e3c] opacity-65 ${
          year === 2024 ? 'animate-[spin_70s_linear_infinite]' :
          year === 2025 ? 'animate-[spin_55s_linear_infinite]' :
          'animate-[spin_40s_linear_infinite]'
        }`} />
      </div>

      {/* Compass rose card in corner */}
      <div className="absolute right-3 bottom-3 opacity-40 pointer-events-none flex flex-col items-center">
        <div className="text-[7px] text-[#5c3e21] font-bold font-mono">
          {year === 2024 ? 'N 45°' : year === 2025 ? 'E 120°' : 'ALT 3K'}
        </div>
        <div className="w-4 h-4 border border-dashed border-[#8a5e3c] rounded-full flex items-center justify-center">
          <div className={`w-2 h-2 bg-[#8a5e3c] transform rotate-45 transition-transform duration-1000 ${
            year === 2024 ? 'rotate-12' : year === 2025 ? 'rotate-90' : 'rotate-180'
          }`} />
        </div>
        <div className="text-[6px] text-[#5c3e21] font-mono tracking-tighter">
          {year} EXPEDITION
        </div>
      </div>

      {/* Overlay Pins */}
      <div className="absolute inset-0 w-full h-full">
        {activeYearMemories
          .filter((m) => m.location)
          .map((m) => {
            const loc = m.location!;
            const isHovered = hoveredMemoryId === m.id;
            
            return (
              <div
                key={m.id}
                className="absolute transform -translate-x-1/2 -translate-y-1/2 group z-20"
                style={{ left: `${loc.mx}%`, top: `${loc.my}%` }}
                onMouseEnter={() => onHoverMemory(m.id)}
                onMouseLeave={() => onHoverMemory(null)}
              >
                {/* Visual Glow rings for current year active endpoints */}
                <div
                  className={`absolute -inset-1 rounded-full transition-all duration-300 ${
                    isHovered 
                      ? 'bg-red-500/40 animate-ping' 
                      : 'bg-amber-600/10 group-hover:bg-amber-600/30'
                  }`}
                />
                
                {/* Pin visual */}
                <div className="relative flex flex-col items-center cursor-pointer">
                  <div className={`p-1 rounded-full transition-all duration-300 ${
                    isHovered 
                      ? 'text-red-600 scale-125 filter drop-shadow-[0_2px_4px_rgba(239,68,68,0.5)]' 
                      : 'text-[#6e4626] hover:text-red-500'
                  }`}>
                    <Pin className={`h-4.5 w-4.5 ${isHovered ? 'fill-red-600' : 'fill-amber-900/20'}`} />
                  </div>

                  {/* Tiny Handwritten label */}
                  <div className={`absolute top-full mt-0.5 whitespace-nowrap bg-[#faeed1] px-1 py-0.5 rounded border border-amber-900/20 text-[9px] font-hand font-bold text-stone-800 shadow-sm transition-all duration-200 pointer-events-none ${
                    isHovered ? 'scale-110 opacity-100 translate-y-0.5 z-30 ring-1 ring-red-300' : 'opacity-80'
                  }`}>
                    {loc.name}
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      {/* Map Legend (Bottom Left) */}
      <div className="z-10 flex flex-col gap-0.5 text-[#805e3b] text-[8px] font-mono leading-tight">
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-red-600 inline-block animate-pulse"></span>
          <span>已启封踪迹(📍)</span>
        </div>
        <div className="text-[7px]">
          {year === 2024 ? '比例：1:1500公里 荒原尺度' : year === 2025 ? '比例：1:2400海里 浩海刻度' : '比例：海拔1:100米 崇阿攀登'}
        </div>
      </div>
    </div>
  );
}
