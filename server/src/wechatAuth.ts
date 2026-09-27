import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { LoginSession, WeChatIdentity } from './auth';

export interface WeChatProviderOptions {
  appId: string;
  appSecret: string;
  callbackUrl: string;
  stateSecret: string;
  /** Test seam; production uses the WeChat API endpoint below. */
  exchangeCode?: (code: string) => Promise<WeChatIdentity>;
}

interface WeChatTokenResponse {
  access_token?: string;
  openid?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

export class WeChatProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WeChatProviderError';
  }
}

export class WeChatProvider {
  constructor(private readonly options: WeChatProviderOptions) {
    if (!options.appId.trim() || !options.appSecret.trim()) {
      throw new Error('微信登录必须配置 AppID 和 AppSecret。');
    }
    if (!options.callbackUrl.startsWith('https://') && !options.callbackUrl.startsWith('http://localhost')) {
      throw new Error('微信登录回调地址必须使用 HTTPS；本地开发仅允许 localhost。');
    }
  }

  get authorizationUrl(): string {
    return 'https://open.weixin.qq.com/connect/qrconnect';
  }

  get callbackUrl(): string {
    return this.options.callbackUrl;
  }

  createState(returnTo: string, now = Date.now()): string {
    const payload = encodeBase64Url(JSON.stringify({
      exp: now + 10 * 60 * 1000,
      nonce: randomBytes(16).toString('base64url'),
      returnTo,
    }));
    return `${payload}.${sign(payload, this.options.stateSecret)}`;
  }

  verifyState(value: string, now = Date.now()): { returnTo: string } | null {
    const [payload, signature] = value.split('.');
    if (!payload || !signature) return null;
    const expected = sign(payload, this.options.stateSecret);
    const left = Buffer.from(signature, 'utf8');
    const right = Buffer.from(expected, 'utf8');
    if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
    try {
      const decoded = JSON.parse(decodeBase64Url(payload)) as {
        exp?: unknown;
        returnTo?: unknown;
      };
      if (typeof decoded.exp !== 'number' || decoded.exp <= now) return null;
      if (typeof decoded.returnTo !== 'string' || !decoded.returnTo) return null;
      return { returnTo: decoded.returnTo };
    } catch {
      return null;
    }
  }

  async exchangeCode(code: string): Promise<WeChatIdentity> {
    if (this.options.exchangeCode) return this.options.exchangeCode(code);
    const url = new URL('https://api.weixin.qq.com/sns/oauth2/access_token');
    url.searchParams.set('appid', this.options.appId);
    url.searchParams.set('secret', this.options.appSecret);
    url.searchParams.set('code', code);
    url.searchParams.set('grant_type', 'authorization_code');

    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      throw new WeChatProviderError('暂时无法连接微信，请稍后重试。');
    }
    if (!response.ok) {
      throw new WeChatProviderError(`微信授权请求失败：HTTP ${response.status}。`);
    }
    const body = await response.json() as WeChatTokenResponse;
    if (body.errcode || !body.openid) {
      throw new WeChatProviderError(body.errmsg || '微信授权无效或已过期。');
    }
    return {
      openId: body.openid,
      unionId: body.unionid,
    };
  }
}

export class WeChatHandoffStore {
  private readonly entries = new Map<string, { session: LoginSession; expiresAt: number }>();

  constructor(
    private readonly ttlMs = 2 * 60 * 1000,
    private readonly now = () => Date.now(),
  ) {}

  issue(session: LoginSession): string {
    this.cleanup();
    const code = randomBytes(32).toString('base64url');
    this.entries.set(code, { session, expiresAt: this.now() + this.ttlMs });
    return code;
  }

  consume(code: string): LoginSession | null {
    this.cleanup();
    const entry = this.entries.get(code);
    if (!entry) return null;
    this.entries.delete(code);
    return entry.expiresAt > this.now() ? entry.session : null;
  }

  private cleanup(): void {
    const now = this.now();
    for (const [code, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(code);
    }
  }
}

export function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

export function decodeBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value, 'utf8').digest('base64url');
}
