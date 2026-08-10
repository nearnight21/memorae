import React, { useState, useEffect } from 'react';
import { Flame, Volume2, VolumeX, Info, Moon, Minimize2 } from 'lucide-react';
import { appAmbientSynth } from '../lib/audioSynth';

export default function CampfireSynthPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.35);
  const [showTooltip, setShowTooltip] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);

  // Sync volume changes
  useEffect(() => {
    appAmbientSynth.setVolume(volume);
  }, [volume]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      appAmbientSynth.stop();
    };
  }, []);

  const handleToggle = async () => {
    if (isPlaying) {
      appAmbientSynth.stop();
      setIsPlaying(false);
    } else {
      try {
        await appAmbientSynth.start();
        appAmbientSynth.setVolume(volume);
        setIsPlaying(true);
      } catch (err) {
        console.error('Failed to start Web Audio Synth:', err);
      }
    }
  };

  if (isCollapsed) {
    return (
      <button 
        id="btn-expand-campfire"
        onClick={() => setIsCollapsed(false)}
        className="bg-stone-900/90 hover:bg-stone-800/90 backdrop-blur-md border border-amber-950/40 hover:border-amber-500/40 rounded-full p-2.5 shadow-xl text-stone-200 flex items-center justify-center gap-1.5 transition-all duration-300 relative group cursor-pointer"
        title="展开营火音效"
      >
        <Flame className={`h-4.5 w-4.5 text-amber-500 ${isPlaying ? 'animate-pulse text-amber-400' : 'text-stone-400'}`} />
        {isPlaying && (
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full animate-ping" />
        )}
        <span className="text-[10px] font-mono font-medium max-w-0 overflow-hidden group-hover:max-w-[80px] transition-all duration-300 whitespace-nowrap text-amber-500/90">
          展开营火
        </span>
      </button>
    );
  }

  return (
    <div 
      id="campfire-synth-panel"
      className="bg-stone-900/90 backdrop-blur-md border border-amber-950/40 rounded-xl p-3.5 shadow-xl text-stone-200 w-72 flex flex-col gap-3 transition-all duration-300 hover:border-amber-900/50"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg transition-colors ${isPlaying ? 'bg-amber-900/35 text-amber-400' : 'bg-stone-800 text-stone-500'}`}>
            <Flame className={`h-4.5 w-4.5 ${isPlaying ? 'animate-pulse' : ''}`} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h4 className="text-xs font-semibold font-display tracking-wide uppercase text-amber-500/90">夜幕营火音效</h4>
              <button 
                onClick={() => setIsCollapsed(true)} 
                className="text-stone-500 hover:text-stone-300 transition-colors p-0.5 rounded cursor-pointer"
                title="隐藏面板"
              >
                <Minimize2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-[10px] text-stone-400 font-mono">100% 浏览器合成音频</p>
          </div>
        </div>
        
        {/* Play/Pause Button */}
        <button
          id="btn-toggle-campfire"
          onClick={handleToggle}
          className={`px-3 py-1 rounded text-xs px-2.5 font-display tracking-wide transition-all font-medium flex items-center gap-1.5 cursor-pointer ${
            isPlaying 
              ? 'bg-amber-700/80 hover:bg-amber-600 text-white shadow-lg shadow-amber-900/30' 
              : 'bg-stone-800 hover:bg-stone-700 text-stone-300'
          }`}
        >
          {isPlaying ? (
            <>
              <Volume2 className="h-3.5 w-3.5 animate-bounce" />
              <span>静音营火</span>
            </>
          ) : (
            <>
              <VolumeX className="h-3.5 w-3.5" />
              <span>点燃营火</span>
            </>
          )}
        </button>
      </div>

      {/* Volume Slider & Wave Indicators when active */}
      <div className="flex items-center gap-3 bg-stone-950/40 p-2 rounded-lg border border-stone-800/30">
        <span className="text-[10px] text-stone-400 font-mono">音量</span>
        <input
          id="campfire-volume-slider"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="flex-1 h-1 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-amber-600"
        />
        
        {/* Wave Bar Animation */}
        <div className="flex items-end gap-0.5 h-3.5 w-6">
          {isPlaying ? (
            <>
              <span className="w-[2px] bg-amber-500 rounded-full sound-wave-bar h-1.5"></span>
              <span className="w-[2px] bg-amber-500 rounded-full sound-wave-bar h-3"></span>
              <span className="w-[2px] bg-amber-500 rounded-full sound-wave-bar h-2"></span>
              <span className="w-[2px] bg-amber-500 rounded-full sound-wave-bar h-1"></span>
            </>
          ) : (
            <>
              <span className="w-[2px] bg-stone-700 rounded-full h-[3px]"></span>
              <span className="w-[2px] bg-stone-700 rounded-full h-[3px]"></span>
              <span className="w-[2px] bg-stone-700 rounded-full h-[3px]"></span>
              <span className="w-[2px] bg-stone-700 rounded-full h-[3px]"></span>
            </>
          )}
        </div>
      </div>

      {/* Info footer */}
      <div className="flex items-center justify-between text-[10px] text-stone-500">
        <span className="flex items-center gap-1 font-mono text-[9px]">
          <Moon className="h-3 w-3 text-indigo-400" />
          <span>篝火、林风、夏虫</span>
        </span>
        <div className="relative">
          <button 
            onClick={() => setShowTooltip(!showTooltip)}
            className="hover:text-stone-300 transition-colors cursor-pointer"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
          
          {showTooltip && (
            <div className="absolute right-0 bottom-5 w-56 p-2 bg-stone-950 border border-stone-800 rounded text-[9px] text-stone-400 z-50 shadow-2xl leading-relaxed">
              这里使用的是 **Web Audio API** 实时合成音频，没有消耗网络加载音频素材。随机算法合成每一次火花爆裂 (Crackles) 和海边林风，为您营造最真实的星夜帐篷体验。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
