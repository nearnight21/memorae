import type { FC } from 'react';
import { ArrowRight, Download, Globe } from 'lucide-react';

export interface DownloadFooterProps {
  onEnterApp: () => void;
}

export const DownloadFooter: FC<DownloadFooterProps> = ({ onEnterApp }) => (
  <section className="download-footer-section" id="download">
    <div className="download-cta-card">
      <span className="section-kicker">现在开始</span>
      <h3>给未来的自己，<br />留一张可以回去的地图。</h3>
      <p>先用 Web 打开所忆，也可以下载 Android 版本，随时记录下一段值得保存的经历。</p>
      <div className="cta-actions">
        <button type="button" onClick={onEnterApp} className="btn-hero-primary">
          <Globe size={16} />
          <span>打开 Web 空间</span>
          <ArrowRight size={14} />
        </button>
        <a
          href="https://github.com/nearnight21/memorae/releases"
          target="_blank"
          rel="noreferrer"
          className="btn-hero-secondary"
        >
          <Download size={16} />
          <span>下载 Android</span>
        </a>
      </div>
    </div>

    <footer className="landing-site-footer">
      <span>© 2026 所忆 (Memorae)</span>
      <div className="footer-nav-links">
        <a href="https://github.com/nearnight21/memorae" target="_blank" rel="noreferrer">GitHub</a>
        <a href="https://github.com/nearnight21/memorae/releases" target="_blank" rel="noreferrer">Release</a>
        <a href="#top">回到顶部 ↑</a>
      </div>
    </footer>
  </section>
);

export default DownloadFooter;
