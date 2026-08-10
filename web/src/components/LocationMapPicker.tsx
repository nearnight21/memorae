import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface LocationMapPickerProps {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
}

const DEFAULT_CENTER: L.LatLngExpression = [35, 108];
const DEFAULT_ZOOM = 4;
const DETAIL_ZOOM = 13;

/**
 * 新建记忆的地点微调地图。
 * 搜索地点得到初始坐标后，用户可以点击地图或拖动图钉校正落点。
 */
export default function LocationMapPicker({ lat, lng, onChange }: LocationMapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: lat !== null && lng !== null ? [lat, lng] : DEFAULT_CENTER,
      zoom: lat !== null && lng !== null ? DETAIL_ZOOM : DEFAULT_ZOOM,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer(
      'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
      { subdomains: '1234', maxZoom: 18 }
    ).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    map.on('click', (event: L.LeafletMouseEvent) => {
      onChangeRef.current(event.latlng.lat, event.latlng.lng);
    });

    mapRef.current = map;
    window.setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || lat === null || lng === null) return;

    const coords: L.LatLngExpression = [lat, lng];
    if (!markerRef.current) {
      markerRef.current = L.marker(coords, { draggable: true }).addTo(map);
      markerRef.current.on('dragend', () => {
        const next = markerRef.current?.getLatLng();
        if (next) onChangeRef.current(next.lat, next.lng);
      });
    } else {
      markerRef.current.setLatLng(coords);
    }

    map.flyTo(coords, Math.max(map.getZoom(), DETAIL_ZOOM), { animate: false });
  }, [lat, lng]);

  return <div ref={containerRef} className="h-48 w-full overflow-hidden rounded-lg border border-amber-900/20" />;
}
