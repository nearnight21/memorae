import { useState, useEffect, useRef, type FC } from 'react';
import PhoneViewport from './PhoneViewport';

const STORY_STEPS = [
  {
    numeral: '01 / LOCATION',
    title: '立于大地，精细反查。',
    body: '告别泛泛的照片地名。通过高德与中立地理接口，精准解析省市区县与街道门牌，即使多年后再回望，也能分秒找回当初伫立的那个街角。',
    screenTitle: '01 真实地点定位截图',
    screenDesc: '放入 screen-place.webp 自动替换',
  },
  {
    numeral: '02 / TIMELINE',
    title: '横跨岁月，时光成卷。',
    body: '从 2007 年的初次启程，到 2026 年的未知远方。横向滑动年份标尺，散落于各省市的记忆气泡如星火般随岁月流动点亮。',
    screenTitle: '02 连续时间轴截图',
    screenDesc: '放入 screen-time.webp 自动替换',
  },
  {
    numeral: '03 / EMULSION',
    title: '保留胶片质感，三档私密分级。',
    body: '高精度生成微型缩略图（用于秒开足迹）、高清预览图（用于大屏品读）与加密原始大图。出境前分档加密打包，既省流量，又守原图品质。',
    screenTitle: '03 照片详情与相纸截图',
    screenDesc: '放入 screen-photo.webp 自动替换',
  },
  {
    numeral: '04 / VAULT',
    title: '离开设备即密文，坚如磐石。',
    body: '主钥匙（VMK）仅由您的私密空间密码在设备本地解开，内存清零即锁死。云端只负责中转毫无意义的加密字符，数据主权彻底归您所有。',
    screenTitle: '04 本地保险箱与加密截图',
    screenDesc: '放入 screen-vault.webp 自动替换',
  },
];

export const StickyStorySection: FC = () => {
  const [activeStep, setActiveStep] = useState(0);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = Number(entry.target.getAttribute('data-step-index'));
            if (!Number.isNaN(index)) {
              setActiveStep(index);
            }
          }
        });
      },
      {
        threshold: 0.5,
      },
    );

    stepRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const current = STORY_STEPS[activeStep] || STORY_STEPS[0];

  return (
    <section className="sticky-story-section" id="features">
      <div className="sticky-story-grid">
        {/* 左侧可滚动内容列 */}
        <div className="story-scroll-col">
          {STORY_STEPS.map((step, idx) => (
            <div
              key={step.numeral}
              ref={(el) => {
                stepRefs.current[idx] = el;
              }}
              data-step-index={idx}
              className="story-card-step"
              style={{ opacity: activeStep === idx ? 1 : 0.35 }}
            >
              <span className="step-numeral">{step.numeral}</span>
              <h3 className="step-heading">{step.title}</h3>
              <p className="step-body">{step.body}</p>
            </div>
          ))}
        </div>

        {/* 右侧 Sticky 保持在视口的手机模型 */}
        <div className="story-sticky-col">
          <PhoneViewport
            placeholderTitle={current.screenTitle}
            placeholderSubtitle={current.screenDesc}
          />
        </div>
      </div>
    </section>
  );
};

export default StickyStorySection;
