import type { FC } from 'react';
import { ArrowUpRight, Github } from 'lucide-react';

export const DeveloperNoteSection: FC = () => (
  <section className="landing-section developer-section" id="developer">
    <div className="developer-note">
      <svg className="developer-wax-seal" viewBox="0 0 72 72" fill="none" aria-hidden="true">
        <path d="M36 3L46 7L57 9L62 20L68 30L65 42L62 54L51 60L41 68L29 65L17 62L11 51L4 41L7 29L10 17L21 11Z" fill="currentColor" stroke="#c2b095" />
        <circle cx="36" cy="36" r="24" stroke="#c2b095" /><circle cx="36" cy="36" r="21" stroke="#fff9eb" />
        <path d="M23 29C30 22 39 22 49 27M22 35C30 28 40 28 50 33M23 41C31 34 41 34 49 39M26 47C33 41 41 41 46 44" stroke="#ad9879" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      <span className="section-kicker">开发者的话</span>
      <div className="developer-copy">
        <h2 className="developer-quote">“我想做一个，愿意把记忆还给你的地方。”</h2>
        <p>
          我不想再做一个要求你持续分享、比较和更新的社交产品。所忆只关心一件事：让你在多年以后，
          仍然能够找到当时走过的路、写下的话，以及那个值得被保存的瞬间。
        </p>
        <p>
          这是一个独立开发中的产品。它会慢一点，但每一项能力都应该先回答一个问题：这是否真的让记忆更属于你？
        </p>
      </div>
      <div className="developer-signoff">
        <span>—— 所忆开发者 敬上</span>
        <a className="text-link" href="https://github.com/nearnight21/memorae" target="_blank" rel="noreferrer">
          <Github size={16} />
          <span>查看项目源码</span>
          <ArrowUpRight size={15} />
        </a>
      </div>
    </div>
  </section>
);

export default DeveloperNoteSection;
