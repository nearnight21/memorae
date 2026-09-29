import type { FC } from 'react';
import LandingNavbar from './components/LandingNavbar';
import HeroSection from './components/HeroSection';
import WhatSection from './components/WhatSection';
import SecuritySection from './components/SecuritySection';
import DeveloperNoteSection from './components/DeveloperNoteSection';
import DownloadFooter from './components/DownloadFooter';
import { navigateToApp } from './landingRouting';
import './landing.css';

export interface LandingPageProps {
  onEnterApp?: () => void;
}

export const LandingPage: FC<LandingPageProps> = ({ onEnterApp = navigateToApp }) => {
  return (
    <div className="landing-shell">
      <LandingNavbar onEnterApp={onEnterApp} />
      <main>
        <HeroSection onEnterApp={onEnterApp} />
        <WhatSection />
        <SecuritySection />
        <DeveloperNoteSection />
        <DownloadFooter onEnterApp={onEnterApp} />
      </main>
    </div>
  );
};

export default LandingPage;
