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
