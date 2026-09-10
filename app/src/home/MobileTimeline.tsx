import ArcTimeline from './timeline/ArcTimeline';
import type { SharedValue } from 'react-native-reanimated';

interface Props {
  years: string[];
  selectedYear: string | null;
  onSelect: (year: string | null) => void;
  onCreateMemory?: () => void;
  createPullProgress: SharedValue<number>;
  onResetMapView?: () => void;
  resetPullProgress: SharedValue<number>;
  onQuickReturnNow?: () => void;
  onBrowseTimeline?: () => void;
}

export default function MobileTimeline({
  years,
  selectedYear,
  onSelect,
  onCreateMemory,
  createPullProgress,
  onResetMapView,
  resetPullProgress,
  onQuickReturnNow,
  onBrowseTimeline,
}: Props) {
  return (
    <ArcTimeline
      years={years}
      selectedYear={selectedYear}
      onSelect={onSelect}
      onCreateMemory={onCreateMemory}
      createPullProgress={createPullProgress}
      onResetMapView={onResetMapView}
      resetPullProgress={resetPullProgress}
      onQuickReturnNow={onQuickReturnNow}
      onBrowseTimeline={onBrowseTimeline}
    />
  );
}
