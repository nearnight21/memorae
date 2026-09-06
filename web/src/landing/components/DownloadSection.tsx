import type { FC } from 'react';
import { Download, Globe, ArrowRight, Shield } from 'lucide-react';

export interface DownloadSectionProps {
  onEnterApp: () => void;
}

export const DownloadSection: FC<DownloadSectionProps> = ({ onEnterApp }) => {
  return (
    <section className="landing-section" id="download">
      <div className="download-card-banner">
        <div className="download-banner-bg" />

        <div className="download-text-area">
          <h3>
            给未来的自己，
            <br />
            留一座随时可重温的时光庭院。
          </h3>
          <p>
            Memorae 现已支持 Android 原生端与现代 Web 浏览器。
            随时随地记下路过的风景与心情，在大屏上回味人生的高光与静谧。
          </p>

          <div className="download-button-row">
            <a
              href="https://github.com/nearnight21/memorae/releases"
              target="_blank"
              rel="noreferrer"
              className="btn-download-apk"
            >
              <Download size={16} />
              <span>下载 Android 原生 APK</span>
            </a>

            <button type="button" onClick={onEnterApp} className="btn-download-web">
              <Globe size={16} />
              <span>在 Web 端开启所忆</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>

        <div
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            padding: '24px',
            backdropFilter: 'blur(10px)',
            maxWidth: '320px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10B981', fontSize: '12px', fontWeight: 600 }}>
            <Shield size={14} />
            <span>独立签名与完整性保护</span>
          </div>
          <p style={{ margin: 0, fontSize: '12px', color: '#A39D94', lineHeight: 1.5 }}>
            Android 端采用正式独立签名与安全密钥库封存，支持离线足迹回放与自动端到端密文同步。
          </p>
          <span style={{ fontSize: '11px', color: '#79716B', fontFamily: 'monospace' }}>
            Package: com.memorae.cn
          </span>
        </div>
      </div>
    </section>
  );
};

export default DownloadSection;
