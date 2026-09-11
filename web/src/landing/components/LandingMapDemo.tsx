import { lazy, Suspense, useState, type CSSProperties, type FC } from 'react';
import { MapPin } from 'lucide-react';
import type { Memory } from '../../types';
import { DEMO_MEMORIES } from '../demo/demoMemories';

/**
 * 真实产品地图的只读落地页切片。
 *
 * 直接运行 Web 端真实 MapView（真实 Marker / 气泡 / 折页详情展开收起 / 水晶时间轴），
 * 只替换数据源为本地 Demo 记忆，不传入任何写入回调：
 *   - 不传 onAddMemory / onSaveMemory / onDeleteMemory → 组件内自动隐藏创建、编辑、删除入口
 *   - 不传 onLoadPreviewPhoto / onLoadOriginalPhoto → 直接使用本地图片，不触达任何照片存储
 * 因此无需修改 MapView 内部逻辑，也无需在公开落地页打包任何生产用户能力。
 */
const MapView = lazy(() => import('../../components/MapView'));

export interface LandingMapDemoProps {
  /** 是否连同底部水晶时间轴一起展示。Hero 处只展示地图，时间轴段展示完整版。 */
  showTimeline?: boolean;
  /** 舞台高度（像素），用于 Hero 与时间轴段各自的版式。 */
  height?: number;
  className?: string;
}

export const LandingMapDemo: FC<LandingMapDemoProps> = ({
  showTimeline = false,
  height = 520,
  className,
}) => {
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);

  const style: CSSProperties = { height };

  return (
    <div
      className={['landing-map-demo-stage', className].filter(Boolean).join(' ')}
      style={style}
    >
      <Suspense
        fallback={(
          <div className="landing-map-demo-skeleton" aria-hidden="true">
            <MapPin size={22} strokeWidth={1.6} />
            <span>正在载入交互地图…</span>
          </div>
        )}
      >
        <MapView
          memories={DEMO_MEMORIES}
          selectedMemory={selectedMemory}
          onSelectMemory={setSelectedMemory}
          onCloseMemory={() => setSelectedMemory(null)}
          embedded
          showTimeline={showTimeline}
          openSingleForeignMemory
        />
      </Suspense>
    </div>
  );
};

export default LandingMapDemo;
