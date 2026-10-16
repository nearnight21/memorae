export interface PhotoCoordinates {
  lat: number;
  lng: number;
}

type ExifRecord = Record<string, unknown>;

export interface PhotoMetadata {
  date: string | null;
  coordinates: PhotoCoordinates | null;
}

export interface PhotoLibraryMetadata {
  exif?: object | null;
  creationTime?: number | null;
  location?: { latitude: number; longitude: number } | null;
}

export interface SelectedPhotoAsset {
  assetId?: string | null;
  exif?: ExifRecord | null;
}

function exifRecord(value: unknown): ExifRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as ExifRecord
    : null;
}

function calendarDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})[:-](\d{2})[:-](\d{2})(?:$|[T\s])/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (!Number(year) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== `${year}-${month}-${day}`) {
    return null;
  }
  return `${year}-${month}-${day}`;
}

export function photoDateFromExif(exif: ExifRecord | null | undefined): string | null {
  if (!exif) return null;
  const records = [exif, exifRecord(exif['{Exif}'] ?? exif.Exif ?? exif.exif), exifRecord(exif['{TIFF}'] ?? exif.TIFF)];
  // 优先采用拍摄时间；直接保留照片当地日期，避免 UTC 换算跨日。
  for (const tag of ['DateTimeOriginal', 'DateTimeDigitized', 'DateTime']) {
    for (const record of records) {
      const date = calendarDate(record?.[tag]);
      if (date) return date;
    }
  }
  return null;
}

export function photoDateFromTimestamp(timestamp: number | null | undefined): string | null {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) return null;
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;
  return calendarDate(`${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`);
}

export async function readSelectedPhotoMetadata(
  assets: readonly SelectedPhotoAsset[],
  readLibraryMetadata: (assetId: string) => Promise<PhotoLibraryMetadata | null>,
): Promise<PhotoMetadata> {
  let date: string | null = null;
  let coordinates: PhotoCoordinates | null = null;
  for (const asset of assets) {
    const exifDate = photoDateFromExif(asset.exif);
    const exifCoordinates = photoCoordinatesFromExif(asset.exif);
    let library: PhotoLibraryMetadata | null = null;
    if (asset.assetId && ((!date && !exifDate) || (!coordinates && !exifCoordinates))) {
      try {
        library = await readLibraryMetadata(asset.assetId);
      } catch {
        // 权限拒绝、云端照片或外部文件不应阻断选图，继续使用可读的 EXIF。
      }
    }
    const libraryExif = exifRecord(library?.exif);
    date ??= exifDate ?? photoDateFromExif(libraryExif) ?? photoDateFromTimestamp(library?.creationTime);
    coordinates ??= exifCoordinates
      ?? photoCoordinatesFromExif(library?.location)
      ?? photoCoordinatesFromExif(libraryExif);
    if (date && coordinates) break;
  }
  return { date, coordinates };
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function rational(value: unknown): number | null {
  if (typeof value === 'object' && value !== null && 'numerator' in value && 'denominator' in value) {
    const num = Number((value as { numerator: unknown }).numerator);
    const den = Number((value as { denominator: unknown }).denominator);
    if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) return num / den;
  }
  const numeric = finiteNumber(value);
  if (numeric !== null) return numeric;
  if (typeof value !== 'string') return null;
  const [numerator, denominator] = value.trim().split('/').map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

function coordinate(value: unknown): number | null {
  if (Array.isArray(value)) {
    const parts = value.map(rational);
    if (parts.length >= 3 && parts.every((part) => part !== null)) {
      return parts[0]! + parts[1]! / 60 + parts[2]! / 3600;
    }
    if (parts.length === 2 && parts.every((part) => part !== null)) {
      return parts[0]! + parts[1]! / 60;
    }
    return null;
  }
  const numeric = finiteNumber(value);
  if (numeric !== null) return numeric;
  if (typeof value !== 'string') return null;
  const parts = value.trim().split(/[,\s]+/).map((part) => rational(part));
  if (parts.length >= 3 && parts.every((part) => part !== null)) {
    return parts[0]! + parts[1]! / 60 + parts[2]! / 3600;
  }
  if (parts.length === 2 && parts.every((part) => part !== null)) {
    return parts[0]! + parts[1]! / 60;
  }
  return null;
}

function nestedGps(exif: ExifRecord): ExifRecord | null {
  const value = exif.GPS ?? exif['{GPS}'] ?? exif.gps;
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as ExifRecord
    : null;
}

export function photoCoordinatesFromExif(exif: ExifRecord | null | undefined): PhotoCoordinates | null {
  if (!exif) return null;
  const gps = nestedGps(exif);
  const rawLatitude = exif.GPSLatitude ?? exif.Latitude ?? exif.latitude ?? exif.lat
    ?? gps?.Latitude ?? gps?.GPSLatitude ?? gps?.latitude ?? gps?.lat;
  const rawLongitude = exif.GPSLongitude ?? exif.Longitude ?? exif.longitude ?? exif.lng
    ?? gps?.Longitude ?? gps?.GPSLongitude ?? gps?.longitude ?? gps?.lng;
  const latitude = coordinate(rawLatitude);
  const longitude = coordinate(rawLongitude);
  if (latitude === null || longitude === null) return null;

  const rawLatRef = exif.GPSLatitudeRef ?? exif.LatitudeRef ?? exif.latitudeRef
    ?? gps?.LatitudeRef ?? gps?.GPSLatitudeRef ?? gps?.latitudeRef;
  const rawLngRef = exif.GPSLongitudeRef ?? exif.LongitudeRef ?? exif.longitudeRef
    ?? gps?.LongitudeRef ?? gps?.GPSLongitudeRef ?? gps?.longitudeRef;
  const latitudeRef = String(rawLatRef ?? (latitude < 0 ? 'S' : 'N')).toUpperCase();
  const longitudeRef = String(rawLngRef ?? (longitude < 0 ? 'W' : 'E')).toUpperCase();
  const lat = latitudeRef === 'S' ? -Math.abs(latitude) : latitude;
  const lng = longitudeRef === 'W' ? -Math.abs(longitude) : longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }
  if (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) {
    return null;
  }
  return { lat, lng };
}

export function firstPhotoCoordinates(
  exifValues: readonly (ExifRecord | null | undefined)[],
): PhotoCoordinates | null {
  for (const exif of exifValues) {
    const coordinates = photoCoordinatesFromExif(exif);
    if (coordinates) return coordinates;
  }
  return null;
}
