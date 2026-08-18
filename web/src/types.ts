export type PinnedBy = 'pin' | 'magnet' | 'clip' | 'tape';

export type CategoryType = 'travel' | 'growth' | 'motorcycle' | 'photography';

export interface MemoryDateRange {
  start: string | null;
  end: string | null;
}

export interface MemoryFilters {
  dateRange: MemoryDateRange | null;
  regions: string[];
  themes: CategoryType[];
}

/** 地图创建入口传给新增弹窗的地点草稿。 */
export interface MemoryLocationDraft {
  name: string;
  lat: number;
  lng: number;
  country?: string;
  province?: string;
  city?: string;
  district?: string;
  adcode?: string;
  provider?: 'amap' | 'bigdatacloud';
  providerId?: string;
}

export interface Memory {
  id: string;
  title: string;
  date: string;
  year: number; // e.g. 2024, 2025, 2026
  category: CategoryType;
  tag: string; // e.g. "探索期", "初次出发", "热忱"
  image: string;
  gallery: string[]; // secondary photos for horizontal scroll
  /** Runtime-only encrypted photo references. They allow the reader to load an
   * original on demand without keeping every original decrypted in memory. */
  photoIds?: string[];
  pastSelf: string; // "当时的我"
  presentSelf: string; // "现在的我"
  pinnedBy: PinnedBy;
  // Percentage coordinates on the corkboard (0 - 100)
  px: number;
  py: number;
  rotation: number; // angle in degrees for visual layout asymmetry
  location?: {
    name: string;
    mx: number; // map coordinates on the central rustic map (x percent)
    my: number; // map coordinates on the central rustic map (y percent)
  };
  country?: string; // 地区线钻取：国家
  province?: string; // 标准化行政层级：省/直辖市
  city?: string; // 地区线钻取：城市
  district?: string; // 标准化行政层级：区县
  adcode?: string; // 高德行政区编码（海外地点可能为空）
  locationProvider?: 'amap' | 'bigdatacloud';
  locationProviderId?: string;
  lat?: number; // 地图纬度；中国大陆为 GCJ-02，海外为 WGS-84
  lng?: number; // 地图经度；中国大陆为 GCJ-02，海外为 WGS-84
  /** 详细位置备注（如"外公外婆家"），仅文字记录，不参与地图定位 */
  detailLocation?: string;
}

