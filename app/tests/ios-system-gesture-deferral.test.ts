import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { patchIosSystemGestureDeferral } = require('../plugins/with-ios-system-gesture-deferral.js') as {
  patchIosSystemGestureDeferral: (contents: string, language?: string) => string;
};

const SWIFT_APP_DELEGATE = `import Expo
import React

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  override func bundleURL() -> URL? {
    return nil
  }
}
`;

test('iOS 根控制器把底部系统手势优先级交给 App，并且插件可重复执行', () => {
  const patched = patchIosSystemGestureDeferral(SWIFT_APP_DELEGATE);
  assert.match(patched, /preferredScreenEdgesDeferringSystemGestures/);
  assert.match(patched, /return \[\.bottom\]/);
  assert.match(patched, /override func createRootViewController\(\) -> UIViewController/);
  assert.match(patched, /return MemoraeRootViewController\(\)/);
  assert.equal(patchIosSystemGestureDeferral(patched), patched);
});

test('iOS 系统手势插件拒绝无法定位的 AppDelegate', () => {
  assert.throws(
    () => patchIosSystemGestureDeferral('class AppDelegate {}'),
    /无法定位 iOS ReactNativeDelegate/,
  );
  assert.throws(
    () => patchIosSystemGestureDeferral(SWIFT_APP_DELEGATE, 'objc'),
    /只支持 Swift AppDelegate/,
  );
});
