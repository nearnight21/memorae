import React, { useState } from 'react';
import { registerRootComponent } from 'expo';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import App from './App';
import { nativeCryptoPrimitives } from './src/crypto/nativePrimitives';
import { CrystalTimelineGoldenFrameScreen } from './src/testing/CrystalTimelineGoldenFrameScreen';
import { createEphemeralTestBootstrap } from './src/testing/ephemeralTestRuntime';

function bootstrapEphemeralTest() {
  return createEphemeralTestBootstrap(nativeCryptoPrimitives);
}

function EphemeralTestApp() {
  const [goldenFrameVisible, setGoldenFrameVisible] = useState(true);

  if (goldenFrameVisible) {
    return <CrystalTimelineGoldenFrameScreen onExit={() => setGoldenFrameVisible(false)} />;
  }

  return (
    <View style={styles.appShell}>
      <App testBootstrap={bootstrapEphemeralTest} />
      <Pressable
        accessibilityLabel="打开 Crystal Timeline Golden Frame"
        accessibilityRole="button"
        onPress={() => setGoldenFrameVisible(true)}
        style={styles.goldenFrameEntry}
      >
        <Text style={styles.goldenFrameEntryText}>Golden</Text>
      </Pressable>
    </View>
  );
}

function ApplicationRoot() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <EphemeralTestApp />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

registerRootComponent(ApplicationRoot);

const styles = StyleSheet.create({
  appShell: {
    flex: 1,
  },
  goldenFrameEntry: {
    position: 'absolute',
    top: 52,
    right: 12,
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderRadius: 17,
    backgroundColor: 'rgba(50, 36, 20, 0.84)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 224, 173, 0.52)',
    zIndex: 100,
    elevation: 20,
  },
  goldenFrameEntryText: {
    color: '#fff2da',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.35,
  },
});
