import React from 'react';
import { registerRootComponent } from 'expo';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import App from './App';
import { nativeCryptoPrimitives } from './src/crypto/nativePrimitives';
import { createEphemeralTestBootstrap } from './src/testing/ephemeralTestRuntime';

function bootstrapEphemeralTest() {
  return createEphemeralTestBootstrap(nativeCryptoPrimitives);
}

function EphemeralTestApp() {
  return <App testBootstrap={bootstrapEphemeralTest} />;
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
