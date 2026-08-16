import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Check, LoaderCircle, X } from 'lucide-react';
import { reverseGeocodeCoordinates, type GeoResult } from '../lib/geo';

interface Coordinates {
  lat: number;
  lng: number;
}

interface LocationMapSelectionProps {
  initialCoordinates: Coordinates | null;
  fallbackName: string;
  onCancel: () => void;
  onConfirm: (location: Coordinates & { name: string; country?: string; city?: string; district?: string }) => void;
}

const DEFAULT_CENTER: L.LatLngExpression = [35, 108];
const DEFAULT_ZOOM = 4;
const DETAIL_ZOOM = 13;

const temporaryMarker = L.divIcon({
  className: 'memory-location-selection-marker-shell',
  html: '<span class="memory-location-selection-marker" aria-hidden="true"></span>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

function locationName(result: GeoResult | null, fallbackName: string) {
  return result?.label || result?.city || result?.country || fallbackName.trim() || '大致位置已标记';
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
  const [resolvedPlace, setResolvedPlace] = useState<GeoResult | null>(null);
  const [isResolving, setIsResolving] = useState(false);

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
      markerRef.current = L.marker(coordinates, { icon: temporaryMarker, keyboard: false }).addTo(map);
    } else {
      markerRef.current.setLatLng(coordinates);
    }

    const markerElement = markerRef.current.getElement();
    markerElement?.classList.remove('is-arriving');
    window.requestAnimationFrame(() => markerElement?.classList.add('is-arriving'));
  }, [selection]);

  useEffect(() => {
    if (!selection) {
      setResolvedPlace(null);
      setIsResolving(false);
      return;
    }

    let cancelled = false;
    setResolvedPlace(null);
    setIsResolving(true);
    const resolveWithFallback = Promise.race<GeoResult | null>([
      reverseGeocodeCoordinates(selection.lat, selection.lng),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 6000)),
    ]);
    void resolveWithFallback.then((result) => {
      if (cancelled) return;
      setResolvedPlace(result);
      setIsResolving(false);
    });

    return () => {
      cancelled = true;
    };
  }, [selection]);

  const selectedName = locationName(resolvedPlace, fallbackName);
  const detail = resolvedPlace
    ? [resolvedPlace.country, resolvedPlace.city].filter(Boolean).join(' · ')
    : selection
      ? `${selection.lat.toFixed(5)}, ${selection.lng.toFixed(5)}`
      : '';

  return (
    <section className="memory-location-selection" aria-label="在地图上选择地点">
      <div ref={containerRef} className="memory-location-selection-map" />
      <header className="memory-location-selection-header">
        <p>点击地图，标记这段记忆发生的位置</p>
        <button type="button" onClick={onCancel} className="memory-location-selection-cancel">
          <X size={16} aria-hidden="true" />
          取消
        </button>
      </header>

      {selection && (
        <aside className="memory-location-selection-confirm" aria-live="polite">
          <div className="memory-location-selection-copy">
            <strong>{isResolving ? '正在识别地点...' : selectedName}</strong>
            <span>{isResolving ? '正在获取地点名称与地址' : detail || '大致位置已标记'}</span>
          </div>
          <button type="button" onClick={onCancel} className="memory-location-selection-secondary">取消</button>
          <button
            type="button"
            onClick={() => onConfirm({
              ...selection,
              name: selectedName,
              country: resolvedPlace?.country,
              city: resolvedPlace?.city,
              district: resolvedPlace?.district,
            })}
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
