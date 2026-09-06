import { useEffect, useState, type FC } from 'react';
import { ArrowRight, Sparkles, Compass } from 'lucide-react';
import { getStoredAccountSession } from '../../prototype/storage';
import { isAccountSessionActive } from '../../sync/accountSession';

export interface LandingNavbarProps {
  onEnterApp: () => void;
}

export const LandingNavbar: FC<LandingNavbarProps> = ({ onEnterApp }) => {
  const [hasActiveSession, setHasActiveSession] = useState(false);

  useEffect(() => {
    let active = true;
    getStoredAccountSession()
      .then((session) => {
        if (active) {
          setHasActiveSession(isAccountSessionActive(session));
        }
      })
      .catch(() => {
        if (active) {
          setHasActiveSession(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <header className="landing-navbar-wrapper">
      <nav className="landing-navbar">
        {/* 左侧 Logo */}
        <a href="#top" className="navbar-brand-group">
          <div className="brand-glyph">所</div>
          <span className="brand-logotype">所忆 · Memorae</span>
        </a>

        {/* 中间导航链接 */}
        <div className="navbar-center-links">
          <a href="#mobile-showcase" className="nav-link-anchor">
            随行真机
          </a>
          <a href="#features" className="nav-link-anchor">
            核心特性
          </a>
          <a href="#timeline" className="nav-link-anchor">
            时光轴
          </a>
          <a href="#download" className="nav-link-anchor">
            客户端
          </a>
        </div>

        {/* 右侧进入应用按钮 */}
        <div>
          <button
            type="button"
            onClick={onEnterApp}
            className={`navbar-action-btn ${hasActiveSession ? 'is-active-session' : ''}`}
          >
            {hasActiveSession ? (
              <>
                <Sparkles size={13} />
                <span>返回空间</span>
                <ArrowRight size={13} />
              </>
            ) : (
              <>
                <span>进入所忆</span>
                <ArrowRight size={13} />
              </>
            )}
          </button>
        </div>
      </nav>
    </header>
  );
};

export default LandingNavbar;
