import type { FC } from 'react';

export const LandingFooter: FC = () => {
  return (
    <footer className="landing-footer">
      <div className="footer-inner">
        <div className="footer-copy">
          <span>© 2026 所忆 (Memorae) · 端到端加密的时空足迹画卷</span>
        </div>

        <div className="footer-links">
          <a
            href="https://github.com/nearnight21/memorae"
            target="_blank"
            rel="noreferrer"
            className="footer-link-item"
          >
            GitHub
          </a>
          <a
            href="https://github.com/nearnight21/memorae/releases"
            target="_blank"
            rel="noreferrer"
            className="footer-link-item"
          >
            Release 动态
          </a>
          <a href="#top" className="footer-link-item">
            回到顶部 ↑
          </a>
        </div>
      </div>
    </footer>
  );
};

export default LandingFooter;
