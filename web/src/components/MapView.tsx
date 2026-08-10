import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { motion, AnimatePresence } from 'motion/react';
import { CalendarDays, Check, ChevronDown, Filter, List, MapPin, X } from 'lucide-react';
import { Memory } from '../types';
import { resolvePlace, geocodeAddress } from '../lib/geo';
import { CITY_LABELS } from '../lib/labels';
import MapMemoryOverlay from './MapMemoryOverlay';

// 底图模式：'amap' = 高德瓦片（国内直连、中文标注、浅色）；'dark' = CARTO 深色无标注 + 自绘中文标注层
const TILE_MODE: 'amap' | 'dark' = 'amap';

// 自适应层级阈值：zoom < CITY_ZOOM → 国家气泡；CITY_ZOOM ≤ zoom < POINT_ZOOM → 城市气泡；zoom ≥ POINT_ZOOM → 具体点位
const CITY_ZOOM = 5;
const POINT_ZOOM = 9;

interface MapViewProps {
  memories: Memory[];
  selectedMemory: Memory | null;
  onSelectMemory: (m: Memory) => void;
  onCloseMemory: () => void;
  onUpdateMemory: (memory: Memory) => void;
}

interface PanelState {
  title: string;
  list: Memory[];
}

const countryOf = (m: Memory): string => m.country?.trim() || '';
// 城市为空时回退用「地点」名（如 "大理古城"），保证只填地点的记忆也能上图
const cityOf = (m: Memory): string => m.city?.trim() || m.location?.name?.trim() || '';

function groupBy<T>(list: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of list) {
    const k = keyFn(item);
    if (!k) continue;
    (out[k] ||= []).push(item);
  }
  return out;
}

const escHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fallbackImageOf = (m: Memory): string | undefined =>
  m.gallery.find((url) => url && url !== m.image) || m.gallery.find(Boolean);

const mapImageUrl = (url: string): string => {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith('images.unsplash.com')) {
      parsed.searchParams.set('w', '160');
      parsed.searchParams.set('q', '62');
      parsed.searchParams.set('fit', 'crop');
    }
    return parsed.toString();
  } catch {
    return url;
  }
};

const stableHash = (value: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

async function mapWithConcurrency<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency = 3,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const run = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

const shortPlaceLabel = (label: string): string => {
  if (label.includes('阿拉伯联合') || label.includes('阿拉伯聯合') || label === 'United Arab Emirates') return '阿联酋';
  return label;
};

const isChinaCountry = (country: string): boolean => {
  const normalized = country.trim();
  return normalized === '中国' || normalized.includes('中国') || normalized.includes('中國');
};

const averageMemoryCoordinates = (list: Memory[]): [number, number] | null => {
  const points = list.filter(
    (memory): memory is Memory & { lat: number; lng: number } =>
      typeof memory.lat === 'number' && Number.isFinite(memory.lat) &&
      typeof memory.lng === 'number' && Number.isFinite(memory.lng)
  );
  if (points.length === 0) return null;
  return [
    points.reduce((sum, memory) => sum + memory.lat, 0) / points.length,
    points.reduce((sum, memory) => sum + memory.lng, 0) / points.length,
  ];
};

function bubbleIcon(img: string, count: number, label: string, fallback?: string): L.DivIcon {
  const primary = mapImageUrl(img || fallback || '');
  const fallbackUrl = fallback ? mapImageUrl(fallback) : undefined;
  const visibleLabel = shortPlaceLabel(label);
  const fallbackHandler = fallbackUrl && fallbackUrl !== primary
    ? `this.onerror=null;this.src=${JSON.stringify(fallbackUrl)}`
    : 'this.style.display="none"';

  return L.divIcon({
    className: 'map-bubble-wrap',
    html: `
      <div class="map-bubble">
        <img src="${escHtml(primary)}" referrerpolicy="no-referrer" alt="" decoding="async" onerror="${escHtml(fallbackHandler)}" />
        ${count > 1 ? `<span class="map-bubble-count">${count}</span>` : ''}
        <span class="map-bubble-label">${escHtml(visibleLabel)}</span>
      </div>
    `,
    iconSize: [76, 76],
    iconAnchor: [38, 38],
  });
}

export default function MapView({
  memories,
  selectedMemory,
  onSelectMemory,
  onCloseMemory,
  onUpdateMemory,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const [baseMapReady, setBaseMapReady] = useState(false);
  const [selectedAnchor, setSelectedAnchor] = useState<{ x: number; y: number } | null>(null);
  const [mapViewport, setMapViewport] = useState({ width: window.innerWidth, height: window.innerHeight });

  const [viewCountry, setViewCountry] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [enriched, setEnriched] = useState<Memory[]>(memories);
  // zoom 变化后 +1，触发气泡按当前缩放级别重建（自适应层级）
  const [zoomTick, setZoomTick] = useState(0);
  // 地区线时间筛选：'all' 显示全部年份，否则只显示该年份的记忆
  const [timeFilter, setTimeFilter] = useState<'all' | number>('all');
  const [timeMenuOpen, setTimeMenuOpen] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [countryFilter, setCountryFilter] = useState<'all' | string>('all');
  // range 本地值（跟手拖动），外部状态变化时由 effect 同步
  const [rangeVal, setRangeVal] = useState(0);

  // 全部可用年份作为滑块的固定刻度；不能从 filtered 计算，否则选中一年后滑块会塌缩成单值
  const allYears: number[] = useMemo(
    () => Array.from(new Set<number>(enriched.map((m) => m.year))).sort((a, b) => a - b),
    [enriched]
  );

  // 外部改变筛选（点「全部时间」/年份按钮）时同步滑块位置
  useEffect(() => {
    setRangeVal(
      timeFilter === 'all'
        ? Math.max(0, allYears.length - 1)
        : Math.max(0, allYears.indexOf(timeFilter))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeFilter]);

  // 只填了「地点」没填「国家」的记忆：地理编码自动归组到国家/城市气泡（结果有 localStorage 缓存）
  useEffect(() => {
    setEnriched(memories);
    let cancelled = false;
    const run = async () => {
      const out = [...memories];
      let changed = false;
      for (let i = 0; i < out.length; i++) {
        const m = out[i];
        if (!m.country?.trim() && m.location?.name?.trim()) {
          const geo = await geocodeAddress(m.location.name);
          if (geo?.country && !cancelled) {
            out[i] = { ...m, country: geo.country, city: m.city?.trim() ? m.city : geo.city };
            changed = true;
          }
        }
      }
      if (changed && !cancelled) setEnriched(out);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [memories]);

  const availableCountries = useMemo(
    () => Array.from(new Set(enriched.map(countryOf).filter(Boolean))).sort(),
    [enriched]
  );

  // 时间与地区筛选后的数据源（气泡/面板/未标注计数共用）
  const timeFiltered = useMemo(
    () => timeFilter === 'all' ? enriched : enriched.filter((m) => m.year === timeFilter),
    [enriched, timeFilter]
  );
  const filtered = useMemo(
    () => countryFilter === 'all'
      ? timeFiltered
      : timeFiltered.filter((m) => countryOf(m) === countryFilter),
    [timeFiltered, countryFilter]
  );
  const filteredUnlabeled = useMemo(() => filtered.filter((m) => !countryOf(m)), [filtered]);
  const timelineProgress = allYears.length <= 1
    ? 100
    : (rangeVal / (allYears.length - 1)) * 100;
  const firstYear = allYears[0];
  const lastYear = allYears[allYears.length - 1];
  const yearSpan = firstYear && lastYear ? Math.max(1, lastYear - firstYear) : 0;

  // --- 地图生命周期 ---
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const mapEventHandlers: Array<{ event: string; handler: () => void }> = [];
    const markBaseMapReady = () => setBaseMapReady(true);
    const readyFallbackTimer = window.setTimeout(markBaseMapReady, 2600);
    // 地区页初始展示亚洲尺度，优先呈现国家聚合与跨地区路径
    const map = L.map(containerRef.current, {
      center: [35, 100],
      zoom: 4,
      zoomControl: false,
      zoomAnimation: true,
      markerZoomAnimation: true,
      worldCopyJump: true,
      minZoom: 2,
      maxZoom: 14,
      attributionControl: true,
    });
    if (TILE_MODE === 'dark') {
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map);
    } else {
      // 高德 style=8 在 zoom 2 会返回近乎纯色的全图瓦片；
      // OSM 固定以 zoom 2 的世界底图作为兜底，缩放时也不会出现纯色空白。
      const fallbackTiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        minZoom: 2,
        maxZoom: 18,
        maxNativeZoom: 2,
        keepBuffer: 4,
        updateWhenZooming: false,
        updateWhenIdle: true,
        updateInterval: 120,
        zIndex: 0,
      });
      fallbackTiles.once('load', () => window.setTimeout(markBaseMapReady, 120)).addTo(map);

      // 高德瓦片：国内直连快、中文标注（webrd0{1-4}.is.autonavi.com）
      const amapTiles = L.tileLayer(
        'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
        {
          subdomains: '1234',
          attribution: '&copy; 高德地图',
          minZoom: 3,
          maxZoom: 18,
          keepBuffer: 4,
          updateWhenZooming: false,
          updateWhenIdle: true,
          updateInterval: 120,
          zIndex: 1,
        }
      );
      amapTiles.once('load', markBaseMapReady).addTo(map);
    }
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    mapRef.current = map;

    if (TILE_MODE === 'dark') {
      // 中文地名标注层：随缩放级别显示对应城市名（全中文）
      const labelLayer = L.layerGroup().addTo(map);
      const renderLabels = () => {
        labelLayer.clearLayers();
        const z = map.getZoom();
        for (const c of CITY_LABELS) {
          if (z < c.minZoom) continue;
          L.marker([c.lat, c.lng], {
            icon: L.divIcon({
              className: 'map-city-label-wrap',
              html: `<span class="map-city-label">${c.name}</span>`,
              iconSize: [0, 0],
            }),
          }).addTo(labelLayer);
        }
      };
      renderLabels();
      map.on('zoomend', renderLabels);
      mapEventHandlers.push({ event: 'zoomend', handler: renderLabels });
    }

    // 缩放/平移变化：触发气泡按新视口与缩放级别重建（自适应）
    const onZoomEnd = () => {
      if (map.getZoom() < CITY_ZOOM) {
        setViewCountry(null);
        setPanel(null);
      }
      setZoomTick((t) => t + 1);
    };
    map.on('zoomend', onZoomEnd);
    mapEventHandlers.push({ event: 'zoomend', handler: onZoomEnd });

    // 只监听 zoomend 会导致拖动到新区域后仍显示旧图片点位。
    const onMoveEnd = () => setZoomTick((t) => t + 1);
    map.on('moveend', onMoveEnd);
    mapEventHandlers.push({ event: 'moveend', handler: onMoveEnd });

    // 全屏/窗口尺寸变化后重新计算 Leaflet 视口，避免瓦片和图片标记错位。
    const onResize = () => {
      map.invalidateSize({ pan: false });
      setZoomTick((t) => t + 1);
    };
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(onResize)
      : null;
    resizeObserver?.observe(containerRef.current);
    window.addEventListener('resize', onResize);
    map.invalidateSize({ pan: false });
    return () => {
      mapEventHandlers.forEach(({ event, handler }) => map.off(event, handler));
      window.removeEventListener('resize', onResize);
      resizeObserver?.disconnect();
      window.clearTimeout(readyFallbackTimer);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // 地图内展开记忆时，持续将真实点位换算为屏幕坐标，供照片展开动画和虚线连接使用。
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedMemory) {
      setSelectedAnchor(null);
      return;
    }

    let cancelled = false;
    let selectedLatLng: L.LatLng | null = null;

    const updateAnchor = () => {
      if (!selectedLatLng || cancelled) return;
      const point = map.latLngToContainerPoint(selectedLatLng);
      const container = map.getContainer();
      setSelectedAnchor({ x: point.x, y: point.y });
      setMapViewport({ width: container.clientWidth, height: container.clientHeight });
    };

    const prepareAnchor = async () => {
      if (Number.isFinite(selectedMemory.lat) && Number.isFinite(selectedMemory.lng)) {
        selectedLatLng = L.latLng(selectedMemory.lat as number, selectedMemory.lng as number);
      } else {
        const fallback = await resolvePlace(countryOf(selectedMemory), cityOf(selectedMemory));
        if (cancelled || !fallback) return;
        selectedLatLng = L.latLng(fallback[0], fallback[1]);
      }
      updateAnchor();
      map.on('move', updateAnchor);
      map.on('zoom', updateAnchor);
      map.on('resize', updateAnchor);
    };

    prepareAnchor();
    return () => {
      cancelled = true;
      map.off('move', updateAnchor);
      map.off('zoom', updateAnchor);
      map.off('resize', updateAnchor);
    };
  }, [selectedMemory]);

  // --- 气泡构建：随缩放级别自适应层级 ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const previousLayer = layerRef.current;
    const nextLayer = L.layerGroup();

    let cancelled = false;

    const build = async () => {
      const zoom = map.getZoom();
      const handleCountryClick = (country: string, list: Memory[], coords: L.LatLngExpression) => {
        if (!isChinaCountry(country)) {
          setPanel(list.length === 1 ? null : { title: shortPlaceLabel(country), list });
          setViewCountry(null);
          if (list.length === 1) onSelectMemory(list[0]);
          return;
        }
        setPanel(null);
        setViewCountry(country);
        map.flyTo(coords, CITY_ZOOM, { duration: 0.8 });
      };

      const addForeignCountryMarkers = async () => {
        const foreignCountries = groupBy(filtered.filter((memory) => !isChinaCountry(countryOf(memory))), countryOf);
        const resolvedCountries = await mapWithConcurrency(
          Object.entries(foreignCountries),
          async ([country, list]) => ({ country, list, coords: averageMemoryCoordinates(list) || await resolvePlace(country) }),
        );
        for (const { country, list, coords } of resolvedCountries) {
          if (cancelled || !coords) continue;
          L.marker(coords, { icon: bubbleIcon(list[0].image, list.length, country, fallbackImageOf(list[0])) })
            .on('click', () => handleCountryClick(country, list, coords))
            .addTo(nextLayer);
        }
      };

      if (zoom < CITY_ZOOM) {
        // 层级 1（zoom < 5）：国家气泡
        const countries = groupBy(filtered, countryOf);
        const routePoints: Array<{ coords: L.LatLngExpression; order: number }> = [];
        const resolvedCountries = await mapWithConcurrency(
          Object.entries(countries),
          async ([country, list]) => ({
            country,
            list,
            coords: isChinaCountry(country)
              ? await resolvePlace(country)
              : averageMemoryCoordinates(list) || await resolvePlace(country),
          }),
        );
        for (const { country, list, coords } of resolvedCountries) {
          if (cancelled || !coords) continue;
          routePoints.push({
            coords,
            order: Math.min(...list.map((m) => Number(m.date.replaceAll('.', '')) || m.year)),
          });
          L.marker(coords, { icon: bubbleIcon(list[0].image, list.length, country, fallbackImageOf(list[0])) })
            .on('click', () => handleCountryClick(country, list, coords))
            .addTo(nextLayer);
        }
        if (routePoints.length > 1) {
          L.polyline(
            routePoints.sort((a, b) => a.order - b.order).map((point) => point.coords),
            {
              color: '#A88646',
              weight: 1.6,
              opacity: 0.72,
              dashArray: '2 7',
              lineCap: 'round',
              lineJoin: 'round',
              interactive: false,
            }
          ).addTo(nextLayer);
        }
      } else if (zoom < POINT_ZOOM) {
        // 海外地区保持国家级气泡，不因缩放或中国的层级钻取而消失。
        await addForeignCountryMarkers();

        // 层级 2（5 ≤ zoom < 9）：当前视野内城市气泡（同城记忆聚合）
        // 给气泡图标预留边缘空间，避免图片中心在视口边缘时被误判为不可见。
        const bounds = map.getBounds().pad(0.2);
        const chinaMemories = filtered.filter((memory) => isChinaCountry(countryOf(memory)));
        const cities = groupBy(chinaMemories, cityOf);
        const routePoints: Array<{ coords: L.LatLngExpression; order: number }> = [];
        const resolvedCities = await mapWithConcurrency(
          Object.entries(cities),
          async ([city, list]) => {
            const country = countryOf(list[0]);
            return { city, list, country, coords: await resolvePlace(country, city) };
          },
        );
        for (const { city, list, country, coords } of resolvedCities) {
          if (cancelled || !coords) continue;
          if (!bounds.contains(coords)) continue;
          routePoints.push({
            coords,
            order: Math.min(...list.map((m) => Number(m.date.replaceAll('.', '')) || m.year)),
          });
          L.marker(coords, { icon: bubbleIcon(list[0].image, list.length, city, fallbackImageOf(list[0])) })
            .on('click', () => {
              setPanel({ title: city, list });
              map.flyTo(coords, POINT_ZOOM, { duration: 0.8 });
            })
            .addTo(nextLayer);
        }
        if (routePoints.length > 1) {
          L.polyline(
            routePoints.sort((a, b) => a.order - b.order).map((point) => point.coords),
            {
              color: '#A88646',
              weight: 1.4,
              opacity: 0.62,
              dashArray: '2 7',
              lineCap: 'round',
              lineJoin: 'round',
              interactive: false,
            }
          ).addTo(nextLayer);
        }
      } else {
        // 海外地区仍保持国家级气泡，中国才进入精确点位层级。
        await addForeignCountryMarkers();

        // 层级 3（zoom ≥ 9）：视野内有坐标记忆的精确点位；
        // 没有精确坐标的记忆回退到城市坐标，避免放大后整条记忆消失；
        // 同坐标多条记忆按屏幕像素半径展开成环，避免完全重叠堆叠
        // 给气泡图标预留边缘空间，避免图片中心在视口边缘时被误判为不可见。
        const bounds = map.getBounds().pad(0.2);
        const byCoord = new Map<string, Memory[]>();
        const chinaMemories = filtered.filter((memory) => isChinaCountry(countryOf(memory)));
        const resolvedPoints = await mapWithConcurrency<
          Memory,
          { memory: Memory; lat: number | null; lng: number | null }
        >(chinaMemories, async (m) => {
          let lat = m.lat;
          let lng = m.lng;
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            const fallbackCoords = await resolvePlace(countryOf(m), cityOf(m));
            if (!fallbackCoords) return { memory: m, lat: null, lng: null };
            [lat, lng] = fallbackCoords;
          }
          return { memory: m, lat: lat as number, lng: lng as number };
        });
        for (const { memory: m, lat, lng } of resolvedPoints) {
          if (cancelled) return;
          if (lat === null || lng === null) continue;
          if (!bounds.contains([lat, lng])) continue;
          const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
          const list = byCoord.get(key);
          if (list) list.push(m);
          else byCoord.set(key, [m]);
        }
        // 展开半径：固定屏幕像素（约 28px），换算成当前缩放下的度数，保证任意 zoom 都能错开
        const pxPerDeg = (256 * Math.pow(2, map.getZoom())) / 360;
        const spreadDeg = 28 / pxPerDeg;
        for (const [key, list] of byCoord) {
          const [lat, lng] = key.split(',').map(Number);
          if (list.length === 1) {
            L.marker([lat, lng], { icon: bubbleIcon(list[0].image, 1, list[0].title, fallbackImageOf(list[0])) })
              .on('click', () => {
                setPanel(null);
                onSelectMemory(list[0]);
              })
              .addTo(nextLayer);
            continue;
          }
          const n = list.length;
          const angleStep = (2 * Math.PI) / n;
          // 用记忆坐标生成稳定起始角度，重建气泡层时不会产生跳动。
          const startAngle = (stableHash(key) % 360) * (Math.PI / 180);
          const lngScale = Math.cos((lat * Math.PI) / 180) || 0.5;
          list.forEach((m, i) => {
            const a = startAngle + i * angleStep;
            const dLat = Math.cos(a) * spreadDeg;
            const dLng = (Math.sin(a) * spreadDeg) / lngScale;
            L.marker([lat + dLat, lng + dLng], { icon: bubbleIcon(m.image, 1, m.title, fallbackImageOf(m)) })
              .on('click', () => {
                setPanel(null);
                onSelectMemory(m);
              })
              .addTo(nextLayer);
          });
        }
      }
    };

    build().then(() => {
      if (cancelled) {
        nextLayer.clearLayers();
        return;
      }

      nextLayer.addTo(map);
      layerRef.current = nextLayer;
      if (previousLayer && map.hasLayer(previousLayer)) {
        map.removeLayer(previousLayer);
        previousLayer.clearLayers();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [zoomTick, filtered]);

  const backToWorld = () => {
    setPanel(null);
    setViewCountry(null);
    mapRef.current?.flyTo([35, 100], CITY_ZOOM - 1, { duration: 0.8 });
  };

  const handleTimeSliderInput = (e: FormEvent<HTMLInputElement>) => {
    const index = Number(e.currentTarget.value);
    setRangeVal(index);
    const year = allYears[index];
    if (typeof year === 'number') setTimeFilter(year);
  };

  return (
    <div className="h-screen w-screen relative overflow-hidden bg-[#dbe3e8] text-[#2E2C28]">
      {/* 瓦片首屏占位：先给用户稳定的地图轮廓，真实瓦片就绪后淡出。 */}
      <div
        className={`map-loading-poster absolute inset-0 z-[1] ${baseMapReady ? 'is-ready' : ''}`}
        aria-hidden="true"
      />
      {/* 地图本体 */}
      <div ref={containerRef} className="map-editorial-canvas absolute inset-0 z-0" />

      {/* 页面标题与地区层级 */}
      <header
        className={`pointer-events-none absolute z-[1002] text-[#302F2B] ${
          selectedMemory ? 'left-[82px] top-8' : 'map-page-heading left-[112px] top-8'
        }`}
      >
        {selectedMemory ? (
          <nav className="pointer-events-auto flex items-center gap-2 font-editorial-serif text-[13px] tracking-[0.12em] text-[#7E6230]" aria-label="地点层级">
            <button type="button" onClick={onCloseMemory} className="transition-colors hover:text-[#513B1C] cursor-pointer">足迹</button>
            {[selectedMemory.country, selectedMemory.city, selectedMemory.location?.name]
              .map((part) => part?.trim())
              .filter((part, index, list): part is string => Boolean(part) && list.indexOf(part) === index)
              .map((part) => <span key={part}>/ {part}</span>)}
          </nav>
        ) : (
          <>
            <div className="pointer-events-auto flex items-center gap-2 font-editorial-serif text-[11px] tracking-[0.16em] text-[#927846]">
              <button type="button" onClick={backToWorld} className="transition-colors hover:text-[#6F572E] cursor-pointer">
                MEMORIES / PLACES
              </button>
              {viewCountry && <span>/ {viewCountry}</span>}
            </div>
            <h1 className="font-editorial-serif mt-2 text-[38px] leading-none tracking-[0.08em] sm:text-[48px]">
              走过的地方
            </h1>
            <p className="mt-3 text-[12px] tracking-[0.1em] text-[#4F4C45]">
              {enriched.length} 段记忆&nbsp;&nbsp;·&nbsp;&nbsp;{availableCountries.length} 个国家&nbsp;&nbsp;·&nbsp;&nbsp;{yearSpan} 年
            </p>
          </>
        )}
      </header>

      {/* 顶部时间与地区筛选 */}
      {!selectedMemory && <div className="absolute right-5 top-6 z-[1002] flex items-start gap-2.5">
        <div className="relative">
          <button
            id="btn-toggle-map-time"
            type="button"
            onClick={() => {
              setTimeMenuOpen((open) => !open);
              setFilterMenuOpen(false);
            }}
            aria-label="选择时间"
            aria-expanded={timeMenuOpen}
            className="flex h-10 items-center gap-2 rounded-full border border-[#AFA99B]/65 bg-[#FAF7EF]/94 px-4 text-[12px] text-[#37352F] shadow-[0_5px_16px_rgba(52,48,41,0.14)] backdrop-blur-md transition-colors hover:bg-white cursor-pointer"
          >
            <CalendarDays className="h-4 w-4" strokeWidth={1.6} />
            <span>{timeFilter === 'all' ? '全部时间' : `${timeFilter} 年`}</span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${timeMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          <AnimatePresence>
            {timeMenuOpen && (
              <motion.div
                initial={{ y: -6, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -4, opacity: 0 }}
                className="absolute right-0 mt-2 w-36 overflow-hidden rounded-xl border border-[#B8B1A2]/65 bg-[#FAF7EF]/98 p-1.5 shadow-[0_12px_30px_rgba(50,46,39,0.18)] backdrop-blur-md"
              >
                <button
                  type="button"
                  onClick={() => {
                    setTimeFilter('all');
                    setTimeMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[11px] hover:bg-[#EDE7DA] cursor-pointer"
                >
                  全部时间
                  {timeFilter === 'all' && <Check className="h-3.5 w-3.5 text-[#9B7A38]" />}
                </button>
                {allYears.map((year) => (
                  <button
                    key={year}
                    type="button"
                    onClick={() => {
                      setTimeFilter(year);
                      setTimeMenuOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left font-mono text-[11px] hover:bg-[#EDE7DA] cursor-pointer"
                  >
                    {year}
                    {timeFilter === year && <Check className="h-3.5 w-3.5 text-[#9B7A38]" />}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative">
          <button
            id="btn-toggle-map-filter"
            type="button"
            onClick={() => {
              setFilterMenuOpen((open) => !open);
              setTimeMenuOpen(false);
            }}
            aria-label="筛选地区"
            aria-expanded={filterMenuOpen}
            className="flex h-10 items-center gap-2 rounded-full border border-[#AFA99B]/65 bg-[#FAF7EF]/94 px-4 text-[12px] text-[#37352F] shadow-[0_5px_16px_rgba(52,48,41,0.14)] backdrop-blur-md transition-colors hover:bg-white cursor-pointer"
          >
            <Filter className="h-4 w-4" strokeWidth={1.6} />
            <span>{countryFilter === 'all' ? '筛选' : countryFilter}</span>
          </button>
          <AnimatePresence>
            {filterMenuOpen && (
              <motion.div
                initial={{ y: -6, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -4, opacity: 0 }}
                className="absolute right-0 mt-2 w-40 overflow-hidden rounded-xl border border-[#B8B1A2]/65 bg-[#FAF7EF]/98 p-1.5 shadow-[0_12px_30px_rgba(50,46,39,0.18)] backdrop-blur-md"
              >
                <button
                  type="button"
                  onClick={() => {
                    setCountryFilter('all');
                    setFilterMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[11px] hover:bg-[#EDE7DA] cursor-pointer"
                >
                  全部地区
                  {countryFilter === 'all' && <Check className="h-3.5 w-3.5 text-[#9B7A38]" />}
                </button>
                {availableCountries.map((country) => (
                  <button
                    key={country}
                    type="button"
                    onClick={() => {
                      setCountryFilter(country);
                      setFilterMenuOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[11px] hover:bg-[#EDE7DA] cursor-pointer"
                  >
                    {country}
                    {countryFilter === country && <Check className="h-3.5 w-3.5 text-[#9B7A38]" />}
                  </button>
                ))}
                {filteredUnlabeled.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setPanel({ title: '未标注地区', list: filteredUnlabeled });
                      setFilterMenuOpen(false);
                    }}
                    className="mt-1 flex w-full items-center gap-2 border-t border-[#D4CDBF] px-3 pt-2.5 pb-2 text-left text-[10px] text-[#756F63] hover:text-[#9B7A38] cursor-pointer"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    未标注地区（{filteredUnlabeled.length}）
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>}

      {/* 设计稿中的浅色主时间轴，始终作为地区页第二视觉重心 */}
      {allYears.length > 0 && !selectedMemory && (
        <motion.section
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          aria-label="地区记忆时间轴"
          className="map-timeline-panel absolute bottom-6 left-[calc(50%+43px)] z-[1000] w-[calc(100vw-130px)] max-w-[900px] -translate-x-1/2 overflow-hidden rounded-2xl border border-[#B9B1A2]/70 bg-[#FAF7EF]/95 text-[#302E29] shadow-[0_14px_36px_rgba(67,61,51,0.2)] backdrop-blur-lg"
        >
          <div className="grid min-h-[126px] grid-cols-[112px_minmax(0,1fr)_78px] items-center gap-4 px-5 py-4 sm:grid-cols-[160px_minmax(0,1fr)_106px] sm:gap-6 sm:px-8">
            <div>
              <h2 className="font-editorial-serif text-[24px] leading-none tracking-[0.05em] sm:text-[30px]" aria-live="polite">
                {timeFilter === 'all' ? '全部时光' : timeFilter}
              </h2>
              <p className="mt-3 text-[11px] tracking-[0.08em] text-[#655F55]">{filtered.length} 段记忆</p>
            </div>

            <div className="min-w-0">
              <div className="relative">
                <div className="pointer-events-none absolute inset-x-[11px] top-1/2 flex -translate-y-1/2 items-center justify-between">
                  {allYears.map((year) => (
                    <span key={year} className="h-1.5 w-1.5 rounded-full bg-[#A98A4A]/55" />
                  ))}
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, allYears.length - 1)}
                  step={1}
                  value={rangeVal}
                  onInput={handleTimeSliderInput}
                  onChange={handleTimeSliderInput}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="map-timeline-range relative z-10 w-full"
                  style={{
                    touchAction: 'none',
                    '--timeline-progress': `${timelineProgress}%`,
                  } as CSSProperties}
                  aria-label="按年份筛选"
                  aria-valuetext={allYears[rangeVal] ? `${allYears[rangeVal]} 年` : undefined}
                />
              </div>
              <div className="mt-1 flex items-center justify-between font-mono text-[9px] text-[#615C52] sm:text-[10px]">
                {allYears.map((year) => (
                  <button
                    key={year}
                    type="button"
                    onClick={() => setTimeFilter(year)}
                    className={`transition-colors cursor-pointer ${timeFilter === year ? 'font-bold text-[#9B762E]' : 'hover:text-[#9B762E]'}`}
                  >
                    {year}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex h-16 items-center justify-end border-l border-[#CFC7B8] pl-3 sm:pl-5">
              <button
                type="button"
                onClick={() => setPanel({ title: timeFilter === 'all' ? '全部记忆' : `${timeFilter} 年`, list: filtered })}
                className="flex items-center gap-1.5 whitespace-nowrap text-[10px] tracking-[0.08em] text-[#514D45] transition-colors hover:text-[#9B762E] cursor-pointer sm:text-[11px]"
              >
                <List className="h-3.5 w-3.5 sm:hidden" />
                <span className="hidden sm:inline">查看列表</span>
                <ChevronDown className="hidden h-3.5 w-3.5 -rotate-90 sm:block" />
              </button>
            </div>
          </div>
        </motion.section>
      )}

      {/* 城市 / 未标注记忆面板 */}
      <AnimatePresence>
        {panel !== null && !selectedMemory && (
          <motion.aside
            initial={{ x: 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 320, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 260 }}
            className="absolute top-0 right-0 z-[1003] h-full w-[300px] overflow-y-auto border-l border-[#BDB5A7] bg-[#F8F4EA]/96 text-[#302E29] shadow-[-16px_0_36px_rgba(55,50,42,0.14)] backdrop-blur-md"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#D2CABD] bg-[#F8F4EA]/96 px-4 py-4 backdrop-blur-md">
              <h3 className="font-editorial-serif flex items-center gap-1.5 text-sm font-bold">
                <MapPin className="h-4 w-4 text-[#A5823D]" />
                {panel.title}
                <span className="font-mono text-[10px] font-normal text-[#7A746A]">
                  {panel.list.length} 条
                </span>
              </h3>
              <button
                onClick={() => setPanel(null)}
                className="rounded-full p-1 text-[#7A746A] transition-colors hover:bg-[#E9E3D7] hover:text-[#302E29] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-3 space-y-2.5">
              {panel.list.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setPanel(null);
                    onSelectMemory(m);
                  }}
                  className="group flex w-full gap-3 rounded-lg border border-[#D8D0C2] bg-white/45 p-2.5 text-left transition-colors hover:border-[#A98A4A]/70 hover:bg-white/70 cursor-pointer"
                >
                    <img
                      src={m.image || fallbackImageOf(m) || ''}
                      alt={m.title}
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        const fallback = fallbackImageOf(m);
                        if (fallback && !e.currentTarget.dataset.fallbackApplied) {
                          e.currentTarget.dataset.fallbackApplied = '1';
                          e.currentTarget.src = fallback;
                        } else {
                          e.currentTarget.style.visibility = 'hidden';
                        }
                      }}
                      className="h-14 w-14 shrink-0 rounded-md bg-[#DDD5C6] object-cover transition-transform group-hover:scale-[1.03]"
                    />
                  <div className="min-w-0 flex flex-col justify-center">
                    <div className="font-editorial-serif line-clamp-1 text-xs font-semibold">{m.title}</div>
                    <div className="mt-1 font-mono text-[10px] text-[#7A746A]">
                      {m.date}
                      {m.tag ? ` · ${m.tag}` : ''}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedMemory && (
          <MapMemoryOverlay
            memory={selectedMemory}
            anchor={selectedAnchor}
            viewport={mapViewport}
            onClose={onCloseMemory}
            onUpdateMemory={onUpdateMemory}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
