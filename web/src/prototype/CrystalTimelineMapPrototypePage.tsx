import MapView from '../components/MapView';
import type { Memory } from '../types';

const TIMELINE_PREVIEW_MEMORIES: Memory[] = [
  {
    id: 'timeline-preview-2007',
    title: '2007',
    date: '2007-01-01',
    year: 2007,
    category: 'growth',
    tag: '',
    image: '',
    gallery: [],
    pastSelf: '',
    presentSelf: '',
    pinnedBy: 'pin',
    px: 0,
    py: 0,
    rotation: 0,
    country: '中国',
    city: '上海',
    lat: 31.2304,
    lng: 121.4737,
  },
  {
    id: 'timeline-preview-2026',
    title: '2026',
    date: '2026-09-05',
    year: 2026,
    category: 'travel',
    tag: '',
    image: '',
    gallery: [],
    pastSelf: '',
    presentSelf: '',
    pinnedBy: 'pin',
    px: 0,
    py: 0,
    rotation: 0,
    country: '日本',
    city: '东京',
    lat: 35.6762,
    lng: 139.6503,
  },
];

export default function CrystalTimelineMapPrototypePage() {
  return (
    <main className="fixed inset-0 overflow-hidden bg-[#dce7ee]" aria-label="水晶时间轴地图试验页">
      <MapView
        memories={TIMELINE_PREVIEW_MEMORIES}
        selectedMemory={null}
        onSelectMemory={() => undefined}
        onCloseMemory={() => undefined}
      />
    </main>
  );
}
