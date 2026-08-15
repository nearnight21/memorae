export interface PhotoMetadata {
  /** 拍摄日期，使用日期输入需要的 YYYY-MM-DD 格式。 */
  date?: string;
  latitude?: number;
  longitude?: number;
}

const MAX_METADATA_BYTES = 2 * 1024 * 1024;

function isFiniteCoordinate(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

function normaliseExifDate(value: string): string | undefined {
  const match = value.trim().match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})/);
  if (!match) return undefined;
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : date;
}

function readAscii(view: DataView, offset: number, length: number, end: number): string {
  const safeEnd = Math.min(offset + length, end, view.byteLength);
  let result = '';
  for (let index = offset; index < safeEnd; index += 1) {
    const byte = view.getUint8(index);
    if (byte === 0) break;
    result += String.fromCharCode(byte);
  }
  return result;
}

interface TiffEntry {
  tag: number;
  type: number;
  count: number;
  entryOffset: number;
}

function parseTiff(view: DataView, tiffStart: number, tiffEnd: number): PhotoMetadata {
  if (tiffStart + 8 > tiffEnd) return {};
  const byteOrder = readAscii(view, tiffStart, 2, tiffEnd);
  if (byteOrder !== 'II' && byteOrder !== 'MM') return {};
  const littleEndian = byteOrder === 'II';
  const getUint16 = (offset: number) => view.getUint16(offset, littleEndian);
  const getUint32 = (offset: number) => view.getUint32(offset, littleEndian);
  if (getUint16(tiffStart + 2) !== 42) return {};

  const typeSize: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  const entriesForIfd = (ifdOffset: number): TiffEntry[] => {
    const ifdStart = tiffStart + ifdOffset;
    if (ifdStart < tiffStart || ifdStart + 2 > tiffEnd) return [];
    const count = Math.min(getUint16(ifdStart), 512);
    const entries: TiffEntry[] = [];
    for (let index = 0; index < count; index += 1) {
      const entryOffset = ifdStart + 2 + index * 12;
      if (entryOffset + 12 > tiffEnd) break;
      entries.push({
        tag: getUint16(entryOffset),
        type: getUint16(entryOffset + 2),
        count: getUint32(entryOffset + 4),
        entryOffset,
      });
    }
    return entries;
  };

  const entries = entriesForIfd(getUint32(tiffStart + 4));
  const entryFor = (list: TiffEntry[], tag: number) => list.find((entry) => entry.tag === tag);
  const readEntryBytes = (entry: TiffEntry): Uint8Array => {
    const size = typeSize[entry.type];
    if (!size || entry.count <= 0 || entry.count > 1_000_000) return new Uint8Array();
    const byteLength = size * entry.count;
    const valueOffset = byteLength <= 4
      ? entry.entryOffset + 8
      : tiffStart + getUint32(entry.entryOffset + 8);
    if (valueOffset < tiffStart || valueOffset + byteLength > tiffEnd || valueOffset + byteLength > view.byteLength) {
      return new Uint8Array();
    }
    return new Uint8Array(view.buffer, view.byteOffset + valueOffset, byteLength);
  };
  const readString = (entry: TiffEntry | undefined): string | undefined => {
    if (!entry || entry.type !== 2) return undefined;
    const bytes = readEntryBytes(entry);
    let result = '';
    for (const byte of bytes) {
      if (byte === 0) break;
      result += String.fromCharCode(byte);
    }
    return result || undefined;
  };
  const readRationals = (entry: TiffEntry | undefined): number[] => {
    if (!entry || (entry.type !== 5 && entry.type !== 10)) return [];
    const bytes = readEntryBytes(entry);
    const rationalView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const values: number[] = [];
    for (let index = 0; index + 8 <= bytes.byteLength; index += 8) {
      const numerator = entry.type === 5 ? rationalView.getUint32(index, littleEndian) : rationalView.getInt32(index, littleEndian);
      const denominator = entry.type === 5 ? rationalView.getUint32(index + 4, littleEndian) : rationalView.getInt32(index + 4, littleEndian);
      values.push(denominator === 0 ? Number.NaN : numerator / denominator);
    }
    return values;
  };

  const metadata: PhotoMetadata = {};
  for (const tag of [0x9003, 0x9004, 0x0132]) {
    const date = normaliseExifDate(readString(entryFor(entries, tag)) ?? '');
    if (date) {
      metadata.date = date;
      break;
    }
  }

  const gpsPointer = entryFor(entries, 0x8825);
  if (gpsPointer?.type === 4) {
    const pointerBytes = readEntryBytes(gpsPointer);
    if (pointerBytes.byteLength >= 4) {
      const pointerView = new DataView(pointerBytes.buffer, pointerBytes.byteOffset, pointerBytes.byteLength);
      const gpsEntries = entriesForIfd(pointerView.getUint32(0, littleEndian));
      const latitude = readRationals(entryFor(gpsEntries, 0x0002));
      const longitude = readRationals(entryFor(gpsEntries, 0x0004));
      const latitudeRef = (readString(entryFor(gpsEntries, 0x0001)) ?? 'N').toUpperCase();
      const longitudeRef = (readString(entryFor(gpsEntries, 0x0003)) ?? 'E').toUpperCase();
      if (latitude.length >= 3 && longitude.length >= 3) {
        const lat = latitude[0] + latitude[1] / 60 + latitude[2] / 3600;
        const lng = longitude[0] + longitude[1] / 60 + longitude[2] / 3600;
        const signedLat = latitudeRef === 'S' ? -lat : lat;
        const signedLng = longitudeRef === 'W' ? -lng : lng;
        if (isFiniteCoordinate(signedLat, -90, 90) && isFiniteCoordinate(signedLng, -180, 180)) {
          metadata.latitude = signedLat;
          metadata.longitude = signedLng;
        }
      }
    }
  }
  return metadata;
}

function parseJpeg(view: DataView): PhotoMetadata {
  if (view.byteLength < 4 || view.getUint8(0) !== 0xff || view.getUint8(1) !== 0xd8) return {};
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < view.byteLength && view.getUint8(offset) === 0xff) offset += 1;
    if (offset >= view.byteLength) break;
    const marker = view.getUint8(offset);
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker >= 0xd0 && marker <= 0xd8) continue;
    if (offset + 2 > view.byteLength) break;
    const segmentLength = view.getUint16(offset, false);
    if (segmentLength < 2 || offset + segmentLength > view.byteLength) break;
    const dataStart = offset + 2;
    const dataEnd = offset + segmentLength;
    // readAscii intentionally stops at the first NUL, so the six-byte EXIF header is "Exif" here.
    if (marker === 0xe1 && readAscii(view, dataStart, 4, dataEnd) === 'Exif') {
      return parseTiff(view, dataStart + 6, dataEnd);
    }
    offset += segmentLength;
  }
  return {};
}

function parsePng(view: DataView): PhotoMetadata {
  if (view.byteLength < 8) return {};
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let index = 0; index < signature.length; index += 1) {
    if (view.getUint8(index) !== signature[index]) return {};
  }
  let offset = 8;
  while (offset + 12 <= view.byteLength) {
    const length = view.getUint32(offset, false);
    const type = readAscii(view, offset + 4, 4, view.byteLength);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > view.byteLength) break;
    if (type === 'eXIf') return parseTiff(view, dataStart, dataEnd);
    offset = dataEnd + 4;
    if (type === 'IEND') break;
  }
  return {};
}

export async function readPhotoMetadata(file: Blob): Promise<PhotoMetadata> {
  try {
    const buffer = await file.slice(0, MAX_METADATA_BYTES).arrayBuffer();
    const view = new DataView(buffer);
    if (file.type === 'image/jpeg' || file.type === 'image/jpg' || view.getUint16(0, false) === 0xffd8) return parseJpeg(view);
    if (file.type === 'image/png') return parsePng(view);
    if (view.byteLength >= 4 && (readAscii(view, 0, 2, view.byteLength) === 'II' || readAscii(view, 0, 2, view.byteLength) === 'MM')) {
      return parseTiff(view, 0, view.byteLength);
    }
  } catch {
    // Some image formats do not expose readable EXIF data in the browser.
  }
  return {};
}
