import { useMemo, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import AmapJsWebViewMap, { type AmapMapCamera, type AmapWebViewMarker } from '../map/AmapJsWebViewMap';
import type { MemoryV2 } from '../memory/memoryV2';
import MobileTimeline from './MobileTimeline';
import RegionControl from './RegionControl';
import { androidTopInset } from '../ui/layout';

interface Props {
  markers: AmapWebViewMarker[];
  memories: readonly MemoryV2[];
  selectedYear: string | null;
  regionLabel?: string;
  loading?: boolean;
  status?: string;
  onYearChange: (year: string | null) => void;
  onRegionPress?: () => void;
  onMarkerPressed?: (id: string) => void;
  onClusterPressed?: (coordinates: { lat: number; lng: number; id?: string }) => void;
  onMapPressed?: (coordinates: { lat: number; lng: number }) => void;
  onCameraIdle?: (coordinates: AmapMapCamera) => void;
  initialCamera?: AmapMapCamera;
  cameraTarget?: AmapMapCamera | null;
  markerUpdatesPaused?: boolean;
  locationMode?: boolean;
  locationOverlay?: ReactNode;
  onCreateMemory?: () => void;
  chromeVisible?: boolean;
}

export default function HomeScreen({
  markers,
  memories,
  selectedYear,
  regionLabel = '浙江 · 宁波',
  loading = false,
  status,
  onYearChange,
  onRegionPress,
  onMarkerPressed,
  onClusterPressed,
  onMapPressed,
  onCameraIdle,
  initialCamera,
  cameraTarget,
  markerUpdatesPaused = false,
  locationMode = false,
  locationOverlay,
  onCreateMemory,
  chromeVisible = true,
}: Props) {
  const years = useMemo(() => Array.from(new Set(
    memories.map((memory) => memory.date.slice(0, 4)).filter((year) => /^\d{4}$/.test(year)),
  )).sort(), [memories]);
  return (
    <View style={styles.root}>
      <View style={styles.map}>
        <AmapJsWebViewMap
          markers={markers}
          onMarkerPressed={onMarkerPressed}
          onClusterPressed={onClusterPressed}
          onMapPressed={onMapPressed}
          onCameraIdle={onCameraIdle}
          initialCamera={initialCamera}
          cameraTarget={cameraTarget}
          markerUpdatesPaused={markerUpdatesPaused}
          showStatus={!locationMode && chromeVisible}
        />
      </View>
      {!locationMode && chromeVisible && <View pointerEvents="box-none" style={styles.overlay}>
        <View pointerEvents="box-none" style={styles.topRow}>
          <RegionControl label={regionLabel} onPress={onRegionPress} />
        </View>
        {(loading || status || (memories.length === 0 && !loading)) && (
          <View pointerEvents="none" style={styles.messageSlot}>
            {loading && <ActivityIndicator size="small" color="#b5814b" />}
            <Text style={styles.message}>
              {loading ? '正在整理加密记忆…' : status ?? (memories.length === 0 ? '还没有带地点的记忆' : '')}
            </Text>
          </View>
        )}
        <View pointerEvents="box-none" style={styles.bottomArea}>
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
  overlay: { flex: 1, paddingTop: androidTopInset(), zIndex: 3, justifyContent: 'space-between' },
  topRow: { paddingTop: 16, paddingHorizontal: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  messageSlot: { alignSelf: 'center', alignItems: 'center', gap: 6, maxWidth: 250, marginTop: 72 },
  message: { color: '#6e766f', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  bottomArea: { paddingHorizontal: 16, paddingBottom: 16, minHeight: 140, justifyContent: 'flex-end' },
  timelineWrap: { width: '100%', paddingRight: 16 },
  createButton: { position: 'absolute', right: 16, bottom: 84, width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(246,245,240,0.86)', shadowColor: '#262926', shadowOpacity: 0.1, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  createPlus: { color: '#3c403d', fontSize: 27, lineHeight: 30, fontWeight: '300' },
  createPressed: { opacity: 0.68, transform: [{ scale: 0.96 }] },
});
