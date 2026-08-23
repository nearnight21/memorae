import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { androidTopInset } from '../ui/layout';
import AmapJsWebViewMap, { type AmapMapCamera } from '../map/AmapJsWebViewMap';
import type { MemoryLocationV2 } from '../memory/memoryV2';
import {
  locationPlaceLabel,
  locationRegionLabel,
  MobileLocationClient,
  normalizeLocationResult,
  type LocationReverseResult,
  type LocationSuggestion,
  type SelectedLocation,
} from './locationClient';

interface Props {
  initialLocation?: MemoryLocationV2 | null;
  initialCamera?: AmapMapCamera;
  mapAlreadyMounted?: boolean;
  active?: boolean;
  cameraIdle?: AmapMapCamera | null;
  cameraTarget?: AmapMapCamera | null;
  onCameraTargetChange?: (camera: AmapMapCamera) => void;
  locationClient?: MobileLocationClient;
  onCancel: () => void;
  onConfirm: (location: MemoryLocationV2) => void;
}

const CENTER_ZOOM = 15;

function finiteCoordinates(value: MemoryLocationV2 | null | undefined): AmapMapCamera | null {
  if (!value || !Number.isFinite(value.lat) || !Number.isFinite(value.lng)) return null;
  return { lat: value.lat!, lng: value.lng!, zoom: CENTER_ZOOM };
}

function locationFallback(coordinates: AmapMapCamera): SelectedLocation {
  return {
    name: '地图选点',
    mx: 50,
    my: 50,
    lat: coordinates.lat,
    lng: coordinates.lng,
    provider: 'amap',
  };
}

export default function LocationPicker({
  initialLocation = null,
  initialCamera: initialCameraProp,
  mapAlreadyMounted = false,
  active = true,
  cameraIdle,
  cameraTarget: controlledCameraTarget,
  onCameraTargetChange,
  locationClient,
  onCancel,
  onConfirm,
}: Props) {
  const initialCamera = useMemo(() => finiteCoordinates(initialLocation) ?? initialCameraProp ?? null, [initialLocation, initialCameraProp]);
  const [cameraTarget, setCameraTarget] = useState<AmapMapCamera | null>(initialCamera);
  const [center, setCenter] = useState<AmapMapCamera | null>(initialCamera);
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(initialLocation ? {
    ...initialLocation,
  } : null);
  const [reverseResult, setReverseResult] = useState<LocationReverseResult | null>(null);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  const searchRequestId = useRef(0);
  const reverseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const effectiveCameraTarget = controlledCameraTarget ?? cameraTarget;

  useEffect(() => {
    if (!active || !cameraIdle) return;
    resolveCenter(cameraIdle);
  }, [active, cameraIdle?.lat, cameraIdle?.lng, cameraIdle?.zoom]);

  useEffect(() => {
    if (cameraTarget) onCameraTargetChange?.(cameraTarget);
  }, [cameraTarget?.lat, cameraTarget?.lng, cameraTarget?.zoom]);

  useEffect(() => () => {
    if (reverseTimer.current) clearTimeout(reverseTimer.current);
    if (searchTimer.current) clearTimeout(searchTimer.current);
  }, []);

  function resolveCenter(next: AmapMapCamera): void {
    setCenter(next);
    setError('');
    setReverseResult(null);
    setSelectedLocation((current) => (
      current && current.lat === next.lat && current.lng === next.lng ? current : null
    ));
    if (reverseTimer.current) clearTimeout(reverseTimer.current);
    reverseTimer.current = setTimeout(() => {
      const id = ++requestId.current;
      if (!locationClient) {
        setSelectedLocation(locationFallback(next));
        setReverseResult(null);
        setResolving(false);
        return;
      }
      setResolving(true);
      void locationClient.reverse(next).then((result) => {
        if (id !== requestId.current) return;
        setResolving(false);
        setReverseResult(result);
        if (result) setSelectedLocation(normalizeLocationResult(result, selectedLocation));
        else setError('暂时无法获取地点名称');
      }).catch(() => {
        if (id !== requestId.current) return;
        setResolving(false);
        setReverseResult(null);
        setError('暂时无法获取地点名称');
      });
    }, 350);
  }

  function selectSuggestion(candidate: LocationSuggestion): void {
    setQuery('');
    setSuggestions([]);
    const target = { lat: candidate.lat, lng: candidate.lng, zoom: CENTER_ZOOM };
    setCameraTarget(target);
    onCameraTargetChange?.(target);
    resolveCenter(target);
  }

  function handleQueryChange(value: string): void {
    setQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!value.trim() || !locationClient) {
      searchRequestId.current += 1;
      setSuggestions([]);
      return;
    }
    searchTimer.current = setTimeout(() => {
      const id = ++searchRequestId.current;
      setSearching(true);
      void locationClient.suggest(value).then((results) => {
        if (id !== searchRequestId.current) return;
        setSuggestions(results);
      }).catch(() => {
        if (id !== searchRequestId.current) return;
        setSuggestions([]);
      }).finally(() => {
        if (id === searchRequestId.current) setSearching(false);
      });
    }, 350);
  }

  const region = reverseResult ? locationRegionLabel(reverseResult) : selectedLocation
    ? [selectedLocation.province, selectedLocation.city, selectedLocation.district].filter(Boolean).join(' · ') || selectedLocation.name
    : center ? '正在获取地点…' : '移动地图选择地点';
  const place = reverseResult ? locationPlaceLabel(reverseResult) : selectedLocation?.name ?? '';

  return (
    <KeyboardAvoidingView pointerEvents="box-none" style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {!mapAlreadyMounted && <AmapJsWebViewMap
        markers={[]}
        initialCamera={initialCamera ?? undefined}
        cameraTarget={effectiveCameraTarget}
        onCameraIdle={resolveCenter}
        showStatus={false}
      />}
      <View pointerEvents="none" style={styles.mapDim} />
      <Image source={require('../../assets/location/fixed-center-marker.png')} style={styles.centerMarker} resizeMode="contain" />
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="取消地点选择" onPress={onCancel} style={styles.cancelButton}>
            <Text style={styles.cancelText}>取消</Text>
          </Pressable>
          <View style={styles.searchField}>
            {searching ? <ActivityIndicator size="small" color="#8a7561" style={styles.searchIcon} /> : <Text style={styles.searchIcon}>⌕</Text>}
            <TextInput
              accessibilityLabel="搜索地点或 POI"
              value={query}
              onChangeText={handleQueryChange}
              placeholder="搜索地点或 POI"
              placeholderTextColor="rgba(102,91,80,0.72)"
              style={styles.searchInput}
              returnKeyType="search"
            />
          </View>
        </View>
        {suggestions.length > 0 && (
          <View style={styles.suggestionList}>
            {suggestions.slice(0, 6).map((candidate) => (
              <Pressable key={`${candidate.lat}:${candidate.lng}:${candidate.providerId ?? candidate.shortName}`} onPress={() => selectSuggestion(candidate)} style={styles.suggestionRow}>
                <Text style={styles.suggestionTitle}>{candidate.shortName}</Text>
                <Text style={styles.suggestionDetail} numberOfLines={1}>{candidate.displayName}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <View style={styles.confirmRegion}>
          <View style={styles.confirmCopy}>
            <Text style={styles.regionText} numberOfLines={1}>{region}</Text>
            <Text style={styles.placeText} numberOfLines={1}>{resolving ? '正在获取地点…' : place || (error || '拖动地图选择中心点')}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="确定地点"
            disabled={!center || resolving}
            onPress={() => onConfirm(selectedLocation && center
              ? { ...selectedLocation, lat: center.lat, lng: center.lng }
              : center ? locationFallback(center) : { name: '地图选点', mx: 50, my: 50 })}
            style={({ pressed }) => [styles.confirmButton, (!center || resolving) && styles.disabled, pressed && styles.pressed]}
          >
            <Text style={styles.confirmText}>确定</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: 'transparent' },
  mapDim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(255,255,255,0.24)' },
  centerMarker: { position: 'absolute', width: 28, height: 44, left: '50%', top: '50%', marginLeft: -14, marginTop: -22, zIndex: 5 },
  overlay: { flex: 1, paddingTop: androidTopInset(), justifyContent: 'space-between', zIndex: 6 },
  topRow: { paddingTop: 10, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 14 },
  cancelButton: { width: 30, height: 44, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: 'rgba(101,88,76,0.98)', fontSize: 14, fontWeight: '500' },
  searchField: { flex: 1, height: 44, borderRadius: 22, backgroundColor: 'rgba(244,236,221,0.9)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, shadowColor: '#14120d', shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  searchIcon: { width: 20, color: 'rgba(102,91,80,0.86)', fontSize: 19, textAlign: 'center' },
  searchInput: { flex: 1, paddingVertical: 0, marginLeft: 8, color: '#40382f', fontSize: 13 },
  suggestionList: { marginTop: 8, marginHorizontal: 64, borderRadius: 12, overflow: 'hidden', backgroundColor: 'rgba(253,252,247,0.97)', shadowColor: '#14120d', shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  suggestionRow: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(117,79,49,0.15)' },
  suggestionTitle: { color: '#40382f', fontSize: 13, fontWeight: '600' },
  suggestionDetail: { color: '#786a5d', fontSize: 11, marginTop: 2 },
  confirmRegion: { marginHorizontal: 20, marginBottom: 10, minHeight: 70, borderRadius: 14, paddingLeft: 16, paddingRight: 12, backgroundColor: 'rgba(244,236,221,0.84)', flexDirection: 'row', alignItems: 'center', shadowColor: '#14120d', shadowOpacity: 0.17, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  confirmCopy: { flex: 1, minWidth: 0 },
  regionText: { color: 'rgba(64,56,47,0.95)', fontSize: 14, fontWeight: '500' },
  placeText: { color: 'rgba(102,88,75,0.86)', fontSize: 12, marginTop: 4 },
  confirmButton: { width: 54, height: 40, alignItems: 'center', justifyContent: 'center' },
  confirmText: { color: '#754f31', fontSize: 14, fontWeight: '500' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
});
