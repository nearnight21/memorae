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
  city?: string; // 地区线钻取：城市
  lat?: number; // 高德 GCJ-02 纬度（候选、地图落点或 EXIF 转换后写入）
  lng?: number; // 高德 GCJ-02 经度
  /** 详细位置备注（如"外公外婆家"），仅文字记录，不参与地图定位 */
  detailLocation?: string;
}

