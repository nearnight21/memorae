import { useState, type FC } from 'react';
import { Monitor, Smartphone, Layers, ShieldCheck, MapPin } from 'lucide-react';
import PhoneViewport from './PhoneViewport';
import DesktopWindowMockup from './DesktopWindowMockup';

type ViewMode = 'web' | 'mobile' | 'both';

export const PhoneDemoSection: FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('both');

  return (
    <section className="phone-demo-section" id="showcase">
      <span className="section-eyebrow">双端同源 · Web & Mobile</span>
      <h2 className="section-headline">在大屏上漫游画卷，在掌心里定格岁月。</h2>
      <p className="section-description">
        Memorae 不只是手机应用。在电脑浏览器中，你拥有全景宽幅的时光足迹台与实体手账；在旅途中，移动端即开即记、端到端离线加密，双端无缝同步。
      </p>

      {/* 平台视图切换器 */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(14, 22, 34, 0.8)',
          border: '1px solid var(--theme-crystal-border)',
          borderRadius: '9999px',
          padding: '4px 6px',
          marginBottom: '48px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
        }}
      >
        <button
          type="button"
          onClick={() => setViewMode('both')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 18px',
            borderRadius: '9999px',
            border: 'none',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            background: viewMode === 'both' ? 'var(--theme-paper-bg)' : 'transparent',
            color: viewMode === 'both' ? 'var(--theme-journal-ink)' : 'var(--text-secondary)',
            boxShadow: viewMode === 'both' ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
          }}
        >
          <Layers size={14} style={{ color: viewMode === 'both' ? 'var(--theme-journal-earth)' : 'inherit' }} />
          <span>双端协同</span>
        </button>

        <button
          type="button"
          onClick={() => setViewMode('web')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 18px',
            borderRadius: '9999px',
            border: 'none',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            background: viewMode === 'web' ? 'var(--theme-paper-bg)' : 'transparent',
            color: viewMode === 'web' ? 'var(--theme-journal-ink)' : 'var(--text-secondary)',
            boxShadow: viewMode === 'web' ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
          }}
        >
          <Monitor size={14} style={{ color: viewMode === 'web' ? 'var(--theme-crystal)' : 'inherit' }} />
          <span>Web 网站端 · 大画幅全景</span>
        </button>

        <button
          type="button"
          onClick={() => setViewMode('mobile')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 18px',
            borderRadius: '9999px',
            border: 'none',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            background: viewMode === 'mobile' ? 'var(--theme-paper-bg)' : 'transparent',
            color: viewMode === 'mobile' ? 'var(--theme-journal-ink)' : 'var(--text-secondary)',
            boxShadow: viewMode === 'mobile' ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
          }}
        >
          <Smartphone size={14} style={{ color: viewMode === 'mobile' ? 'var(--theme-journal-brass)' : 'inherit' }} />
          <span>Mobile 随行端 · 原生轻盈</span>
        </button>
      </div>

      {/* 展台展示内容 */}
      <div style={{ width: '100%', position: 'relative' }}>
        {viewMode === 'both' && (
          <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
            {/* 主背景：Web 桌面端宽幅大画幅 */}
            <div style={{ width: '100%', maxWidth: '1020px' }}>
              <DesktopWindowMockup title="Memorae Web 空间 · 桌面大画幅时空足迹台" />
            </div>

            {/* 前景悬浮：移动端随行真机 */}
            <div
              style={{
                position: 'absolute',
                right: '4%',
                bottom: '-40px',
                zIndex: 25,
                transform: 'scale(0.85)',
                transformOrigin: 'bottom right',
                filter: 'drop-shadow(0 25px 40px rgba(0,0,0,0.85))',
              }}
              className="showcase-mobile-overlay"
            >
              <PhoneViewport
                placeholderTitle="Android 原生随行版"
                placeholderSubtitle="出境即密文 · 离线全量漫游"
              />
            </div>
          </div>
        )}

        {viewMode === 'web' && (
          <div style={{ width: '100%', maxWidth: '1080px', margin: '0 auto' }}>
            <DesktopWindowMockup title="Memorae Web 空间 · 纯离线浏览器端大画幅足迹" />
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '24px',
                marginTop: '24px',
                color: 'var(--text-secondary)',
                fontSize: '13px',
                flexWrap: 'wrap',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <ShieldCheck size={15} style={{ color: 'var(--theme-crystal-bright)' }} />
                免安装浏览器纯离线解锁
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <MapPin size={15} style={{ color: 'var(--theme-journal-brass)' }} />
                大画幅高德地图与时光连线
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Monitor size={15} style={{ color: 'var(--theme-crystal)' }} />
                双页实体旅行手账大画幅阅读
              </span>
            </div>
          </div>
        )}

        {viewMode === 'mobile' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <PhoneViewport
              placeholderTitle="真机 10s 操作录屏 (MP4/WebM)"
              placeholderSubtitle="放入 demo-loop.mp4 即自动播放地图浏览与点位展开"
            />
            <p style={{ marginTop: '24px', color: 'var(--text-secondary)', fontSize: '14px' }}>
              支持离线定位与三档照片加密 · 随时随地记录旅程细节
            </p>
          </div>
        )}
      </div>
    </section>
  );
};

export default PhoneDemoSection;
