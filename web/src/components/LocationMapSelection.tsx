import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Check, LoaderCircle, MapPin, RefreshCw, Search, X } from 'lucide-react';
import { hasResolvedAdministrativeLocation, reverseGeocodeCoordinates, searchPlaces, type GeoResult, type PlaceCandidate } from '../lib/geo';
import { resolveLocationWithRetry } from '../lib/locationLookup';

interface Coordinates {
  lat: number;
  lng: number;
}

interface LocationMapSelectionProps {
  initialCoordinates: Coordinates | null;
  fallbackName: string;
  onCancel: () => void;
  onConfirm: (location: Coordinates & {
    name: string;
    country?: string;
    province?: string;
    city?: string;
    district?: string;
    adcode?: string;
    provider?: 'amap';
    providerId?: string;
    resolved: boolean;
  }) => void;
}

const DEFAULT_CENTER: L.LatLngExpression = [35, 108];
const DEFAULT_ZOOM = 4;
const DETAIL_ZOOM = 13;

const temporaryMarker = L.divIcon({
  className: 'memory-location-selection-marker-shell',
  html: '<span class="memory-location-selection-marker" aria-hidden="true"></span>',
  iconSize: [48, 52],
  iconAnchor: [24, 46],
});

function locationName(result: GeoResult | null, fallbackName: string) {
  return result?.placeName || result?.label || result?.city || result?.country || fallbackName.trim() || '大致位置已标记';
}

/**
 * 新建记忆中的临时选点状态。它只维护尚未确认的坐标，确认后才回写编辑草稿。
 */
export default function LocationMapSelection({
  initialCoordinates,
  fallbackName,
  onCancel,
  onConfirm,
}: LocationMapSelectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [selection, setSelection] = useState<Coordinates | null>(initialCoordinates);
  const [selectionCandidate, setSelectionCandidate] = useState<PlaceCandidate | null>(null);
  const [resolvedPlace, setResolvedPlace] = useState<GeoResult | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);
  const [lookupVersion, setLookupVersion] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceCandidate[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const hasInitialLocation = initialCoordinates !== null;
    const map = L.map(containerRef.current, {
      center: hasInitialLocation ? [initialCoordinates.lat, initialCoordinates.lng] : DEFAULT_CENTER,
      zoom: hasInitialLocation ? DETAIL_ZOOM : DEFAULT_ZOOM,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer(
      'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
      { subdomains: '1234', maxZoom: 18 },
    ).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    map.on('click', (event: L.LeafletMouseEvent) => {
      // 地图点击拥有最终坐标；反查只为它补充名称。
      setSelectionCandidate(null);
      setSelection({ lat: event.latlng.lat, lng: event.latlng.lng });
    });

    mapRef.current = map;
    window.setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [initialCoordinates]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selection) return;

    const coordinates: L.LatLngExpression = [selection.lat, selection.lng];
    if (!markerRef.current) {
      markerRef.current = L.marker(coordinates, {
        icon: temporaryMarker,
        keyboard: false,
        zIndexOffset: 1_000,
      }).addTo(map);
    } else {
      markerRef.current.setLatLng(coordinates);
    }

    const markerElement = markerRef.current.getElement();
    markerElement?.classList.remove('is-arriving');
    window.requestAnimationFrame(() => markerElement?.classList.add('is-arriving'));
  }, [selection]);

  useEffect(() => {
    if (searchTimerRef.current !== null) window.clearTimeout(searchTimerRef.current);
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    searchTimerRef.current = window.setTimeout(() => {
      setIsSearching(true);
      void searchPlaces(query).then((results) => {
        setSearchResults(results);
        setIsSearching(false);
      });
    }, 320);
    return () => {
      if (searchTimerRef.current !== null) window.clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery]);

  const selectSearchResult = (result: PlaceCandidate) => {
    const coordinates = { lat: result.lat, lng: result.lng };
    setSelectionCandidate(result);
    setSelection(coordinates);
    setSearchQuery('');
    setSearchResults([]);
    mapRef.current?.flyTo([result.lat, result.lng], DETAIL_ZOOM, { duration: 0.55 });
  };

  useEffect(() => {
    if (!selection) {
      setResolvedPlace(null);
      setIsResolving(false);
      setLookupFailed(false);
      return;
    }

    let cancelled = false;
    setResolvedPlace(null);
    setLookupFailed(false);
    setIsResolving(true);
    void resolveLocationWithRetry(
      () => reverseGeocodeCoordinates(selection.lat, selection.lng),
    ).then((result) => {
      if (cancelled) return;
      setResolvedPlace(result);
      setLookupFailed(result === null);
      setIsResolving(false);
    });

    return () => {
      cancelled = true;
    };
  }, [lookupVersion, selection]);

  const selectedName = selectionCandidate?.shortName || locationName(resolvedPlace, fallbackName);
  const detail = resolvedPlace
    ? resolvedPlace.formattedAddress || [resolvedPlace.country, resolvedPlace.city].filter(Boolean).join(' · ')
    : selectionCandidate?.displayName
      ? selectionCandidate.displayName
    : selection
      ? `${selection.lat.toFixed(5)}, ${selection.lng.toFixed(5)}`
      : '';
  const canConfirm = Boolean(
    resolvedPlace
      && !lookupFailed
      && hasResolvedAdministrativeLocation(resolvedPlace),
  );

  const confirmSelection = () => {
    if (isResolving) return;
    if (!canConfirm) {
      setLookupVersion((version) => version + 1);
      return;
    }
    onConfirm({
      ...selection!,
      name: selectedName,
      country: resolvedPlace?.country,
      province: resolvedPlace?.province,
      city: resolvedPlace?.city,
      district: resolvedPlace?.district,
      adcode: resolvedPlace?.adcode,
      provider: resolvedPlace?.provider,
      providerId: selectionCandidate?.providerId,
      resolved: true,
    });
  };

  return (
    <section className="memory-location-selection" aria-label="在地图上选择地点">
      <div ref={containerRef} className="memory-location-selection-map" />
      <header className="memory-location-selection-header">
        <div className="memory-location-selection-guidance">
          <p>点击地图，标记这段记忆发生的位置</p>
          <label className="memory-location-selection-search">
            <Search size={15} aria-hidden="true" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索城市、地点或大致区域"
              aria-label="搜索城市、地点或大致区域"
            />
            {isSearching && <LoaderCircle size={14} className="animate-spin" aria-label="正在搜索" />}
          </label>
          {searchResults.length > 0 && (
            <ul className="memory-location-selection-search-results" aria-label="地点搜索结果">
              {searchResults.map((result) => (
                <li key={`${result.lat}-${result.lng}`}>
                  <button type="button" onClick={() => selectSearchResult(result)}>
                    <MapPin size={14} aria-hidden="true" />
                    <span><strong>{result.shortName}</strong><small>{result.displayName}</small></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="button" onClick={onCancel} className="memory-location-selection-cancel">
          <X size={16} aria-hidden="true" />
          取消
        </button>
      </header>

      {selection && (
        <aside className="memory-location-selection-confirm" aria-live="polite">
          <div className="memory-location-selection-copy">
            <strong>
              {isResolving ? '正在识别地点...' : lookupFailed ? '地点行政信息暂未确认' : selectedName}
            </strong>
            <span>
              {isResolving
                ? '正在获取地点名称与地址'
                : lookupFailed
                  ? `${detail} · 可重试后再确认`
                  : detail || '大致位置已标记'}
            </span>
          </div>
          {lookupFailed && (
            <button
              type="button"
              onClick={() => setLookupVersion((version) => version + 1)}
              className="memory-location-selection-retry"
            >
              <RefreshCw size={15} aria-hidden="true" />
              重新识别
            </button>
          )}
          <button type="button" onClick={onCancel} className="memory-location-selection-secondary">取消</button>
          <button
            type="button"
            onClick={confirmSelection}
            disabled={isResolving}
            className="memory-location-selection-primary"
          >
            {isResolving ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} aria-hidden="true" />}
            确认此地点
          </button>
        </aside>
      )}
    </section>
  );
}
