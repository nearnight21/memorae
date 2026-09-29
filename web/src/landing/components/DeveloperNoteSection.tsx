import type { FC } from 'react';
import { ArrowUpRight, Github } from 'lucide-react';

export const DeveloperNoteSection: FC = () => (
  <section className="landing-section developer-section" id="developer">
    <div className="developer-note">
      <span className="section-kicker">开发者的话</span>
      <div className="developer-copy">
        <h2>我想做一个，愿意把记忆还给你的地方。</h2>
        <p>
          我不想再做一个要求你持续分享、比较和更新的社交产品。所忆只关心一件事：让你在多年以后，
          仍然能够找到当时走过的路、写下的话，以及那个值得被保存的瞬间。
        </p>
        <p>
          这是一个独立开发中的产品。它会慢一点，但每一项能力都应该先回答一个问题：这是否真的让记忆更属于你？
        </p>
      </div>
      <a className="text-link" href="https://github.com/nearnight21/memorae" target="_blank" rel="noreferrer">
        <Github size={16} />
        <span>查看项目源码</span>
        <ArrowUpRight size={15} />
      </a>
    </div>
  </section>
);

export default DeveloperNoteSection;
