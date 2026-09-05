import * as SecureStore from 'expo-secure-store';
import type { CameraState } from '../map/MemoraeMap';
import {
  DEFAULT_APP_PREFERENCES,
  parseDefaultMapCamera,
  type AppPreferences,
} from './settingsModel';

const DEFAULT_MAP_CAMERA_KEY = 'memorae-default-map-camera-v1';
const ONBOARDING_COMPLETED_KEY = 'memorae-onboarding-completed-v1';

export async function loadAppPreferences(): Promise<AppPreferences> {
  try {
    const [cameraValue, onboardingValue] = await Promise.all([
      SecureStore.getItemAsync(DEFAULT_MAP_CAMERA_KEY),
      SecureStore.getItemAsync(ONBOARDING_COMPLETED_KEY),
    ]);
    return {
      defaultMapCamera: parseDefaultMapCamera(cameraValue),
      onboardingCompleted: onboardingValue === '1',
    };
  } catch {
    return { ...DEFAULT_APP_PREFERENCES };
  }
}

export async function saveDefaultMapCamera(camera: CameraState | null): Promise<void> {
  if (camera) {
    await SecureStore.setItemAsync(DEFAULT_MAP_CAMERA_KEY, JSON.stringify(camera));
    return;
  }
  await SecureStore.deleteItemAsync(DEFAULT_MAP_CAMERA_KEY);
}

export async function saveOnboardingCompleted(): Promise<void> {
  await SecureStore.setItemAsync(ONBOARDING_COMPLETED_KEY, '1');
}
