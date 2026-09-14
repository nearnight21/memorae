import { Platform, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// RN 0.86 Android edge-to-edge can report no safe-area padding. Keep controls
// below the status bar with a conservative inset when that happens.
export function androidTopInset(): number {
  if (Platform.OS !== 'android') return 0;
  return Math.max(StatusBar.currentHeight ?? 0, 24);
}

export function useAppTopInset(): number {
  const insets = useSafeAreaInsets();
  if (Platform.OS === 'android') {
    return Math.max(insets.top, StatusBar.currentHeight ?? 0, 24);
  }
  return Math.max(insets.top, 20);
}
