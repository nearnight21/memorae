import { useState, useMemo, type FC } from 'react';
import { Calendar, MapPin, Sparkles, Shield, Compass, BookOpen, Layers } from 'lucide-react';
import CrystalTimeline from '../../components/CrystalTimeline';
import type { Memory, MemoryFilters } from '../../types';
import travelPhoto from '../../assets/login/travel-photo.png';

interface MilestoneFeature {
  id: string;
  year: number;
  date: string;
  city: string;
  title: string;
  featureBadge: string;
  featureIcon: typeof Compass;
  featureTitle: string;
  featureDesc: string;
  story: string;
  tag: string;
}

const MILESTONES: MilestoneFeature[] = [
  {
    id: 'm-2007',
    year: 2007,
    date: '2007-10-01',
    city: '北京 · 什刹海',
    title: '胡同口的老槐树与单车',
    featureBadge: '01 / FOOTPRINT MAP',
    featureIcon: Compass,
    featureTitle: '立于大地，精细经纬反查',
    featureDesc: '告别泛泛的照片地名。通过高德与中立地理接口，精准解析省市区县与街道门牌，即使多年后再回望，也能分秒找回当初伫立的那个街角。',
    story: '那年秋天风吹过什刹海的水面，银锭桥边的冰糖葫芦冒着热气。',
    tag: '时空足迹地图',
  },
  {
    id: 'm-2012',
    year: 2012,
    date: '2012-05-15',
    city: '拉萨 · 八廓街',
    title: '大昭寺金顶的日暮日光',
    featureBadge: '02 / PHYSICAL JOURNAL',
    featureIcon: BookOpen,
    featureTitle: '实体手账，留存旧日心境',
    featureDesc: '独创双页拟物旅行手账装帧与羊皮纸质感。左侧安放旅程胶片，右侧以“当时的我”与“现在的我”双时态书写，让回忆拥有纸质装帧的沉静温度。',
    story: '空气稀薄而通透，酥油茶的香气在转经道上久久不散。',
    tag: '实体旅行手账',
  },
  {
    id: 'm-2018',
    year: 2018,
    date: '2018-07-21',
    city: '京都 · 鸭川河畔',
    title: '初夏傍晚的微风与蝉鸣',
    featureBadge: '03 / ZERO-KNOWLEDGE VAULT',
    featureIcon: Shield,
    featureTitle: '离线密文，主权彻底归你',
    featureDesc: '主钥匙（VMK）仅由您的私密空间密码在设备本地解开，内存清零即锁死。出境即不可逆密文，云端服务器无法窥探任何一张照片或一行文字。',
    story: '坐在河畔石阶上看着远处群山隐没在蓝紫色的暮色中。',
    tag: '端到端离线加密',
  },
  {
    id: 'm-2022',
    year: 2022,
    date: '2022-10-04',
    city: '喀纳斯 · 月亮湾',
    title: '深秋松针上的初雪',
    featureBadge: '04 / EMULSION TIERS',
    featureIcon: Sparkles,
    featureTitle: '三档分级，守住胶片质感',
    featureDesc: '高精度分档加密：微型缩略图保障足迹秒级响应，高清预览图用于大画幅品读，原始大图完好封存。既省流量，又守住最真实的光学色彩。',
    story: '松石绿色的水蜿蜒在晨雾里，木栈道上落满了金黄的落叶。',
    tag: '胶片级分档画廊',
  },
  {
    id: 'm-2026',
    year: 2026,
    date: '2026-05-18',
    city: '上海 · 武康庭',
    title: '阳光穿过法桐叶的微光',
    featureBadge: '05 / DUAL PLATFORMS',
    featureIcon: Layers,
    featureTitle: 'Web & Mobile，跨屏随行漫游',
    featureDesc: '在电脑浏览器中，拥有宽幅沉浸的大地图与手账阅读台；在手机端，即开即记、随行打卡。端到端静默同步，生命轨迹长卷永恒回响。',
    story: '重新整理过去所有的旅程与笔记，将每一处时光装进所忆。',
    tag: 'Web & Mobile 协同',
  },
];

const MOCK_MEMORIES: Memory[] = MILESTONES.map((m, idx) => ({
  id: m.id,
  title: m.title,
  date: m.date,
  year: m.year,
  category: 'travel',
  tag: m.tag,
  image: travelPhoto,
  gallery: [],
  pastSelf: m.story,
  presentSelf: m.featureDesc,
  pinnedBy: 'pin',
  px: 20 + idx * 18,
  py: 30 + (idx % 2) * 20,
  rotation: (idx % 3) - 1,
  city: m.city.split(' · ')[0],
  location: {
    name: m.city,
    mx: 30 + idx * 14,
    my: 40 + (idx % 2) * 15,
  },
}));

export const TimelinePlayground: FC = () => {
  const [filters, setFilters] = useState<MemoryFilters>({
    dateRange: { start: '2007-01-01', end: '2018-07-21' },
    regions: [],
    themes: [],
  });

  // 根据当前过滤器截止时间匹配最接近的时代里程碑
  const activeMilestone = useMemo(() => {
    const endStr = filters.dateRange?.end;
    if (!endStr) {
      return MILESTONES[MILESTONES.length - 1];
    }
    const endYear = parseInt(endStr.slice(0, 4), 10);
    let best = MILESTONES[0];
    let minDiff = Infinity;
    for (const m of MILESTONES) {
      const diff = Math.abs(m.year - endYear);
      if (diff < minDiff) {
        minDiff = diff;
        best = m;
      }
    }
    return best;
  }, [filters.dateRange?.end]);

  const handleSelectMilestone = (m: MilestoneFeature) => {
    setFilters({
      ...filters,
      dateRange: {
        start: '2007-01-01',
        end: m.date,
      },
    });
  };

  const FeatureIcon = activeMilestone.featureIcon;

  return (
    <section className="timeline-interactive-section" id="timeline">
      <span className="section-eyebrow">水晶时间轴 · Ocean Crystal Timeline</span>
      <h2 className="section-headline">滑动岁月，唤醒封存的时光。</h2>
      <p className="section-description">
        这是来自 Memorae 核心功能的原生水晶时间轴。按住晶莹剔透的水晶旋钮左右滑动，沉睡在各处坐标与岁月中的功能与故事即刻随指尖浮现。
      </p>

      <div className="timeline-stage-box">
        {/* 上方：年份快捷节点按钮排 */}
        <div className="timeline-year-buttons-row">
          {MILESTONES.map((item) => {
            const isSelected = activeMilestone.year === item.year;
            return (
              <button
                key={item.year}
                type="button"
                onClick={() => handleSelectMilestone(item)}
                className={`year-node-btn ${isSelected ? 'is-active-year' : ''}`}
              >
                <Calendar size={12} style={{ opacity: isSelected ? 1 : 0.6 }} />
                <span>{item.year}</span>
                <span style={{ fontSize: '11px', opacity: 0.75 }}>{item.city.split(' · ')[0]}</span>
              </button>
            );
          })}
        </div>

        {/* 中间联动展示：左侧手账暖色相纸 + 右侧核心功能与故事 */}
        <div className="timeline-active-display">
          {/* 左侧：手账羊皮纸质感拍立得卡片 */}
          <div className="timeline-photo-card">
            <div className="timeline-photo-frame">
              <img src={travelPhoto} alt={activeMilestone.title} />
              <span className="photo-time-badge">{activeMilestone.date}</span>
            </div>
            <div className="card-polaroid-meta">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <h6 style={{ fontSize: '13px', margin: 0 }}>{activeMilestone.title}</h6>
                <span className="polaroid-tag">{activeMilestone.tag}</span>
              </div>
              <p style={{ margin: 0, fontSize: '11px', display: 'flex', alignItems: 'center', gap: 4 }}>
                <MapPin size={11} style={{ color: 'var(--theme-journal-earth)' }} />
                <span>{activeMilestone.city}</span>
              </p>
            </div>
          </div>

          {/* 右侧：产品功能深度解读与岁月回声 */}
          <div className="timeline-feature-card">
            <div className="timeline-feature-pill">
              <FeatureIcon size={13} />
              <span>{activeMilestone.featureBadge}</span>
            </div>

            <h3 className="timeline-feature-heading">{activeMilestone.featureTitle}</h3>

            <p className="timeline-feature-desc">{activeMilestone.featureDesc}</p>

            <blockquote className="timeline-memory-snippet">
              <strong>当时心境：</strong>“{activeMilestone.story}”
            </blockquote>
          </div>
        </div>

        {/* 最下方：和 Web 一样横卧在底部的原生水晶时间轴 */}
        <div className="landing-crystal-timeline-box">
          <CrystalTimeline
            memories={MOCK_MEMORIES}
            filters={filters}
            onFiltersChange={setFilters}
            collapsible={false}
          />
        </div>
      </div>
    </section>
  );
};

export default TimelinePlayground;
