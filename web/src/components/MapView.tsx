import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Check, ChevronLeft, History, List, MapPin, Plus } from 'lucide-react';
import { Memory, type MemoryFilters } from '../types';
import { resolvePlace, geocodeAddress } from '../lib/geo';
import { CITY_LABELS } from '../lib/labels';
import {
  EMPTY_MEMORY_FILTERS,
  filterMemories,
  isMemoryFiltersActive,
} from '../lib/memoryFilters';
import {
  currentRegionForViewport,
  provinceForCity,
  type ViewportRegion,
  type ViewportRegionCandidate,
} from '../lib/mapViewportRegion';
import MapMemoryOverlay from './MapMemoryOverlay';
import CrystalTimeline from './CrystalTimeline';

// 底图模式：'amap' = 高德瓦片（国内直连、中文标注、浅色）；'dark' = CARTO 深色无标注 + 自绘中文标注层
const TILE_MODE: 'amap' | 'dark' = 'amap';

// 自适应层级阈值：zoom < CITY_ZOOM → 国家气泡；CITY_ZOOM ≤ zoom < POINT_ZOOM → 城市气泡；zoom ≥ POINT_ZOOM → 具体点位
const CITY_ZOOM = 5;
const POINT_ZOOM = 9;
// 最远只保留东亚级概览，避免缩小到重复的完整世界底图。
const MIN_OVERVIEW_ZOOM = 3;

interface MapViewProps {
  memories: Memory[];
  filteredMemories?: Memory[];
  filters?: MemoryFilters;
  onFiltersChange?: (filters: MemoryFilters) => void;
  selectedMemory: Memory | null;
  onSelectMemory: (m: Memory) => void;
  onCloseMemory: () => void;
  onSaveMemory?: (memory: Memory) => Promise<void>;
  onDeleteMemory?: (id: string) => Promise<void>;
  onLoadOriginalPhoto?: (photoId: string) => Promise<string>;
  onAddMemory?: () => void;
  isFirstMemory?: boolean;
  firstMemoryFeedback?: Memory | null;
  onDismissFirstMemoryFeedback?: () => void;
  onLock?: () => void;
  onOpenRecall?: () => void;
  readerMode?: 'reflection' | 'journal';
}

type RegionFocus = ViewportRegion;

const countryOf = (m: Memory): string => m.country?.trim() || '';
// 城市气泡只能使用行政城市字段；地点名可能是街道或景点，不能冒充城市标签。
const cityOf = (m: Memory): string => m.city?.trim() || '';
const cityGroupOf = (m: Memory): string => cityOf(m) || '未标注城市';

const THEME_OPTIONS = [
  { value: 'travel' as const, label: '旅行' },
  { value: 'growth' as const, label: '成长' },
  { value: 'motorcycle' as const, label: '日常' },
  { value: 'photography' as const, label: '日常 · 瞬间' },
];

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

function bubbleIcon(img: string, count: number, label: string, fallback?: string, selected = false): L.DivIcon {
  const primary = mapImageUrl(img || fallback || '');
  const fallbackUrl = fallback ? mapImageUrl(fallback) : undefined;
  const visibleLabel = shortPlaceLabel(label);
  const fallbackHandler = fallbackUrl && fallbackUrl !== primary
    ? `this.onerror=null;this.src=${JSON.stringify(fallbackUrl)}`
    : 'this.style.display="none"';

  return L.divIcon({
    className: 'map-bubble-wrap',
    html: `
      <div class="map-bubble${selected ? ' is-selected' : ''}">
        <img src="${escHtml(primary)}" referrerpolicy="no-referrer" alt="" decoding="async" onerror="${escHtml(fallbackHandler)}" />
        ${count > 1 ? `<span class="map-bubble-count">${count}</span>` : ''}
        <span class="map-bubble-label">${escHtml(visibleLabel)}</span>
      </div>
    `,
    iconSize: [76, 76],
    iconAnchor: [38, 38],
  });
}

function yearRangeOf(memories: Memory[]): string {
  const years = memories.map((memory) => memory.year).filter(Number.isFinite).sort((left, right) => left - right);
  if (years.length === 0) return '未标注时间';
  return years[0] === years[years.length - 1] ? String(years[0]) : `${years[0]}-${years[years.length - 1]}`;
}

function placeOf(memory: Memory): string {
  // 结果列表优先使用城市与行政区；国家、街道与景点不抢占主地点。
  return [memory.city, memory.detailLocation]
    .map((part) => part?.trim())
    .filter((part, index, list): part is string => Boolean(part) && list.indexOf(part) === index)
    .join(' · ') || memory.country?.trim() || memory.location?.name?.trim() || '未标注地点';
}

export default function MapView({
  memories,
  filteredMemories: controlledFilteredMemories,
  filters: controlledFilters,
  onFiltersChange,
  selectedMemory,
  onSelectMemory,
  onCloseMemory,
  onSaveMemory,
  onDeleteMemory,
  onLoadOriginalPhoto,
  onAddMemory,
  isFirstMemory = false,
  firstMemoryFeedback,
  onDismissFirstMemoryFeedback,
  onOpenRecall,
  readerMode,
}: MapViewProps) {
  const crystalMapCenter: L.LatLngExpression = [35, 100];
  const crystalMapZoom = 4;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const [baseMapReady, setBaseMapReady] = useState(false);
  const [selectedAnchor, setSelectedAnchor] = useState<{ x: number; y: number } | null>(null);
  const [mapViewport, setMapViewport] = useState({ width: window.innerWidth, height: window.innerHeight });

  const [focusedRegion, setFocusedRegion] = useState<RegionFocus | null>(null);
  const [viewportRegionCandidates, setViewportRegionCandidates] = useState<ViewportRegionCandidate[]>([]);
  const [isResultListOpen, setIsResultListOpen] = useState(false);
  const [enriched, setEnriched] = useState<Memory[]>(memories);
  // zoom 变化后 +1，触发气泡按当前缩放级别重建（自适应层级）
  const [zoomTick, setZoomTick] = useState(0);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [showFirstMemoryPrompt, setShowFirstMemoryPrompt] = useState(isFirstMemory);
  const [localFilters, setLocalFilters] = useState<MemoryFilters>(EMPTY_MEMORY_FILTERS);

  const activeFilters = controlledFilters ?? localFilters;
  const updateFilters = (patch: Partial<MemoryFilters>) => {
    const next = { ...activeFilters, ...patch };
    if (onFiltersChange) onFiltersChange(next);
    else setLocalFilters(next);
  };

  useEffect(() => {
    setShowFirstMemoryPrompt(isFirstMemory);
  }, [isFirstMemory]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !firstMemoryFeedback) return;

    let cancelled = false;
    const focusNewMemory = async () => {
      const coordinates = Number.isFinite(firstMemoryFeedback.lat) && Number.isFinite(firstMemoryFeedback.lng)
        ? [firstMemoryFeedback.lat as number, firstMemoryFeedback.lng as number] as L.LatLngExpression
        : await resolvePlace(countryOf(firstMemoryFeedback), cityOf(firstMemoryFeedback));
      if (!cancelled && coordinates) map.flyTo(coordinates, POINT_ZOOM, { duration: 0.85 });
    };
    void focusNewMemory();

    return () => {
      cancelled = true;
    };
  }, [firstMemoryFeedback]);

  // 全部可用年份作为滑块的固定刻度；不能从 filtered 计算，否则选中一年后滑块会塌缩成单值
  const allYears: number[] = useMemo(
    () => Array.from(new Set<number>(enriched.map((m) => m.year))).sort((a, b) => a - b),
    [enriched]
  );

  // 只填了「地点」没填「国家」的记忆：地理编码自动归组到国家/城市气泡（结果有 localStorage 缓存）
  useEffect(() => {
    setEnriched(memories);
    let cancelled = false;
    const run = async () => {
      const out = [...memories];
      let changed = false;
      for (let i = 0; i < out.length; i++) {
        const m = out[i];
        if (!m.city?.trim() && m.location?.name?.trim()) {
          const geo = await geocodeAddress(m.location.name);
          if (geo?.city && !cancelled) {
            out[i] = {
              ...m,
              country: m.country?.trim() || geo.country,
              city: geo.city,
              lat: m.lat ?? geo.lat,
              lng: m.lng ?? geo.lng,
            };
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

  // A settled viewport is resolved from all available memories, not from the
  // active time/theme result. A date filter must not make a China-wide map
  // pretend that it is already focused on the one remaining city.
  useEffect(() => {
    let cancelled = false;
    const resolveViewportCandidates = async () => {
      const resolved = await mapWithConcurrency<Memory, ViewportRegionCandidate | null>(
        enriched.filter((memory) => Boolean(countryOf(memory))),
        async (memory): Promise<ViewportRegionCandidate | null> => {
          if (Number.isFinite(memory.lat) && Number.isFinite(memory.lng)) {
            return {
              country: countryOf(memory),
              city: cityOf(memory) || undefined,
              lat: memory.lat as number,
              lng: memory.lng as number,
            };
          }
          const coordinates = await resolvePlace(countryOf(memory), cityOf(memory) || undefined);
          if (!coordinates) return null;
          return {
            country: countryOf(memory),
            city: cityOf(memory) || undefined,
            lat: coordinates[0],
            lng: coordinates[1],
          };
        },
      );
      if (!cancelled) {
        setViewportRegionCandidates(
          resolved.filter((candidate): candidate is ViewportRegionCandidate => candidate !== null),
        );
      }
    };
    void resolveViewportCandidates();
    return () => {
      cancelled = true;
    };
  }, [enriched]);

  const availableCountries = useMemo(
    () => Array.from(new Set(enriched.map(countryOf).filter(Boolean))).sort(),
    [enriched]
  );

  // These are map destinations, deliberately separate from the region filter.
  // Once the movement settles, the viewport resolver owns currentRegion.
  const availableCityLocations = useMemo(() => {
    const entries = new Map<string, { country: string; city: string }>();
    for (const memory of enriched) {
      const country = countryOf(memory);
      const city = cityOf(memory);
      if (country && city) entries.set(`${country}/${city}`, { country, city });
    }
    return Array.from(entries.values()).sort((left, right) => (
      left.country === right.country
        ? left.city.localeCompare(right.city, 'zh-CN')
        : left.country.localeCompare(right.country, 'zh-CN')
    ));
  }, [enriched]);

  // App owns the canonical result. Prototype callers without the controlled
  // result still get the same filtering semantics locally.
  const localFiltered = useMemo(
    () => filterMemories(enriched, activeFilters),
    [enriched, activeFilters]
  );
  const filtered = controlledFilteredMemories ?? localFiltered;
  const filteredUnlabeled = useMemo(() => filtered.filter((m) => !countryOf(m)), [filtered]);
  const filtersActive = isMemoryFiltersActive(activeFilters);
  const contextMemories = useMemo(() => {
    if (!focusedRegion) return filtered;
    return filtered.filter((memory) => (
      focusedRegion.scope === 'country'
        ? countryOf(memory) === focusedRegion.country
        : focusedRegion.scope === 'province'
          ? countryOf(memory) === focusedRegion.country && provinceForCity(countryOf(memory), cityOf(memory)) === focusedRegion.name
          : countryOf(memory) === focusedRegion.country && cityOf(memory) === focusedRegion.name
    ));
  }, [filtered, focusedRegion]);
  const contextTitle = focusedRegion ? shortPlaceLabel(focusedRegion.name) : '全部地区';
  const contextRange = yearRangeOf(contextMemories);

  // --- 地图生命周期 ---
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const mapEventHandlers: Array<{ event: string; handler: () => void }> = [];
    const markBaseMapReady = () => setBaseMapReady(true);
    const readyFallbackTimer = window.setTimeout(markBaseMapReady, 2600);
    // 地区页初始展示亚洲尺度，优先呈现国家聚合与跨地区路径
    const map = L.map(containerRef.current, {
      center: crystalMapCenter,
      zoom: crystalMapZoom,
      zoomControl: false,
      zoomAnimation: true,
      markerZoomAnimation: true,
      worldCopyJump: true,
      minZoom: MIN_OVERVIEW_ZOOM,
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
    const onZoomEnd = () => setZoomTick((t) => t + 1);
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
    setZoomTick((t) => t + 1);
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

  // Leaflet only reports a stable viewport after moveend/zoomend. Delaying the
  // calculation avoids flicker while the user is still dragging or pinching.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const timer = window.setTimeout(() => {
      const bounds = map.getBounds();
      const nextRegion = currentRegionForViewport(map.getZoom(), {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      }, viewportRegionCandidates);
      setFocusedRegion((previous) => (
        previous?.name === nextRegion?.name &&
        previous?.scope === nextRegion?.scope &&
        previous?.country === nextRegion?.country
          ? previous
          : nextRegion
      ));
    }, 160);
    return () => window.clearTimeout(timer);
  }, [zoomTick, viewportRegionCandidates]);

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
      const handleCountryClick = (country: string, coords: L.LatLngExpression) => {
        // The viewport idle handler owns currentRegion. Marker clicks only
        // move the map, so manual drill-down and hand panning share one path.
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
          L.marker(coords, { icon: bubbleIcon(list[0].image, list.length, country, fallbackImageOf(list[0]), focusedRegion?.name === country) })
            .on('click', () => handleCountryClick(country, coords))
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
          L.marker(coords, { icon: bubbleIcon(list[0].image, list.length, country, fallbackImageOf(list[0]), focusedRegion?.name === country) })
            .on('click', () => handleCountryClick(country, coords))
            .addTo(nextLayer);
        }
        if (routePoints.length > 1) {
          L.polyline(
            routePoints.sort((a, b) => a.order - b.order).map((point) => point.coords),
            {
              className: 'map-memory-route',
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
        const cities = groupBy(chinaMemories, cityGroupOf);
        const routePoints: Array<{ coords: L.LatLngExpression; order: number }> = [];
        const resolvedCities = await mapWithConcurrency(
          Object.entries(cities),
          async ([city, list]) => {
            const country = countryOf(list[0]);
            const cityForCoordinates = city === '未标注城市' ? undefined : city;
            return {
              city,
              list,
              country,
              coords: averageMemoryCoordinates(list) || await resolvePlace(country, cityForCoordinates),
            };
          },
        );
        for (const { city, list, country, coords } of resolvedCities) {
          if (cancelled || !coords) continue;
          if (!bounds.contains(coords)) continue;
          routePoints.push({
            coords,
            order: Math.min(...list.map((m) => Number(m.date.replaceAll('.', '')) || m.year)),
          });
          L.marker(coords, { icon: bubbleIcon(list[0].image, list.length, city, fallbackImageOf(list[0]), focusedRegion?.name === city) })
            .on('click', () => {
              map.flyTo(coords, POINT_ZOOM, { duration: 0.8 });
            })
            .addTo(nextLayer);
        }
        if (routePoints.length > 1) {
          L.polyline(
            routePoints.sort((a, b) => a.order - b.order).map((point) => point.coords),
            {
              className: 'map-memory-route',
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
                setIsResultListOpen(false);
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
                setIsResultListOpen(false);
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
  }, [zoomTick, filtered, filtersActive, focusedRegion]);

  const backToWorld = () => {
    setFocusedRegion(null);
    mapRef.current?.flyTo([35, 100], CITY_ZOOM - 1, { duration: 0.8 });
  };

  const navigateToRegion = async (country: string, city?: string) => {
    const map = mapRef.current;
    if (!map) return;
    setFilterMenuOpen(false);
    const regionMemories = enriched.filter((memory) => (
      countryOf(memory) === country && (!city || cityOf(memory) === city)
    ));
    const coordinates = averageMemoryCoordinates(regionMemories) || await resolvePlace(country, city);
    if (!coordinates) return;
    map.flyTo(coordinates, city ? POINT_ZOOM : CITY_ZOOM, { duration: 0.8 });
  };

  return (
    <div className="map-experience-root h-screen w-screen relative overflow-hidden">
      {/* 瓦片首屏占位：先给用户稳定的地图轮廓，真实瓦片就绪后淡出。 */}
      <div
        className={`map-loading-poster absolute inset-0 z-[1] ${baseMapReady ? 'is-ready' : ''}`}
        aria-hidden="true"
      />
      {/* 地图本体 */}
      {/* Leaflet 会在此节点运行时追加 class；React className 必须保持静态。 */}
      <div ref={containerRef} className="map-editorial-canvas absolute inset-0 z-0" />

      {isFirstMemory && showFirstMemoryPrompt && !selectedMemory && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="map-first-memory-prompt absolute left-1/2 top-1/2 z-[1002] w-[min(420px,calc(100%-40px))] -translate-x-1/2 -translate-y-1/2 text-center"
        >
          <p className="map-first-memory-kicker">你的足迹</p>
          <h2>你的记忆地图还没有被点亮</h2>
          <p>从一张照片开始，把一段经历放回它发生的时间和地点。</p>
          <div>
            <button type="button" onClick={onAddMemory} className="map-first-memory-primary">创建第一段记忆</button>
            <button type="button" onClick={() => setShowFirstMemoryPrompt(false)} className="map-first-memory-secondary">稍后再说</button>
          </div>
        </motion.section>
      )}

      {firstMemoryFeedback && !selectedMemory && (
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="map-first-memory-feedback absolute bottom-24 left-1/2 z-[1002] w-[min(500px,calc(100%-40px))] -translate-x-1/2"
        >
          <div>
            <h2>第一段记忆已经回到它发生的地方。</h2>
            <p>时间轴已定位到 {firstMemoryFeedback.year} 年；现在它会和地图一起保存下来。</p>
          </div>
          <div className="map-first-memory-feedback-actions">
            <button type="button" onClick={() => { onDismissFirstMemoryFeedback?.(); onAddMemory?.(); }} className="map-first-memory-secondary">继续添加</button>
            <button type="button" onClick={() => { onDismissFirstMemoryFeedback?.(); onSelectMemory(firstMemoryFeedback); }} className="map-first-memory-primary">查看记忆</button>
          </div>
        </motion.section>
      )}

      {isResultListOpen && !selectedMemory && <div className="map-region-focus absolute inset-0 z-[1001]" aria-hidden="true" />}

      {/* 页面标题与地区层级 */}
      <header
        className="map-ui-header pointer-events-none absolute left-[96px] top-8 z-[1002]"
      >
        {selectedMemory ? (
          <nav className="map-ui-accent pointer-events-auto flex items-center gap-2 font-editorial-serif text-[13px] tracking-[0.12em]" aria-label="地点层级">
            <button type="button" onClick={onCloseMemory} className="map-ui-accent-hover transition-colors cursor-pointer">足迹</button>
            {[selectedMemory.country, selectedMemory.city, selectedMemory.detailLocation]
              .map((part) => part?.trim())
              .filter((part, index, list): part is string => Boolean(part) && list.indexOf(part) === index)
              .map((part) => <span key={part}>/ {part}</span>)}
          </nav>
        ) : (
          <section className="map-context-card pointer-events-auto" aria-label="当前足迹范围">
            <p>足迹 / {contextTitle}</p>
            <h1>{contextTitle}</h1>
            <span>{contextMemories.length} 段记忆 · {contextRange}</span>
          </section>
        )}
      </header>

      {/* 回顾是全局浏览方式；地区筛选和当前结果列表各自保持独立职责。 */}
      {!selectedMemory && <div className="absolute right-24 top-9 z-[1002] flex items-start gap-2">
        {onOpenRecall && <button type="button" onClick={onOpenRecall} className="map-recall-crystal" aria-label="进入回顾">
          <History className="h-4 w-4" strokeWidth={1.6} />
          <span>回顾</span>
        </button>}
        <div className="relative">
          <button id="btn-toggle-map-filter" type="button" onClick={() => setFilterMenuOpen((open) => !open)} aria-label="打开地区与主题筛选" aria-expanded={filterMenuOpen} className="map-region-filter-trigger">
            <MapPin className="h-4 w-4" strokeWidth={1.6} />
            <span>{contextTitle}</span>
            {filtersActive && <i aria-label="筛选已启用" />}
          </button>
          <AnimatePresence>
            {filterMenuOpen && <motion.div initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -4, opacity: 0 }} className="map-ui-popover absolute right-0 mt-2 w-64 overflow-hidden rounded-xl border p-3 backdrop-blur-md">
              <div className="mb-2 flex items-center justify-between"><span className="font-editorial-serif text-sm">筛选足迹</span><button type="button" onClick={() => updateFilters({ dateRange: null, regions: [], themes: [] })} className="map-ui-muted map-ui-accent-hover text-[10px] cursor-pointer">清除全部</button></div>
              <p className="map-ui-muted mb-1.5 text-[10px] tracking-[0.12em]">定位地图</p>
              <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                <button type="button" onClick={backToWorld} className="map-ui-option rounded-full border px-2.5 py-1 text-[11px] cursor-pointer">全部足迹</button>
                {availableCountries.map((country) => <button key={`navigate-${country}`} type="button" onClick={() => { void navigateToRegion(country); }} className="map-ui-option rounded-full border px-2.5 py-1 text-[11px] cursor-pointer">{country}</button>)}
                {availableCityLocations.map(({ country, city }) => <button key={`navigate-${country}-${city}`} type="button" onClick={() => { void navigateToRegion(country, city); }} className="map-ui-option rounded-full border px-2.5 py-1 text-[11px] cursor-pointer">{city}</button>)}
              </div>
              <p className="map-ui-muted mb-1.5 text-[10px] tracking-[0.12em]">地区</p>
              <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                {availableCountries.map((country) => { const active = activeFilters.regions.includes(country); return <button key={country} type="button" onClick={() => updateFilters({ regions: active ? activeFilters.regions.filter((value) => value !== country) : [...activeFilters.regions, country] })} className={`map-ui-option rounded-full border px-2.5 py-1 text-[11px] cursor-pointer ${active ? 'is-active' : ''}`}>{country}{active && <Check className="ml-1 inline h-3 w-3" />}</button>; })}
                {availableCountries.length === 0 && <span className="map-ui-muted text-[11px]">暂无地区</span>}
              </div>
              <p className="map-ui-muted mb-1.5 mt-3 text-[10px] tracking-[0.12em]">主题</p>
              <div className="flex flex-wrap gap-1.5">
                {THEME_OPTIONS.map((theme) => { const active = activeFilters.themes.includes(theme.value); return <button key={theme.value} type="button" onClick={() => updateFilters({ themes: active ? activeFilters.themes.filter((value) => value !== theme.value) : [...activeFilters.themes, theme.value] })} className={`map-ui-option rounded-full border px-2.5 py-1 text-[11px] cursor-pointer ${active ? 'is-active' : ''}`}>{theme.label}{active && <Check className="ml-1 inline h-3 w-3" />}</button>; })}
              </div>
              <p className="map-ui-muted mt-3 text-[10px]">时间由底部水晶时间轴控制</p>
            </motion.div>}
          </AnimatePresence>
        </div>
      </div>}

      {!selectedMemory && allYears.length > 0 && <CrystalTimeline memories={enriched} filters={activeFilters} onFiltersChange={updateFilters} />}

      {!selectedMemory && (
        <button
          type="button"
          onClick={() => setIsResultListOpen(true)}
          className="map-current-results-trigger absolute right-0 top-1/2 z-[1002] -translate-y-1/2"
          aria-label="查看当前记忆列表"
          title="查看当前记忆列表"
        >
          <List className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" />
        </button>
      )}

      {!selectedMemory && onAddMemory && <button id="btn-add-memory-from-map" type="button" onClick={onAddMemory} aria-label="添加记忆" title="添加记忆" className="map-add-memory-floating"><Plus className="h-6 w-6" strokeWidth={1.7} /></button>}

      {/* 当前地图上下文的结果列表。抽屉开合不改变地图中心或缩放。 */}
      <AnimatePresence>
        {isResultListOpen && !selectedMemory && (
          <motion.div
            initial={{ x: 360, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 360, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 260 }}
            className="map-current-result-drawer-shell absolute top-0 right-0 z-[1003] h-full"
          >
            <button
              type="button"
              onClick={() => setIsResultListOpen(false)}
              className="map-current-results-collapse"
              aria-label="收起当前记忆列表"
              title="收起当前记忆列表"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
            </button>
            <aside className="map-memory-list-panel map-current-result-drawer h-full overflow-y-auto border-l backdrop-blur-md">
              <div className="map-memory-list-header map-current-result-header sticky top-0 z-10 flex items-start justify-between border-b backdrop-blur-md">
                <div>
                  <h2>{contextTitle}</h2>
                  <p>{contextMemories.length} 段记忆 · {contextRange}</p>
                </div>
                <button type="button" onClick={backToWorld} className="map-current-result-back">
                  <ArrowLeft className="h-4 w-4" strokeWidth={1.6} />
                  全部足迹
                </button>
              </div>
              <div className="map-current-result-card-list">
                {contextMemories.map((m) => {
                  const photo = m.image || fallbackImageOf(m) || '';
                  return (
                    <button
                      key={m.id}
                      onClick={() => {
                        setIsResultListOpen(false);
                        onSelectMemory(m);
                      }}
                      className="map-memory-list-card map-current-result-card group"
                    >
                      <div className="map-current-result-photo">
                        {photo ? (
                          <img
                            src={photo}
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
                            className="map-memory-thumb transition-transform group-hover:scale-[1.03]"
                          />
                        ) : <span>暂无照片</span>}
                      </div>
                      <div className="map-current-result-copy">
                        <span>{m.year}</span>
                        <strong>{m.title}</strong>
                        <em>{placeOf(m)}</em>
                        <small>打开记忆 <b aria-hidden="true">→</b></small>
                      </div>
                    </button>
                  );
                })}
                {contextMemories.length === 0 && (
                  <p className="map-current-result-empty">当前条件下没有记忆。</p>
                )}
              </div>
            </aside>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedMemory && (
          <MapMemoryOverlay
            memory={selectedMemory}
            anchor={selectedAnchor}
            viewport={mapViewport}
            onClose={onCloseMemory}
            onSaveMemory={onSaveMemory}
            onDeleteMemory={onDeleteMemory}
            onLoadOriginalPhoto={onLoadOriginalPhoto}
            readerMode={readerMode}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
