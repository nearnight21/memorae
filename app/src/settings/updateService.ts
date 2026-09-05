import { isVersionNewer } from './settingsModel';

const LATEST_RELEASE_URL = 'https://api.github.com/repos/nearnight21/memorae/releases/latest';
export const SUPPORT_PROJECT_URL = 'https://github.com/nearnight21/memorae';

export type UpdateCheckResult =
  | { status: 'current'; message: string }
  | { status: 'available'; message: string; version: string; url: string }
  | { status: 'unavailable'; message: string };

interface GitHubRelease {
  tag_name?: unknown;
  html_url?: unknown;
}

export async function checkForAppUpdate(currentVersion: string): Promise<UpdateCheckResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(LATEST_RELEASE_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      return { status: 'unavailable', message: '当前发布渠道暂未提供公开更新信息' };
    }
    const release = await response.json() as GitHubRelease;
    const version = typeof release.tag_name === 'string' ? release.tag_name.replace(/^v/i, '') : '';
    const url = typeof release.html_url === 'string' ? release.html_url : '';
    if (!version || !url) {
      return { status: 'unavailable', message: '更新信息格式暂时不可用' };
    }
    if (isVersionNewer(version, currentVersion)) {
      return { status: 'available', message: `发现新版本 ${version}`, version, url };
    }
    return { status: 'current', message: '已是最新版本' };
  } catch {
    return { status: 'unavailable', message: '更新检查暂时不可用，请稍后重试' };
  } finally {
    clearTimeout(timeout);
  }
}
