export interface PhotoCoordinates {
  lat: number;
  lng: number;
}

type ExifRecord = Record<string, unknown>;

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function rational(value: unknown): number | null {
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
    return null;
  }
  const numeric = finiteNumber(value);
  if (numeric !== null) return numeric;
  if (typeof value !== 'string') return null;
  const parts = value.split(',').map((part) => rational(part));
  if (parts.length >= 3 && parts.every((part) => part !== null)) {
    return parts[0]! + parts[1]! / 60 + parts[2]! / 3600;
  }
  return null;
}

function nestedGps(exif: ExifRecord): ExifRecord | null {
  const value = exif.GPS ?? exif['{GPS}'];
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as ExifRecord
    : null;
}

export function photoCoordinatesFromExif(exif: ExifRecord | null | undefined): PhotoCoordinates | null {
  if (!exif) return null;
  const gps = nestedGps(exif);
  const latitude = coordinate(exif.GPSLatitude ?? gps?.Latitude ?? gps?.GPSLatitude);
  const longitude = coordinate(exif.GPSLongitude ?? gps?.Longitude ?? gps?.GPSLongitude);
  if (latitude === null || longitude === null) return null;

  const latitudeRef = String(exif.GPSLatitudeRef ?? gps?.LatitudeRef ?? gps?.GPSLatitudeRef ?? 'N').toUpperCase();
  const longitudeRef = String(exif.GPSLongitudeRef ?? gps?.LongitudeRef ?? gps?.GPSLongitudeRef ?? 'E').toUpperCase();
  const lat = latitudeRef === 'S' ? -Math.abs(latitude) : latitude;
  const lng = longitudeRef === 'W' ? -Math.abs(longitude) : longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
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
