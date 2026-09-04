import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MemoraeMap, {
  type CameraState,
  type MapCameraIdleEvent,
  type MapClusterPressEvent,
  type MapMarkerPressEvent,
  type MemoryMapMarker,
} from '../map/MemoraeMap';
import type { HomeRegionOption } from '../map/homeMapModel';
import type { MemoryV2 } from '../memory/memoryV2';
import MobileTimeline from './MobileTimeline';
import RegionControl from './RegionControl';
import TimelineQuietZone from './TimelineQuietZone';
import { androidTopInset } from '../ui/layout';
import { ARC_HOME_BOTTOM_PADDING } from './timeline/arcTimelineGeometry';

const TIMELINE_VERTICAL_OFFSET = 50;

interface Props {
  markers: readonly MemoryMapMarker[];
  memories: readonly MemoryV2[];
  selectedYear: string | null;
  regionLabel: string;
  regionOptions: readonly HomeRegionOption[];
  loading?: boolean;
  status?: string;
  onYearChange: (year: string | null) => void;
  onRegionSelect: (region: HomeRegionOption) => void;
  onMarkerPress?: (event: MapMarkerPressEvent) => void;
  onClusterPress?: (event: MapClusterPressEvent) => void;
  onCameraIdle?: (event: MapCameraIdleEvent) => void;
  initialCamera?: CameraState;
  camera?: CameraState | null;
  mapUpdatesPaused?: boolean;
  locationMode?: boolean;
  locationOverlay?: ReactNode;
  onCreateMemory?: () => void;
  chromeVisible?: boolean;
}

export default function HomeScreen({
  markers,
  memories,
  selectedYear,
  regionLabel,
  regionOptions,
  loading = false,
  status,
  onYearChange,
  onRegionSelect,
  onMarkerPress,
  onClusterPress,
  onCameraIdle,
  initialCamera,
  camera,
  mapUpdatesPaused = false,
  locationMode = false,
  locationOverlay,
  onCreateMemory,
  chromeVisible = true,
}: Props) {
  const insets = useSafeAreaInsets();
  const [regionMenuOpen, setRegionMenuOpen] = useState(false);
  const homeStatus = status?.includes('诊断：') ? undefined : status;
  const years = useMemo(() => Array.from(new Set(
    memories.map((memory) => memory.date.slice(0, 4)).filter((year) => /^\d{4}$/.test(year)),
  )).sort(), [memories]);

  useEffect(() => {
    if (!chromeVisible || locationMode) setRegionMenuOpen(false);
  }, [chromeVisible, locationMode]);

  function selectRegion(region: HomeRegionOption): void {
    setRegionMenuOpen(false);
    onRegionSelect(region);
  }

  return (
    <View style={styles.root}>
      <View style={styles.map}>
        <MemoraeMap
          markers={markers}
          onMarkerPress={onMarkerPress}
          onClusterPress={onClusterPress}
          onCameraIdle={onCameraIdle}
          initialCamera={initialCamera}
          camera={camera}
          updatesPaused={mapUpdatesPaused}
          showStatus={false}
        />
      </View>
      {!locationMode && chromeVisible && <TimelineQuietZone />}
      {!locationMode && chromeVisible && <View pointerEvents="box-none" style={styles.overlay}>
        <View pointerEvents="box-none" style={styles.topRow}>
          <View style={styles.regionArea}>
            <RegionControl
              label={regionLabel}
              expanded={regionMenuOpen}
              onPress={() => setRegionMenuOpen((open) => !open)}
            />
            {regionMenuOpen && (
              <View accessibilityRole="menu" style={styles.regionMenu}>
                <ScrollView bounces={false} contentContainerStyle={styles.regionMenuContent}>
                  {regionOptions.map((region) => (
                    <Pressable
                      key={region.key}
                      accessibilityRole="menuitem"
                      accessibilityLabel={`${region.label}，${region.memoryCount} 段记忆`}
                      onPress={() => selectRegion(region)}
                      style={({ pressed }) => [styles.regionOption, pressed && styles.regionOptionPressed]}
                    >
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.regionOptionLabel,
                          region.scope === 'province' && styles.regionProvince,
                          region.scope === 'city' && styles.regionCity,
                        ]}
                      >
                        {region.label}
                      </Text>
                      <Text style={styles.regionOptionCount}>{region.memoryCount} 段</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
        {(loading || homeStatus || (memories.length === 0 && !loading)) && (
          <View pointerEvents="none" style={styles.messageSlot}>
            {loading && <ActivityIndicator size="small" color="#b5814b" />}
            <Text style={styles.message}>
              {loading ? '正在整理加密记忆…' : homeStatus ?? (memories.length === 0 ? '还没有带地点的记忆' : '')}
            </Text>
          </View>
        )}
        <View
          pointerEvents="box-none"
          style={[
            styles.bottomArea,
            { paddingBottom: Math.max(ARC_HOME_BOTTOM_PADDING, insets.bottom + 16) },
          ]}
        >
          <View style={styles.timelineWrap}>
            <MobileTimeline years={years} selectedYear={selectedYear} onSelect={onYearChange} />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="新建记忆"
            onPress={onCreateMemory}
            style={({ pressed }) => [styles.createButton, pressed && styles.createPressed]}
          >
            <Text style={styles.createPlus}>+</Text>
          </Pressable>
        </View>
      </View>}
      {locationMode && locationOverlay}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#e3e8e5' },
  map: { ...StyleSheet.absoluteFill, zIndex: 2 },
  overlay: { flex: 1, paddingTop: androidTopInset(), zIndex: 4, justifyContent: 'space-between' },
  topRow: { paddingTop: 16, paddingHorizontal: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  regionArea: { width: 224, zIndex: 4 },
  regionMenu: { marginTop: 8, maxHeight: 300, borderRadius: 16, overflow: 'hidden', backgroundColor: 'rgba(246,245,240,0.96)', shadowColor: '#262926', shadowOpacity: 0.14, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  regionMenuContent: { paddingVertical: 6 },
  regionOption: { minHeight: 42, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  regionOptionPressed: { backgroundColor: 'rgba(181,129,75,0.12)' },
  regionOptionLabel: { flex: 1, color: '#3c403d', fontSize: 14, lineHeight: 20, fontWeight: '600' },
  regionProvince: { paddingLeft: 12, fontWeight: '500' },
  regionCity: { paddingLeft: 24, color: '#626a64', fontWeight: '400' },
  regionOptionCount: { color: '#8b8175', fontSize: 12, lineHeight: 18 },
  messageSlot: { alignSelf: 'center', alignItems: 'center', gap: 6, maxWidth: 250, marginTop: 72 },
  message: { color: '#6e766f', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  bottomArea: { paddingHorizontal: 16, minHeight: 240, justifyContent: 'flex-end' },
  timelineWrap: { marginHorizontal: -16, transform: [{ translateY: TIMELINE_VERTICAL_OFFSET }] },
  createButton: { position: 'absolute', right: 16, bottom: 168, width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(246,245,240,0.86)', shadowColor: '#262926', shadowOpacity: 0.1, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  createPlus: { color: '#3c403d', fontSize: 27, lineHeight: 30, fontWeight: '300' },
  createPressed: { opacity: 0.68, transform: [{ scale: 0.96 }] },
});
