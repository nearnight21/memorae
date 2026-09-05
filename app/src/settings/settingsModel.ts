import type { CameraState } from '../map/MemoraeMap';
import { HOME_CHINA_CAMERA, HOME_MAP_MAX_ZOOM, HOME_MAP_MIN_ZOOM } from '../map/homeMapModel';

export interface AppPreferences {
  defaultMapCamera: CameraState | null;
  onboardingCompleted: boolean;
}

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  defaultMapCamera: null,
  onboardingCompleted: false,
};

export function normalizeDefaultMapCamera(value: unknown): CameraState | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<CameraState>;
  if (
    !Number.isFinite(candidate.latitude)
    || !Number.isFinite(candidate.longitude)
    || !Number.isFinite(candidate.zoom)
    || candidate.latitude! < -90
    || candidate.latitude! > 90
    || candidate.longitude! < -180
    || candidate.longitude! > 180
  ) return null;
  return {
    latitude: candidate.latitude!,
    longitude: candidate.longitude!,
    zoom: Math.max(HOME_MAP_MIN_ZOOM, Math.min(HOME_MAP_MAX_ZOOM, candidate.zoom!)),
  };
}

export function parseDefaultMapCamera(value: string | null): CameraState | null {
  if (!value) return null;
  try {
    return normalizeDefaultMapCamera(JSON.parse(value));
  } catch {
    return null;
  }
}

export function effectiveDefaultMapCamera(userCamera: CameraState | null): CameraState {
  return normalizeDefaultMapCamera(userCamera) ?? { ...HOME_CHINA_CAMERA };
}

export function cameraZoomLabel(camera: CameraState): string {
  const rounded = Math.round(camera.zoom * 10) / 10;
  return `Zoom ${rounded.toFixed(Number.isInteger(rounded) ? 0 : 1)}`;
}

export function cameraCoordinateLabel(camera: CameraState): string {
  const latitudeDirection = camera.latitude >= 0 ? 'N' : 'S';
  const longitudeDirection = camera.longitude >= 0 ? 'E' : 'W';
  return `${Math.abs(camera.latitude).toFixed(2)}°${latitudeDirection} · ${Math.abs(camera.longitude).toFixed(2)}°${longitudeDirection}`;
}

function versionParts(value: string): number[] {
  const core = value.trim().replace(/^v/i, '').split('-', 1)[0];
  if (!/^\d+(\.\d+)*$/.test(core)) return [];
  return core.split('.').map(Number);
}

export function isVersionNewer(candidate: string, current: string): boolean {
  const candidateParts = versionParts(candidate);
  const currentParts = versionParts(current);
  if (candidateParts.length === 0 || currentParts.length === 0) return false;
  const length = Math.max(candidateParts.length, currentParts.length);
  for (let index = 0; index < length; index += 1) {
    const next = candidateParts[index] ?? 0;
    const active = currentParts[index] ?? 0;
    if (next !== active) return next > active;
  }
  return false;
}
