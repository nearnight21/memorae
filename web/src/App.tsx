import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Sparkles, 
  Volume2, 
  VolumeX, 
  Info, 
  MapPin, 
  Compass, 
  Calendar,
  Layers,
  Inbox,
  PenTool,
  HelpCircle,
  FolderOpen,
  BookOpen,
  Clock3,
  Footprints,
  ChevronRight,
  X
} from 'lucide-react';

// Data & Types
import { Memory, CategoryType, PinnedBy } from './types';
import { INITIAL_MEMORIES } from './data';

// Supabase client
import { supabase, uploadImage, mapMemory, memoryToDb } from './supabase';

// Subcomponents
import CampfireSynthPlayer from './components/CampfireSynthPlayer';
import AdventureMap from './components/AdventureMap';
import MemoryCard from './components/MemoryCard';
import MemoryDetailPanel from './components/MemoryDetailPanel';
import AddMemoryDialog from './components/AddMemoryDialog';
import TimelineView from './components/TimelineView';
import MapView from './components/MapView';

export default function App() {
  // --- Auth States ---
  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // --- Persistent States ---
  const [memories, setMemories] = useState<Memory[]>([]);

  // --- Board Scenery States (Continuous Timeline) ---
  const [scrollX, setScrollX] = useState<number>(0);
  // Get sorted list of all unique years in memories, always including standard ones:
  const yearsList = Array.from(new Set([...memories.map(m => m.year), 2024, 2025, 2026])).sort((a, b) => a - b);
  const maxScrollX = yearsList.length - 1;
  const activeYearIndex = Math.min(yearsList.length - 1, Math.max(0, Math.round(scrollX)));
  const activeYear = yearsList[activeYearIndex];
  const [isLanternOn, setIsLanternOn] = useState<boolean>(true);
  const [hoveredMemoryId, setHoveredMemoryId] = useState<string | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1200);
  const [viewMode, setViewMode] = useState<'board' | 'timeline' | 'places'>('board');
  // 地区页首次打开后保留地图实例，切换视图时不重复初始化 Leaflet 和瓦片。
  const [hasOpenedPlaces, setHasOpenedPlaces] = useState(false);

  const switchViewMode = (mode: 'board' | 'timeline' | 'places') => {
    if (mode === 'places') setHasOpenedPlaces(true);
    setViewMode(mode);
  };

  // --- Auth initialization ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }: any) => {
      setSession(s);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, s: any) => {
      setSession(s);
    });

    return () => subscription?.unsubscribe();
  }, []);

  // --- Data fetch after auth ---
  useEffect(() => {
    if (!session) return;

    const loadData = async () => {
      const { data: memData, error: memErr } = await supabase
        .from("memories")
        .select("*")
        .order("date", { ascending: false });

      if (!memErr && memData && memData.length > 0) {
        setMemories(memData.map(m => ({ ...m, py: Math.max(0, Math.min(58, m.py)) })).map(mapMemory));
      } else if (!localStorage.getItem("camp_seeded")) {
        // Seed demo data once per browser; prevents re-seeding after the user deletes all memories
        setMemories(INITIAL_MEMORIES);
        for (const m of INITIAL_MEMORIES) {
          await supabase.from("memories").insert(memoryToDb(m));
        }
        localStorage.setItem("camp_seeded", "1");
      }
    };

    loadData();
  }, [session]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  const sliderTrackRef = useRef<HTMLDivElement>(null);

  // --- Smooth Glide Cinematic Transition Animation ---
  const animateToScrollX = (target: number) => {
    const startTime = performance.now();
    const duration = 400; // ms
    const startVal = scrollX;

    const animate = (time: number) => {
      const elapsed = time - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentVal = startVal + (target - startVal) * eased;
      setScrollX(currentVal);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setScrollX(target);
      }
    };

    requestAnimationFrame(animate);
  };

  // --- Slider thumb dragging logic ---
  const handleThumbPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const track = sliderTrackRef.current;
    if (!track) return;
    
    const rect = track.getBoundingClientRect();
    const padding = 16;
    const trackWidth = rect.width - padding * 2;
    const startX = e.clientX;
    const startPercent = maxScrollX > 0 ? scrollX / maxScrollX : 0;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const deltaPercent = dx / trackWidth;
      const nextPercent = Math.min(1, Math.max(0, startPercent + deltaPercent));
      setScrollX(nextPercent * maxScrollX);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  // --- Slider track click/drag logic ---
  const handleSliderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const track = sliderTrackRef.current;
    if (!track) return;
    
    const rect = track.getBoundingClientRect();
    const padding = 16;
    const trackWidth = rect.width - padding * 2;
    
    const clickX = e.clientX - rect.left - padding;
    const nextPercent = Math.min(1, Math.max(0, clickX / trackWidth));
    const targetScrollX = nextPercent * maxScrollX;
    
    setScrollX(targetScrollX);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - rect.left - padding;
      const nextP = Math.min(1, Math.max(0, dx / trackWidth));
      setScrollX(nextP * maxScrollX);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  // --- Swipe/drag panning on the upper corkboard itself ---
  const handleBoardPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // Exempt individual buttons, input fields, and standard clicking triggers
    if (
      target.closest('button') || 
      target.closest('input') || 
      target.closest('textarea') || 
      target.closest('select') ||
      target.closest('a') ||
      (target.closest('.pointer-events-auto') && !target.closest('#scrapbook-corkboard-inner > div') && !target.classList.contains('cork-drag-surface'))
    ) {
      return; 
    }

    const startX = e.clientX;
    const startScrollX = scrollX;
    const boardWidth = e.currentTarget.offsetWidth / yearsList.length;
    let isDragging = false;
    const dragThreshold = 5; // px

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      if (Math.abs(dx) > dragThreshold) {
        isDragging = true;
      }
      
      if (isDragging) {
        const delta = -dx / boardWidth;
        const nextScroll = Math.min(maxScrollX, Math.max(0, startScrollX + delta));
        setScrollX(nextScroll);
      }
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };
  
  // --- Dialog controllers ---
  const [showAddMemory, setShowAddMemory] = useState<boolean>(false);
  const [showGuide, setShowGuide] = useState<boolean>(false);

  // --- Supabase-backed state mutators ---
  const saveMemoriesToStorage = async (updatedMemories: Memory[]) => {
    setMemories(updatedMemories);
  };

  // --- Adds a new memory Polaroid ---
  const handleAddMemory = (newMem: Omit<Memory, 'id' | 'px' | 'py' | 'rotation'>) => {
    // Generate organic relative percentage positioning matching selected Category quadrants
    // travel: Left-Up (px:6-22, py:6-26)
    // growth: Right-Up (px:70-86, py:6-26)
    // motorcycle: Left-Down (px:6-22, py:58-75)
    // photography: Right-Down (px:70-86, py:58-75)
    let px = 20;
    let py = 20;

    const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

    switch (newMem.category) {
      case 'travel':
        px = rnd(4, 18);
        py = rnd(8, 22);
        break;
      case 'growth':
        px = rnd(76, 88);
        py = rnd(8, 22);
        break;
      case 'motorcycle':
        px = rnd(4, 18);
        py = rnd(40, 54);
        break;
      case 'photography':
      default:
        px = rnd(76, 88);
        py = rnd(40, 54);
        break;
    }

    // Include dynamic geographical map connection if category matches and locations available
    let locationVal = undefined;
    if (newMem.category === 'travel') {
      const places = [
        { name: 'Okinawa Beaches', mx: 38, my: 80 },
        { name: 'Toyama Peaks', mx: 50, my: 48 },
        { name: 'Sapporo Snows', mx: 66, my: 18 }
      ];
      locationVal = places[rnd(0, places.length - 1)];
    } else if (newMem.category === 'motorcycle') {
      const places = [
        { name: 'Izu Shore dirt route', mx: 58, my: 55 },
        { name: 'Nikko Scenic passes', mx: 60, my: 38 }
      ];
      locationVal = places[rnd(0, places.length - 1)];
    }

    const completedMemory: Memory = {
      ...newMem,
      id: `custom-memory-${Date.now()}`,
      px,
      py,
      rotation: rnd(-9, 9),
      location: locationVal
    };

    const updated = [completedMemory, ...memories];
    saveMemoriesToStorage(updated);
    // Persist to Supabase
    supabase.from("memories").insert(memoryToDb(completedMemory)).then(({ error }: any) => {
      if (error) console.error("addMemory error:", error);
    });

    // Dynamic focus onto the newly added memory's year
    const nextYearsList = Array.from(new Set([...updated.map(m => m.year), 2024, 2025, 2026])).sort((a, b) => a - b);
    const targetIdx = nextYearsList.indexOf(completedMemory.year);
    if (targetIdx !== -1) {
      setTimeout(() => {
        animateToScrollX(targetIdx);
      }, 300);
    }
  };

  // --- Updates present diary text or image gallery inside a memory (local only, saved via detail panel button) ---
  const handleUpdateMemory = (updatedMem: Memory) => {
    const updated = memories.map(m => m.id === updatedMem.id ? updatedMem : m);
    setMemories(updated);
    saveMemoriesToStorage(updated);
    
    // Sync current detail modal
    if (selectedMemory && selectedMemory.id === updatedMem.id) {
      setSelectedMemory(updatedMem);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    const updated = memories.filter(m => m.id !== id);
    setMemories(updated);
    saveMemoriesToStorage(updated);
    if (selectedMemory && selectedMemory.id === id) {
      setSelectedMemory(null);
    }
    await supabase.from("memories").delete().eq("id", id);
  };

  // --- Filter active memories on the board matching selected timeline year ---
  const currentTimelineMemories = memories.filter(m => m.year === activeYear);

  const isMobile = windowWidth < 1024;
  const targetW = Math.max(280, windowWidth * 0.94 - 16);
  const boardScale = isMobile ? Math.min(1, targetW / 1150) : 1;

  // --- Auth handlers ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setAuthError(error.message);
    }
    setAuthSubmitting(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setMemories([]);
  };

  // --- Auth loading screen ---
  if (authLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#1A1A18]">
        <div className="text-5xl animate-bounce">🏕️</div>
      </div>
    );
  }

  // --- Login page ---
  if (!session) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#1A1A18] p-4">
        <form onSubmit={handleLogin} className="w-full max-w-sm bg-[#23211D] border border-[#3a352e] rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">🏕️</div>
            <h1 className="text-2xl font-bold text-[#E8DEC8] font-display tracking-tight">Camp Memories</h1>
            <p className="text-sm text-[#9C947C] mt-1 font-mono">Sign in to continue</p>
          </div>
          {authError && (
            <div className="mb-4 p-2 bg-red-900/30 border border-red-800/40 rounded-lg text-red-300 text-xs text-center">
              {authError}
            </div>
          )}
          <div className="space-y-3 mb-5">
            <div>
              <label className="block text-xs font-mono text-[#9C947C] mb-1 tracking-wider uppercase">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-[#1A1A18] border border-[#3a352e] rounded-lg px-3 py-2.5 text-[#E8DEC8] text-sm focus:outline-none focus:border-[#6b5d4a] transition-colors"
                placeholder="your@email.com"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-[#9C947C] mb-1 tracking-wider uppercase">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-[#1A1A18] border border-[#3a352e] rounded-lg px-3 py-2.5 text-[#E8DEC8] text-sm focus:outline-none focus:border-[#6b5d4a] transition-colors"
                placeholder="••••••••"
                required
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={authSubmitting}
            className="w-full py-2.5 rounded-lg bg-[#E8DEC8] text-[#1A1A18] font-semibold text-sm hover:bg-[#d4c9ae] transition-colors cursor-pointer disabled:opacity-50"
          >
            {authSubmitting ? "Signing in..." : "Enter Camp Memories"}
          </button>
          <p className="text-center text-[10px] text-[#6b5d4a] mt-4 font-mono">
            Uses same Supabase account as ThinkPad
          </p>
        </form>
      </div>
    );
  }

  return (
    <div 
      className={`min-h-screen relative flex flex-col items-center justify-center overflow-hidden transition-all duration-1000 ${
        isLanternOn 
          ? 'bg-[#180e08]/95 select-none text-stone-200 shadow-[inset_0_0_150px_rgba(40,20,5,0.8)]' 
          : 'bg-[#04060d] select-none text-blue-100 shadow-[inset_0_0_200px_rgba(0,0,10,0.95)]'
      }`}
    >
      {/* 软木板 / 时间线沿用紧凑切换器；地区页使用设计稿中的左侧主导航 */}
      {viewMode !== 'places' && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-1 bg-stone-900/85 backdrop-blur-md rounded-full border border-stone-700/50 p-1 shadow-xl">
          {([
            { key: 'board', icon: '🗺️', name: '软木板' },
            { key: 'timeline', icon: '📖', name: '时间线' },
            { key: 'places', icon: '🌏', name: '地区' },
          ] as const).map((v) => (
            <button
              key={v.key}
              onClick={() => switchViewMode(v.key)}
              aria-label={v.name}
              title={v.name}
              className={`flex h-9 w-9 items-center justify-center rounded-full text-base transition-all cursor-pointer ${
                viewMode === v.key
                  ? 'bg-amber-500 text-stone-950 shadow'
                  : 'text-stone-300 hover:text-amber-300'
              }`}
            >
              <span aria-hidden="true">{v.icon}</span>
            </button>
          ))}
        </div>
      )}

      {/* Background Twinkling Night Stars when lantern is toggled off */}
      {!isLanternOn && (
        <div id="starfield" className="absolute inset-0 pointer-events-none opacity-80 transition-opacity duration-1000">
          <div className="absolute top-[10%] left-[25%] w-1 h-1 bg-white rounded-full animate-ping"></div>
          <div className="absolute top-[18%] left-[70%] w-0.5 h-0.5 bg-white rounded-full"></div>
          <div className="absolute top-[34%] left-[45%] w-1 h-1 bg-white rounded-full opacity-60"></div>
          <div className="absolute top-[65%] left-[15%] w-0.5 h-0.5 bg-white rounded-full animate-pulse"></div>
          <div className="absolute top-[80%] left-[82%] w-1.5 h-1.5 bg-blue-300 rounded-full animate-pulse"></div>
          <div className="absolute top-[48%] left-[88%] w-0.5 h-0.5 bg-white rounded-full"></div>
          <div className="absolute top-[28%] left-[10%] w-1.5 h-1.5 bg-indigo-300/40 rounded-full"></div>
        </div>
      )}

      {/* Ambient Tent shape silhouettes framing the screen */}
      <div className="absolute inset-0 pointer-events-none z-10 flex justify-between origin-top">
        {/* Left canvas tent flap */}
        <div 
          className="w-16 h-full bg-stone-950/20 [clip-path:polygon(0_0,100%_0,10%_100%,0_100%)] border-r border-stone-900/10"
          style={{ backgroundImage: 'linear-gradient(to right, rgba(0,0,0,0.4), transparent)' }}
        ></div>
        {/* Right canvas tent flap */}
        <div 
          className="w-16 h-full bg-stone-950/20 [clip-path:polygon(0_0,100%_0,100%_100%,90%_100%)] border-l border-stone-900/10"
          style={{ backgroundImage: 'linear-gradient(to left, rgba(0,0,0,0.4), transparent)' }}
        ></div>
      </div>

      {/* Atmospheric sounds & explanation banner in Header */}
      <header className="absolute top-4 inset-x-5 z-40 flex items-start justify-between">
        <div className="flex flex-col gap-1 text-left">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold font-display tracking-widest text-amber-500/90 uppercase">
              Camp Memories
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping"></span>
          </div>
          <p className="text-[10.5px] font-mono tracking-wider italic text-stone-400">
            "Every photo marks a place I once stood."
          </p>
        </div>

        {/* Ambient Volume Synthesizer Panel */}
        <div className="flex items-center gap-3">
          <button
            id="btn-trigger-guide"
            onClick={() => setShowGuide(true)}
            className="p-2 bg-stone-900/60 hover:bg-stone-800 border border-amber-950/40 text-stone-300 rounded-lg text-xs font-display flex items-center gap-1.5 transition-all outline-hidden cursor-pointer shadow"
          >
            <HelpCircle className="h-4 w-4" />
            <span className="hidden sm:inline">木板自白</span>
          </button>
          
          <CampfireSynthPlayer />
        </div>
      </header>

      {/* Right-Top hanging Camp Lantern Toggle Button (💡) */}
      <div 
        onClick={() => setIsLanternOn(!isLanternOn)}
        className="absolute top-0 right-[22%] z-45 flex flex-col items-center cursor-pointer group select-none"
        title="点击旋钮或灯体开关营灯"
      >
        {/* Wire holding the lamp */}
        <div className="w-[1.5px] h-12 bg-linear-to-b from-stone-950 to-stone-600 group-hover:to-amber-500 transition-colors shadow-lg"></div>

        {/* Vintage Hanging Metal Handle */}
        <div className="w-10 h-6 border-2 border-b-0 border-stone-600 rounded-t-full relative -bottom-1 group-hover:border-stone-400 transition-colors pointer-events-none"></div>

        {/* Hanging Lantern Head Structure */}
        <div className="relative flex flex-col items-center drop-shadow-[0_15px_15px_rgba(0,0,0,0.6)]">
          
          {/* 1. Hanging Top Ring */}
          <div className="w-3.5 h-3.5 rounded-full border border-stone-600 bg-stone-900 shadow-inner flex items-center justify-center -mb-0.5 z-10 pointer-events-none">
            <div className="w-1.5 h-1.5 rounded-full bg-stone-950"></div>
          </div>

          {/* 2. Tiered Copper Cap / Exhaust Cap */}
          <div className="w-8 h-2 bg-gradient-to-r from-amber-950 via-[#7c5831] to-amber-950 rounded-t-md border-b border-stone-950/70 z-10 pointer-events-none"></div>
          <div className="w-11 h-2.5 bg-gradient-to-r from-stone-900 via-[#8a633a] to-stone-950 rounded-sm border-t border-stone-700/40 -mt-0.5 z-10 pointer-events-none"></div>
          
          {/* 3. Wide Protective Brim (Casts Shadow) */}
          <div className="w-16 h-3 bg-gradient-to-r from-[#4d3215] via-[#8f683e] to-[#3a250d] rounded-t-md shadow-md border-b-[2px] border-[#a17e57] z-10 pointer-events-none flex items-center justify-center relative">
            {/* Ventilation slits detail */}
            <div className="flex gap-1">
              <div className="w-1 h-1 bg-stone-950 rounded-full opacity-65"></div>
              <div className="w-1 h-1 bg-stone-950 rounded-full opacity-65"></div>
              <div className="w-1 h-1 bg-stone-950 rounded-full opacity-65"></div>
            </div>
          </div>

          {/* 4. Protective Glass Chimney Globe */}
          <div className="w-11 h-14 relative bg-radial from-stone-900/10 to-stone-950/40 border-x border-stone-950/80 rounded-b-xl overflow-hidden shadow-inner flex items-center justify-center transition-all duration-500">
            {/* Inner glass highlights & reflections */}
            <div className="absolute inset-y-0 left-1 w-2 bg-gradient-to-r from-white/20 to-transparent pointer-events-none"></div>
            <div className="absolute inset-y-0 right-1 w-1 bg-gradient-to-l from-white/10 to-transparent pointer-events-none"></div>

            {/* Glowing Mantle Core */}
            <div className={`relative flex flex-col items-center justify-center transition-all duration-500 ${isLanternOn ? 'scale-105' : 'scale-95'}`}>
              {isLanternOn ? (
                <>
                  {/* Outer vibrant halo */}
                  <div className="absolute w-8 h-8 rounded-full bg-amber-400 opacity-70 blur-md animate-pulse"></div>
                  {/* Central glowing yellow cylinder (Mantle) */}
                  <div className="w-5 h-8 bg-gradient-to-b from-[#ffeed0] via-amber-300 to-amber-500 rounded-md shadow-[0_0_25px_12px_#f59e0b,0_0_45px_22px_#ea580c] relative z-10 flex items-center justify-center">
                    {/* Inner high-intensity filament line */}
                    <div className="w-1.5 h-5 bg-white rounded-full blur-[1px]"></div>
                  </div>
                </>
              ) : (
                /* Inactive gray thread filament */
                <div className="w-3.5 h-7 border border-stone-600 rounded-sm flex items-center justify-center relative opacity-70">
                  <div className="w-0.5 h-5 bg-stone-700"></div>
                </div>
              )}
            </div>

            {/* Brass wire guards crossing the glass */}
            <div className="absolute inset-x-1.5 inset-y-1 border border-[#8f683e]/50 rounded-b-lg pointer-events-none z-20"></div>
            <div className="absolute inset-x-2.5 inset-y-0.5 border-x border-[#8f683e]/50 rounded-b-lg pointer-events-none z-20"></div>
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-[#8f683e]/60 pointer-events-none z-20"></div>
          </div>

          {/* 5. Fuel Reservoir Base & Rotary Control Valve Switch */}
          <div className="w-13 h-9 bg-gradient-to-b from-[#523719] via-[#85613a] to-[#36220b] rounded-sm relative flex flex-col items-center justify-center shadow-lg border-t border-[#ab875e] -mt-0.5">
            {/* Thread detail */}
            <div className="w-12 h-1 bg-stone-900/60 rounded-t-xs -mt-1.5 mb-1.5 border-b border-stone-850/50"></div>

            {/* Vintage Rotary dimmer knob */}
            <div className="relative flex items-center justify-center">
              {/* Dimmer indicators */}
              <span className="absolute -left-3.5 text-[5px] font-mono font-bold text-amber-500/50 select-none pointer-events-none scale-75">OFF</span>
              <span className="absolute -right-3 text-[5px] font-mono font-bold text-amber-400/50 select-none pointer-events-none scale-75">ON</span>
              
              {/* Dial knob face */}
              <div 
                className="w-4 h-4 rounded-full bg-gradient-to-b from-stone-800 to-stone-950 border border-stone-600 shadow-md flex items-center justify-center transition-transform duration-500 cursor-pointer"
                style={{ transform: isLanternOn ? 'rotate(95deg)' : 'rotate(0deg)' }}
              >
                {/* Brass needle marker pointing state direction */}
                <div className="w-0.5 h-2 bg-amber-500 -mt-1 rounded-full relative"></div>
              </div>
            </div>
            
            {/* Minute manufacturer plaque / text logo on fuel tank */}
            <span className="text-[5px] font-mono text-[#a17e57]/50 mt-1 uppercase scale-75 tracking-wider font-bold">BRASS LED 2026</span>
          </div>

        </div>

        {/* Dynamic Warm Lamp Spotlight Glow overlay */}
        <AnimatePresence>
          {isLanternOn && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.8 }}
              exit={{ opacity: 0 }}
              className="absolute top-14 w-[500px] h-[500px] bg-radial from-amber-400/20 via-amber-600/5 to-transparent rounded-full -translate-x-[47%] pointer-events-none z-10 lantern-glow"
            />
          )}
        </AnimatePresence>

        <span className="text-[7.5px] font-mono font-bold tracking-widest text-[#a88a6d]/40 group-hover:text-amber-500 transition-colors mt-2 uppercase flex items-center gap-1">
          <span className={`w-1 h-1 rounded-full ${isLanternOn ? 'bg-amber-500 animate-pulse' : 'bg-stone-600'}`} />
          {isLanternOn ? '关闭营灯' : '开启黄光'}
        </span>
      </div>

      {/* ======================================================== */}
      {/* 2. CORKBOARD DECK MAT (The "垫子" Background Backdrop) */}
      {/* ======================================================== */}
      <div 
        id="scrapbook-corkboard-outer"
        className={`absolute overflow-hidden select-none bg-[#241409] z-10 transition-all duration-300 pointer-events-auto shadow-2xl ${
          isMobile 
            ? "left-1/2 top-1/2 rounded-[16px] border-[14px] border-[#372111]" 
            : "inset-0 w-full h-full border-[14px] border-[#372111]"
        }`}
        style={{
          width: isMobile ? '1150px' : '100%',
          height: isMobile ? '602px' : '100%',
          transform: isMobile ? `translate(-50%, -50%) scale(${boardScale})` : 'none',
          transformOrigin: 'center center',
        }}
      >
        {/* Static outer shadow framing */}
        <div className="absolute inset-0 pointer-events-none bg-radial from-transparent via-black/10 to-black/55 z-20"></div>

        {/* Inner sliding canvas container containing multiple panels */}
        <div
          id="scrapbook-corkboard-inner"
          className="absolute inset-0 flex h-full touch-none select-none pointer-events-auto"
          style={{
            width: `${yearsList.length * 100}%`,
            transform: `translateX(-${(scrollX / yearsList.length) * 100}%)`,
            transition: 'transform 0.1s ease-out'
          }}
          onPointerDown={handleBoardPointerDown}
        >
          {yearsList.map((yr) => {
            const panelMemories = memories.filter(m => m.year === yr);
            
  return (
              <div 
                key={yr}
                className="h-full relative p-6 cursor-grab active:cursor-grabbing select-none overflow-hidden"
                style={{ width: `${100 / yearsList.length}%` }}
              >
                {/* Local panel background textures */}
                <div className="absolute inset-0 cork-texture opacity-[0.78] pointer-events-none"></div>

                {/* Chalkboard chalk separator quadrant dividers */}
                <svg className="absolute inset-0 w-full h-full opacity-10 pointer-events-none border border-transparent z-10">
                  <line x1="50%" y1="5%" x2="50%" y2="95%" stroke="#ffffff" strokeWidth="1.5" strokeDasharray="6 12" />
                  <line x1="5%" y1="50%" x2="95%" y2="50%" stroke="#ffffff" strokeWidth="1.5" strokeDasharray="6 12" />
                </svg>

                {/* Floating Quadrant indicators helper written on paper */}
                <div className="absolute top-[8%] left-[4.5%] z-30 opacity-40 font-hand text-stone-100 text-sm rotate-2 pointer-events-none">
                  {yr === 2024 
                    ? '🗺️ 远方足迹 Wanderlust' 
                    : yr === 2025 
                    ? '🗺️ 旅途留影 Journeys' 
                    : yr === 2026 
                    ? '🗺️ 山海漫步 Footprints' 
                    : '🗺️ 涉足大地 Wanderland'}
                </div>
                <div className="absolute top-[8%] right-[4.5%] z-35 opacity-40 font-hand text-stone-100 text-sm -rotate-3 pointer-events-none">
                  {yr === 2024 
                    ? '🌱 心路历程 Inner Path' 
                    : yr === 2025 
                    ? '🌱 自我蜕变 Self Oasis' 
                    : yr === 2026 
                    ? '🌱 破茧绽放 Full Bloom' 
                    : '🌱 智慧沉淀 Wisdom Rise'}
                </div>
                <div className="absolute bottom-[28%] left-[4.5%] z-30 opacity-40 font-hand text-stone-100 text-sm -rotate-2 pointer-events-none">
                  {yr === 2024 
                    ? '☕ 日常微光 Cozy Days' 
                    : yr === 2025 
                    ? '🌻 烟火日常 Passions' 
                    : yr === 2026 
                    ? '🏡 岁月一瞥 Sweet Home' 
                    : '🎨 喜好热爱 Simple Joys'}
                </div>
                <div className="absolute bottom-[28%] right-[4.5%] z-35 opacity-40 font-hand text-stone-100 text-sm rotate-3 pointer-events-none">
                  {yr === 2024 
                    ? '📷 美好定格 Captured Snaps' 
                    : yr === 2025 
                    ? '📷 漫长光影 Lens & Light' 
                    : yr === 2026 
                    ? '📷 时光标本 Keepsakes' 
                    : '📷 凝镜瞬间 Shutter Glow'}
                </div>

                {/* 1. CENTRAL RUSTIC MAP COMPONENT */}
                <AdventureMap
                  year={yr}
                  activeYearMemories={panelMemories}
                  hoveredMemoryId={hoveredMemoryId}
                  onHoverMemory={setHoveredMemoryId}
                />

                {/* 2. SVG THE THREADS CONNECTION CONNECTOR */}
                <svg 
                  className="absolute inset-0 w-full h-full pointer-events-none z-30"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <filter id="yarn-shadow" x="-10%" y="-10%" width="120%" height="120%">
                    <feDropShadow dx="1" dy="3" stdDeviation="1.5" floodColor="#000000" floodOpacity="0.5" />
                  </filter>

                  {panelMemories
                    .filter(m => m.location)
                    .map(m => {
                      const loc = m.location!;
                      const isActive = hoveredMemoryId === m.id;

                      // Source Photo connection anchor point
                      const sx = m.px + 6;
                      const sy = m.py + 4;

                      // Target Adventure Map marker pin relative to the panel
                      const tx = 29 + (loc.mx * 0.42);
                      const ty = 23 + (loc.my * 0.52);

                      // Control points to draw curved thread
                      const midX = (sx + tx) / 2;
                      const midY = ((sy + ty) / 2) + 2.5;

  return (
                        <path
                          key={`thread-${m.id}`}
                          d={`M ${sx},${sy} Q ${midX},${midY} ${tx},${ty}`}
                          fill="none"
                          filter="url(#yarn-shadow)"
                          stroke={isActive ? '#dc2626' : '#991b1b'}
                          strokeWidth={isActive ? '2.5' : '1.4'}
                          strokeDasharray={isActive ? 'none' : '2.5 1'}
                          className={`transition-all duration-300 ${isActive ? 'animate-pulse opacity-100' : 'opacity-35'}`}
                        />
                      );
                    })}
                </svg>

                {/* 3. POLAROID PHOTOS RENDERER */}
                <div className="absolute inset-0 w-full h-full pointer-events-none select-none">
                  <AnimatePresence mode="popLayout">
                    {panelMemories.map(memory => (
                      <MemoryCard
                        key={memory.id}
                        memory={memory}
                        isHovered={hoveredMemoryId === memory.id}
                        onHover={setHoveredMemoryId}
                        onClick={() => setSelectedMemory(memory)}
                        onDelete={handleDeleteMemory}
                      />
                    ))}
                  </AnimatePresence>
                </div>

              </div>
            );
          })}
        </div>
      </div>

      {/* ======================================================== */}
      {/* 3. TIMELINE NAVIGATION DECK FLOATING ON TOP */}
      {/* ======================================================== */}
      {/* Floating Add-Memory button — right edge, vertically centered */}
      <button
        id="btn-trigger-add-memory"
        onClick={() => setShowAddMemory(true)}
        title="钉入新的回忆"
        className="fixed left-4 bottom-6 z-40 bg-amber-900 hover:bg-amber-950 text-[#fffdfa] border border-amber-800/40 rounded-full flex items-center justify-center transition-all shadow-lg hover:shadow-xl hover:scale-105 cursor-pointer w-11 h-11 pointer-events-auto"
      >
        <Plus className="h-6 w-6" />
      </button>

      <main 
        id="timeline-controls-panel"
        className={`w-[90%] max-w-[420px] z-30 flex flex-col md:flex-row items-center justify-between gap-5 select-none pointer-events-auto absolute left-1/2 -translate-x-1/2 bottom-14`}
      >

        {/* Right: Custom timber continuous Timeline Slider with click snap-notch */}
        <div className="flex-grow max-w-lg w-full flex flex-col gap-1.5">
          <div className="flex justify-between items-center px-1">
            <span className="text-[10px] font-mono font-bold text-amber-500 bg-stone-950/70 py-0.5 px-2 rounded-full shadow-inner border border-stone-900/40">
              {maxScrollX > 0 ? Math.round((scrollX / maxScrollX) * 100) : 100}% 跨度深研
            </span>
          </div>

          <div 
            ref={sliderTrackRef}
            onPointerDown={handleSliderPointerDown}
            className="relative h-7 bg-stone-950/10 rounded-full border border-stone-900/30 backdrop-blur-md [box-shadow:inset_0_2px_4px_rgba(0,0,0,0.8)] cursor-pointer flex items-center px-4"
          >
            {/* Runway track line */}
            <div className="absolute inset-x-4 h-1.5 bg-[#4c3523] rounded-full overflow-hidden">
              <div 
                className="h-full bg-linear-to-r from-amber-800 via-amber-600 to-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)] transition-all duration-100"
                style={{ width: `${maxScrollX > 0 ? (scrollX / maxScrollX) * 100 : 100}%` }}
              />
            </div>

            {/* Dynamic Milestone notches based on yearsList */}
            {yearsList.map((yr, idx) => {
              const leftPercent = maxScrollX > 0 ? (idx / maxScrollX) * 100 : 50;
  return (
                <div 
                  key={yr}
                  onClick={(e) => {
                    e.stopPropagation();
                    animateToScrollX(idx);
                  }}
                  className="absolute transform -translate-x-1/2 flex flex-col items-center group/notch z-10"
                  style={{ left: `calc(1rem + ${leftPercent}% - ${leftPercent * 2 / 100}rem)` }}
                >
                  <div className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-300 cursor-pointer ${
                    Math.round(scrollX) === idx
                      ? 'bg-amber-400 border-stone-950 scale-125 shadow-[0_0_10px_2px_rgba(251,191,36,0.8)]'
                      : 'bg-stone-800 border-[#4c3523] hover:border-amber-600'
                  }`} />
                  <span className={`absolute top-5.5 whitespace-nowrap text-[9.5px] font-bold font-mono tracking-wider transition-all select-none ${
                    Math.round(scrollX) === idx 
                      ? 'text-amber-500 scale-105' 
                      : 'text-stone-400 group-hover/notch:text-stone-200'
                  }`}>
                    {yr}
                  </span>
                </div>
              );
            })}

            {/* Slider Thumb (Retro Compass-pointer inspired brass dial) */}
            <div 
              className="absolute w-8 h-8 rounded-full bg-linear-to-b from-amber-500 to-amber-700 border-2 border-stone-950 shadow-xl cursor-grab active:cursor-grabbing flex items-center justify-center -ml-4 z-20 hover:scale-110 active:scale-95 hover:shadow-amber-500/20 transition-transform touch-none"
              style={{ 
                left: `calc(1rem + ${(maxScrollX > 0 ? scrollX / maxScrollX : 0) * 100}% - ${(maxScrollX > 0 ? scrollX / maxScrollX : 0) * 2}rem)`,
              }}
              onPointerDown={handleThumbPointerDown}
            >
              {/* Mini compass / brass accent design inside */}
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white">
                🧭
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer copyright */}
      <footer className="absolute bottom-3 left-0 right-0 z-30 text-center text-[10px] text-stone-500 font-mono tracking-widest pointer-events-none">
        <p>CAMP MEMORIES Ledger © 2026 · Places Pinned, People Grown</p>
      </footer>

      {/* 时间线单独覆盖；地图在首次打开后保持挂载，避免重复初始化和重新下载瓦片。 */}
      {viewMode === 'timeline' && (
        <div className="fixed inset-0 z-50">
          <TimelineView memories={memories} onSelectMemory={setSelectedMemory} />
        </div>
      )}

      {hasOpenedPlaces && (
        <div className={`fixed inset-0 z-50 ${viewMode === 'places' ? '' : 'invisible pointer-events-none'}`}>
          <MapView
            memories={memories}
            selectedMemory={selectedMemory}
            onSelectMemory={setSelectedMemory}
            onCloseMemory={() => setSelectedMemory(null)}
            onUpdateMemory={handleUpdateMemory}
          />
          <aside
                id="places-primary-nav"
                className={`fixed inset-y-0 left-0 z-[1200] flex flex-col border-r border-white/10 bg-[#202322]/96 text-[#D9D4C8] shadow-[12px_0_32px_rgba(28,31,30,0.12)] backdrop-blur-md transition-[width] duration-300 ${
                  selectedMemory ? 'w-14' : 'w-[86px]'
                }`}
                aria-label="地区页主导航"
              >
                {selectedMemory ? (
                  <button
                    type="button"
                    onClick={() => setSelectedMemory(null)}
                    aria-label="收起记忆"
                    title="收起记忆"
                    className="my-auto flex h-16 w-full items-center justify-center text-[#C9A552] transition-colors hover:bg-white/[0.045] hover:text-[#E2C16D] cursor-pointer"
                  >
                    <ChevronRight className="h-6 w-6" strokeWidth={1.4} />
                  </button>
                ) : (
                  <>
                    <div className="flex h-[118px] shrink-0 flex-col items-center justify-center">
                      <span className="font-editorial-serif text-[32px] leading-none text-[#C3A35D]">M</span>
                      <span className="mt-2 h-px w-7 bg-[#C3A35D]/65" />
                      <span className="mt-1 h-1 w-1 rounded-full bg-[#C3A35D]" />
                    </div>

                    <nav className="mt-10 flex flex-col" aria-label="页面切换">
                      {([
                        { key: 'board', icon: BookOpen, name: '回忆' },
                        { key: 'timeline', icon: Clock3, name: '时间线' },
                        { key: 'places', icon: Footprints, name: '足迹' },
                      ] as const).map((item) => {
                        const Icon = item.icon;
                        const active = viewMode === item.key;
                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => {
                              setSelectedMemory(null);
                              switchViewMode(item.key);
                            }}
                            aria-label={item.name}
                            aria-current={active ? 'page' : undefined}
                            className={`relative flex h-[98px] flex-col items-center justify-center gap-2 text-[11px] tracking-[0.08em] transition-colors cursor-pointer ${
                              active
                                ? 'bg-white/[0.055] text-[#D2B15F]'
                                : 'text-[#A9AAA6] hover:bg-white/[0.035] hover:text-[#E8E3D7]'
                            }`}
                          >
                            {active && <span className="absolute inset-y-0 left-0 w-[2px] bg-[#C3A35D]" />}
                            <Icon className="h-6 w-6" strokeWidth={1.45} />
                            <span>{item.name}</span>
                          </button>
                        );
                      })}
                    </nav>

                    <div className="mt-auto flex flex-col items-center pb-7">
                      <button
                        id="btn-add-memory-from-map"
                        type="button"
                        onClick={() => setShowAddMemory(true)}
                        aria-label="添加回忆"
                        title="添加回忆"
                        className="flex h-12 w-12 items-center justify-center rounded-full border border-[#C3A35D]/55 bg-[#A8843E] text-[#FFF9EA] shadow-[0_8px_22px_rgba(0,0,0,0.22)] transition-all hover:-translate-y-0.5 hover:bg-[#B8944C] cursor-pointer"
                      >
                        <Plus className="h-6 w-6" strokeWidth={1.6} />
                      </button>
                      <span className="mt-2.5 text-[10px] tracking-[0.06em] text-[#A9AAA6]">添加回忆</span>
                    </div>
                  </>
                )}
          </aside>
        </div>
      )}

      {/* ======================================================== */}
      {/* 5. MODALS & FLOATING DIALOG OVERLAYS */}
      {/* ======================================================== */}
      <AnimatePresence>
        
        {/* Memory Journal/Notebook Detailed Reader Panel */}
        {selectedMemory && viewMode !== 'places' && (
          <MemoryDetailPanel
            memory={selectedMemory}
            onClose={() => setSelectedMemory(null)}
            onUpdateMemory={handleUpdateMemory}
          />
        )}

        {/* Pin New Memory Form Interface */}
        {showAddMemory && (
          <AddMemoryDialog
            onClose={() => setShowAddMemory(false)}
            onAddMemory={handleAddMemory}
          />
        )}

        {/* Corkboard Monologues (Help Guide Info Modal) */}
        {showGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs">
            <div className="absolute inset-0" onClick={() => setShowGuide(false)}></div>
            <motion.div 
              initial={{ scale: 0.93, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.93, opacity: 0 }}
              className="bg-[#faf6ed] border border-amber-900/30 w-full max-w-lg rounded-2xl p-6 relative gap-4 paper-grain select-none z-10 text-stone-800"
            >
              <button
                onClick={() => setShowGuide(false)}
                className="absolute top-4 right-4 p-1.5 text-stone-405 hover:text-stone-700 bg-stone-200/50 hover:bg-stone-200 rounded-full transition-all"
              >
                <X className="h-4.5 w-4.5" />
              </button>

              <h4 className="text-base font-bold font-display text-amber-950 uppercase border-b border-stone-250 pb-2.5 mb-3.5">
                ✦ 旅行规划板上的写照告白
              </h4>

              <div className="space-y-3.5 text-xs text-stone-600 font-sans leading-relaxed">
                <p>
                  你仿佛坐在深夜静谧的露营帐篷中，面前挂着一块沉淀大半个人生的软木照片板。
                </p>
                <div className="bg-amber-100/30 p-3 rounded-lg border border-amber-200/50 font-hand text-base text-stone-700 space-y-2 leading-relaxed">
                  <p>「 整个板面划分成了你心照不宣的四个区域：」</p>
                  <ul className="list-disc pl-5 font-bold space-y-1">
                    <li>左上角：旅途足迹 (山水漫步/远方探索...)</li>
                    <li>右上角：自我成长 (心路蜕变/学识沉淀...)</li>
                    <li>左下角：日常烟火 (生活琐碎/喜好热爱/日常美食...)</li>
                    <li>右下角：美好瞬间 (温情合照/光影瞬间...)</li>
                  </ul>
                </div>
                <p>
                  中央贴有一张自制的 **勘界旧图 (Adventure Map)**。当鼠标在任何一张回忆照片卡上 hover 停留时，白板上就会拉出一条红色的 **刑侦纱线 (wool yarn)**，连接它的物理位置和探险地图上的指引。
                </p>
                <p>
                  点击下方胶盘，可以翻开 **2024、2025、2026** 不同年份不同的底片页。你还能在角落里点开 **时光慢递信匣 (✉️)**，写封在特定开启年份才能解除熔融火漆印章、打开阅读的未来封密信。
                </p>
                <p className="font-semibold text-amber-900">
                  深夜有些许凉意，借着暖暖的灯光，重新审阅那些岁月的驻足，以及当时和现在那个已经变得更丰盈坚强的自己吧。
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-stone-250 text-right">
                <button
                  onClick={() => setShowGuide(false)}
                  className="bg-amber-950 hover:bg-stone-900 text-stone-100 font-display text-xs font-semibold px-4 py-2 rounded-lg cursor-pointer"
                >
                  坐回营灯前
                </button>
              </div>
            </motion.div>
          </div>
        )}

      </AnimatePresence>
    </div>
  );
}
