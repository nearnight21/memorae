import { topicBadgeInitial, topicBadgeTone } from '../memory/topic';

interface TopicBadgeProps {
  name: string;
  /** 有封面照片时优先显示照片，否则回退到首字徽标。 */
  cover?: string | null;
  /** 稳定色调的种子，默认使用名称；传入主题 id 可避免改名换色。 */
  seed?: string;
}

/** 主题的默认视觉标识：封面优先，无封面时用名称首字加稳定底色。 */
export default function TopicBadge({ name, cover, seed }: TopicBadgeProps) {
  if (cover) {
    return <img className="topic-badge-cover" src={cover} alt="" referrerPolicy="no-referrer" />;
  }
  return (
    <span
      className="topic-badge"
      data-tone={topicBadgeTone(seed ?? name)}
      aria-hidden="true"
    >
      {topicBadgeInitial(name)}
    </span>
  );
}
