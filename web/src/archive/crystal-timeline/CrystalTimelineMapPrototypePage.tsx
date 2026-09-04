import MapView from '../../components/MapView';

export default function CrystalTimelineMapPrototypePage() {
  return (
    <main className="fixed inset-0 overflow-hidden bg-[#dce7ee]" aria-label="水晶时间轴地图试验页">
      <MapView
        memories={[]}
        selectedMemory={null}
        onSelectMemory={() => undefined}
        onCloseMemory={() => undefined}
      />
    </main>
  );
}
