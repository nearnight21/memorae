const { withAppBuildGradle } = require('expo/config-plugins');

const E2E_REQUEST_MARKER = 'def memoryRecallEphemeralTestRequested';
const E2E_BUILD_MARKER = 'applicationIdSuffix ".test"';

function findBlockClosingBrace(contents, blockName) {
  const blockPattern = new RegExp(`${blockName}\\s*\\{`);
  const match = blockPattern.exec(contents);
  if (!match) return -1;
  let depth = 1;
  const openingBrace = match.index + match[0].lastIndexOf('{');
  for (let index = openingBrace + 1; index < contents.length; index += 1) {
    if (contents[index] === '{') depth += 1;
    if (contents[index] === '}') depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

function patchEphemeralTestBuild(contents) {
  let patched = contents;
  if (!patched.includes(E2E_REQUEST_MARKER)) {
    const projectRootPattern = /(def projectRoot = .*\r?\n)/;
    if (!projectRootPattern.test(patched)) {
      throw new Error('无法定位 Android app/build.gradle 的 projectRoot。');
    }
    patched = patched.replace(
      projectRootPattern,
      `$1\n${E2E_REQUEST_MARKER} = gradle.startParameter.taskNames.any {\n    it.toLowerCase().contains("ephemeraltest")\n}\n`,
    );
  }

  const ordinaryEntry = 'entryFile = file(["node", "-e", "require(\'expo/scripts/resolveAppEntry\')", projectRoot, "android", "absolute"].execute(null, rootDir).text.trim())';
  if (patched.includes(ordinaryEntry)) {
    patched = patched.replace(
      ordinaryEntry,
      `entryFile = memoryRecallEphemeralTestRequested\n        ? file("${'$'}{projectRoot}/index.e2e.tsx")\n        : file(["node", "-e", "require('expo/scripts/resolveAppEntry')", projectRoot, "android", "absolute"].execute(null, rootDir).text.trim())`,
    );
  }

  if (!patched.includes(E2E_BUILD_MARKER)) {
    const buildTypesEnd = findBlockClosingBrace(patched, 'buildTypes');
    if (buildTypesEnd < 0) throw new Error('无法定位 Android buildTypes 的结束位置。');
    const buildType = `
        // 独立临时测试包：只打包 index.e2e.tsx，不接触正式 App 数据。
        ephemeralTest {
            initWith release
            signingConfig signingConfigs.debug
            debuggable false
            applicationIdSuffix ".test"
            versionNameSuffix "-test"
            matchingFallbacks = ['release']
            resValue "string", "app_name", "所忆测试"
        }
`;
    patched = `${patched.slice(0, buildTypesEnd)}${buildType}${patched.slice(buildTypesEnd)}`;
  }
  return patched;
}

module.exports = function withEphemeralTestBuild(config) {
  return withAppBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language !== 'groovy') {
      throw new Error('所忆临时测试构建插件只支持 Groovy build.gradle。');
    }
    gradleConfig.modResults.contents = patchEphemeralTestBuild(gradleConfig.modResults.contents);
    return gradleConfig;
  });
};

module.exports.patchEphemeralTestBuild = patchEphemeralTestBuild;
