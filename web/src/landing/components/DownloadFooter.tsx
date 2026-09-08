import type { FC } from 'react';
import { Download, Globe, ArrowRight, ShieldCheck } from 'lucide-react';

export interface DownloadFooterProps {
  onEnterApp: () => void;
}

export const DownloadFooter: FC<DownloadFooterProps> = ({ onEnterApp }) => {
  return (
    <section className="download-footer-section" id="download">
      {/* 极简深邃微光大横幅 */}
      <div className="download-cta-card">
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--theme-crystal-bright)',
            fontSize: '12px',
            fontWeight: 600,
            marginBottom: '16px',
          }}
        >
          <ShieldCheck size={14} />
          <span>独立签名认证 · 本地优先架构 · 零知识同步</span>
        </div>

        <h3>给未来的自己，留一座随时可重温的时光庭院。</h3>
        <p>
          Memorae 支持现代 Web 浏览器与 Android 原生随行版。
          在宽屏电脑上沉浸回溯一生的足迹与双页手账，在手机端随时定格旅途中的风景与心境。
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <button type="button" onClick={onEnterApp} className="btn-hero-primary">
            <Globe size={16} />
            <span>进入 Web 空间 (免安装体验)</span>
            <ArrowRight size={14} />
          </button>

          <a
            href="https://github.com/nearnight21/memorae/releases"
            target="_blank"
            rel="noreferrer"
            className="btn-hero-secondary"
          >
            <Download size={16} />
            <span>下载 Android 原生 APK</span>
          </a>
        </div>
      </div>

      {/* 纯净页脚 */}
      <footer className="landing-site-footer">
        <div>
          <span>© 2026 所忆 (Memorae) · 让每一步足迹都有迹可循</span>
        </div>

        <div className="footer-nav-links">
          <a
            href="https://github.com/nearnight21/memorae"
            target="_blank"
            rel="noreferrer"
          >
            GitHub 开源仓库
          </a>
          <a
            href="https://github.com/nearnight21/memorae/releases"
            target="_blank"
            rel="noreferrer"
          >
            Release 动态
          </a>
          <a href="#top">回到顶部 ↑</a>
        </div>
      </footer>
    </section>
  );
};

export default DownloadFooter;
