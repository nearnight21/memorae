import cors from '@fastify/cors';
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import {
  LocalTokenAuthenticator,
  type RequestAuthenticator,
} from './auth';
import {
  WeChatHandoffStore,
  WeChatProvider,
  WeChatProviderError,
  type WeChatProviderOptions,
} from './wechatAuth';
import {
  EmailRegistrationError,
  EmailRegistrationService,
  type EmailRegistrationStore,
  type EmailRegistrationOptions,
} from './email';
import {
  encryptedMemorySchema,
  encryptedPhotoSchema,
  idParamsSchema,
  vaultEnvelopeSchema,
  type EncryptedMemoryV1,
  type EncryptedPhotoV1,
  type MemoryListResponse,
  type PhotoKind,
  type SealedBytesV1,
  type VaultEnvelopeV1,
} from './contracts';
import {
  beginPhotoUploadBodySchema,
  completePhotoUploadBodySchema,
  photoVariantParamsSchema,
  PhotoTransferConflictError,
  PhotoTransferNotFoundError,
  PhotoTransferValidationError,
  type DirectPhotoTransfer,
} from './photoTransfer';
import { CipherConflictError, type CipherStore } from './store';
import {
  LocationProviderError,
  LocationServiceUnavailableError,
  type LocationCoordinates,
  type LocationService,
} from './location';

export interface BuildAppOptions {
  store: CipherStore;
  localToken?: string;
  localUserId?: string;
  authenticator?: RequestAuthenticator;
  allowedOrigins?: string[];
  photoTransfer?: DirectPhotoTransfer;
  /** 高德地点服务只由服务端持有 key，未配置时地点功能返回明确的 503。 */
  locationService?: LocationService;
  /** 微信网站应用 OAuth；未配置时不注册微信登录路由。 */
  wechat?: WeChatProviderOptions;
  /** 邮箱验证码注册；未配置时不注册邮箱登录路由。 */
  email?: EmailRegistrationOptions;
  emailStore?: EmailRegistrationStore;
}

interface IdParams {
  id: string;
}

interface LoginBody {
  loginName: string;
  password: string;
  deviceId?: string;
}

interface WeChatStartQuery {
  returnTo?: string;
}

interface WeChatCallbackQuery {
  code?: string;
  state?: string;
  error?: string;
}

interface WeChatExchangeBody {
  code: string;
}

interface EmailCodeRequestBody {
  email: string;
}

interface EmailCodeVerifyBody {
  email: string;
  code: string;
  deviceId?: string;
}

interface PhotoVariantParams extends IdParams {
  kind: PhotoKind;
}

interface BeginPhotoUploadBody {
  cryptoVersion: 1;
  metadata: SealedBytesV1;
  contentLength: number;
  contentSha256: string;
}

interface CompletePhotoUploadBody {
  uploadId: string;
}

interface LocationSuggestQuery {
  q: string;
  adcode?: string;
}

interface LocationReverseQuery {
  lat: number;
  lng: number;
}

interface ConvertGpsBody extends LocationCoordinates {}

declare module 'fastify' {
  interface FastifyRequest {
    accountId?: string;
  }
}

const loginSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['loginName', 'password'],
  properties: {
    loginName: { type: 'string', minLength: 3, maxLength: 200 },
    password: { type: 'string', minLength: 8, maxLength: 1024 },
    deviceId: { type: 'string', minLength: 1, maxLength: 200 },
  },
} as const;

const weChatStartSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    returnTo: { type: 'string', minLength: 1, maxLength: 1000 },
  },
} as const;

const weChatCallbackSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    code: { type: 'string', minLength: 1, maxLength: 512 },
    state: { type: 'string', minLength: 1, maxLength: 2000 },
    error: { type: 'string', minLength: 1, maxLength: 100 },
  },
} as const;

const weChatExchangeSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['code'],
  properties: {
    code: { type: 'string', minLength: 1, maxLength: 512 },
  },
} as const;

const emailCodeRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['email'],
  properties: { email: { type: 'string', minLength: 3, maxLength: 190 } },
} as const;

const emailCodeVerifySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['email', 'code'],
  properties: {
    email: { type: 'string', minLength: 3, maxLength: 190 },
    code: { type: 'string', minLength: 6, maxLength: 6 },
    deviceId: { type: 'string', maxLength: 200 },
  },
} as const;

const locationSuggestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['q'],
  properties: {
    q: { type: 'string', minLength: 1, maxLength: 200 },
    adcode: { type: 'string', minLength: 1, maxLength: 32 },
  },
} as const;

const locationReverseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['lat', 'lng'],
  properties: {
    lat: { type: 'number', minimum: -90, maximum: 90 },
    lng: { type: 'number', minimum: -180, maximum: 180 },
  },
} as const;

function bearerToken(request: FastifyRequest): string | null {
  const value = request.headers.authorization;
  if (!value?.startsWith('Bearer ')) return null;
  const token = value.slice('Bearer '.length).trim();
  return token || null;
}

function cookieValue(request: FastifyRequest, name: string): string | null {
  const header = request.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...valueParts] = part.trim().split('=');
    if (key === name) return decodeURIComponent(valueParts.join('='));
  }
  return null;
}

function weChatStateCookie(value: string, maxAge: number, secure: boolean): string {
  return [
    `memorae_wechat_state=${encodeURIComponent(value)}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/v1/auth/wechat',
    `Max-Age=${maxAge}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

function validReturnTo(value: string | undefined, allowedOrigins: string[]): string {
  const fallback = allowedOrigins[0];
  if (!value) {
    if (!fallback) throw new Error('微信登录缺少回调来源。');
    return fallback;
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('微信登录回调来源无效。');
  }
  if (!allowedOrigins.includes(parsed.origin)) {
    throw new Error('微信登录回调来源未被允许。');
  }
  return parsed.toString();
}

function addWeChatResult(returnTo: string, code: string): string {
  const url = new URL(returnTo);
  url.searchParams.set('wechat_code', code);
  url.hash = 'app';
  return url.toString();
}

function addWeChatError(returnTo: string, code: string): string {
  const url = new URL(returnTo);
  url.searchParams.set('wechat_error', code);
  url.hash = 'app';
  return url.toString();
}

function currentAccountId(request: FastifyRequest): string {
  if (!request.accountId) {
    throw new Error('认证钩子没有设置账号。');
  }
  return request.accountId;
}

function sendPhotoTransferError(error: unknown, reply: FastifyReply): FastifyReply | null {
  if (error instanceof PhotoTransferNotFoundError) {
    return reply.code(404).send({ error: error.message });
  }
  if (error instanceof PhotoTransferConflictError) {
    return reply.code(409).send({ error: error.message });
  }
  if (error instanceof PhotoTransferValidationError) {
    return reply.code(422).send({ error: error.message });
  }
  return null;
}

function sendLocationError(error: unknown, reply: FastifyReply): FastifyReply | null {
  if (error instanceof LocationServiceUnavailableError) {
    return reply.code(503).send({ error: error.message, code: 'location_service_unavailable' });
  }
  if (error instanceof LocationProviderError) {
    return reply.code(502).send({ error: error.message, code: 'location_provider_unavailable' });
  }
  return null;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  if (!options.authenticator && !options.localToken) {
    throw new Error('必须提供本地令牌或账号认证器。');
  }
  const authenticator: RequestAuthenticator = options.authenticator ?? new LocalTokenAuthenticator(
    options.localToken!,
    options.localUserId,
  );

  const app = Fastify({
    logger: false,
    bodyLimit: 64 * 1024 * 1024,
    ajv: {
      customOptions: {
        removeAdditional: false,
      },
    },
  });
  await app.register(cors, {
    origin: options.allowedOrigins ?? [
      'http://127.0.0.1:3000',
      'http://localhost:3000',
    ],
    methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
    allowedHeaders: ['authorization', 'content-type'],
  });

  app.get('/health', async () => ({ ok: true }));

  app.addHook('onRequest', async (request, reply) => {
    const pathname = request.url.split('?', 1)[0];
    if (
      pathname === '/health'
      || request.method === 'OPTIONS'
      || (pathname === '/v1/auth/login' && request.method === 'POST')
      || (pathname === '/v1/auth/wechat/start' && request.method === 'GET')
      || (pathname === '/v1/auth/wechat/callback' && request.method === 'GET')
      || (pathname === '/v1/auth/wechat/exchange' && request.method === 'POST')
      || (pathname === '/v1/auth/email/request-code' && request.method === 'POST')
      || (pathname === '/v1/auth/email/verify' && request.method === 'POST')
      || pathname.startsWith('/v1/location/public/')
    ) {
      return;
    }
    const token = bearerToken(request);
    const identity = token ? await authenticator.authenticate(token) : null;
    if (!identity) {
      return reply.code(401).send({ error: '访问令牌无效或已过期。' });
    }
    request.accountId = identity.accountId;
  });

  if (authenticator.login) {
    app.post<{ Body: LoginBody }>('/v1/auth/login', {
      schema: { body: loginSchema },
    }, async (request, reply) => {
      const session = await authenticator.login!({
        loginName: request.body.loginName,
        password: request.body.password,
        deviceId: request.body.deviceId,
      });
      if (!session) {
        return reply.code(401).send({ error: '账号或密码无效。' });
      }
      return reply.code(200).send(session);
    });
  }

  if (options.wechat && authenticator.loginWeChat) {
    const wechatOptions = options.wechat;
    const provider = new WeChatProvider(wechatOptions);
    const handoffs = new WeChatHandoffStore();
    const allowedOrigins = options.allowedOrigins ?? [];

    app.get<{ Querystring: WeChatStartQuery }>('/v1/auth/wechat/start', {
      schema: { querystring: weChatStartSchema },
    }, async (request, reply) => {
      let returnTo: string;
      try {
        returnTo = validReturnTo(request.query.returnTo, allowedOrigins);
      } catch (error) {
        return reply.code(400).send({ error: error instanceof Error ? error.message : '微信登录回调来源无效。' });
      }
      const state = provider.createState(returnTo);
      reply.header('set-cookie', weChatStateCookie(
        state,
        10 * 60,
        provider.callbackUrl.startsWith('https://'),
      ));
      const url = new URL(provider.authorizationUrl);
      url.searchParams.set('appid', wechatOptions.appId);
      url.searchParams.set('redirect_uri', provider.callbackUrl);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', 'snsapi_login');
      url.searchParams.set('state', state);
      url.hash = 'wechat_redirect';
      return reply.redirect(url.toString());
    });

    app.get<{ Querystring: WeChatCallbackQuery }>('/v1/auth/wechat/callback', {
      schema: { querystring: weChatCallbackSchema },
    }, async (request, reply) => {
      const state = request.query.state;
      const stateCookie = cookieValue(request, 'memorae_wechat_state');
      const verifiedState = state && stateCookie === state ? provider.verifyState(state) : null;
      if (!verifiedState) {
        return reply.code(400).send({ error: '微信登录状态已失效，请重新发起登录。' });
      }
      reply.header('set-cookie', weChatStateCookie(
        '',
        0,
        provider.callbackUrl.startsWith('https://'),
      ));
      if (request.query.error || !request.query.code) {
        return reply.redirect(addWeChatError(verifiedState.returnTo, 'wechat_denied'));
      }
      try {
        const identity = await provider.exchangeCode(request.query.code);
        const session = await authenticator.loginWeChat!(identity, 'web-wechat');
        const handoffCode = handoffs.issue(session);
        return reply.redirect(addWeChatResult(verifiedState.returnTo, handoffCode));
      } catch (error) {
        if (error instanceof WeChatProviderError) {
          return reply.redirect(addWeChatError(verifiedState.returnTo, 'wechat_unavailable'));
        }
        throw error;
      }
    });

    app.post<{ Body: WeChatExchangeBody }>('/v1/auth/wechat/exchange', {
      schema: { body: weChatExchangeSchema },
    }, async (request, reply) => {
      const session = handoffs.consume(request.body.code);
      if (!session) return reply.code(401).send({ error: '微信登录凭证已失效，请重新登录。' });
      return reply.code(200).send(session);
    });
  }

  const loginEmail = authenticator.loginEmail
    ? authenticator.loginEmail.bind(authenticator)
    : undefined;
  if (
    options.email
    && loginEmail
    && options.emailStore
  ) {
    const emailService = new EmailRegistrationService(options.emailStore, { loginEmail }, options.email);
    app.post<{ Body: EmailCodeRequestBody }>('/v1/auth/email/request-code', {
      schema: { body: emailCodeRequestSchema },
    }, async (request, reply) => {
      try {
        await emailService.requestCode(request.body.email);
        return reply.code(204).send();
      } catch (error) {
        if (error instanceof EmailRegistrationError) {
          return reply.code(error.statusCode).send({ error: error.message });
        }
        request.log.error(error);
        return reply.code(503).send({ error: '验证码邮件暂时无法发送，请稍后重试。' });
      }
    });

    app.post<{ Body: EmailCodeVerifyBody }>('/v1/auth/email/verify', {
      schema: { body: emailCodeVerifySchema },
    }, async (request, reply) => {
      try {
        const session = await emailService.verifyCode(
          request.body.email,
          request.body.code,
          request.body.deviceId ?? 'web-email',
        );
        return reply.code(200).send(session);
      } catch (error) {
        if (error instanceof EmailRegistrationError) {
          return reply.code(error.statusCode).send({ error: error.message });
        }
        request.log.error(error);
        return reply.code(503).send({ error: '邮箱登录暂时不可用，请稍后重试。' });
      }
    });
  }

  if (authenticator.logout) {
    app.post('/v1/auth/logout', async (request, reply) => {
      const token = bearerToken(request);
      if (!token) {
        return reply.code(401).send({ error: '访问令牌无效或已过期。' });
      }
      await authenticator.logout!(token);
      return reply.code(204).send();
    });
  }

  const requireLocationService = (): LocationService => {
    if (!options.locationService) throw new LocationServiceUnavailableError();
    return options.locationService;
  };

  app.get<{ Querystring: LocationSuggestQuery }>('/v1/location/suggest', {
    schema: { querystring: locationSuggestSchema },
  }, async (request, reply) => {
    try {
      return await requireLocationService().suggest(request.query.q, request.query.adcode);
    } catch (error) {
      const response = sendLocationError(error, reply);
      if (response) return response;
      throw error;
    }
  });

  app.get<{ Querystring: LocationReverseQuery }>('/v1/location/reverse', {
    schema: { querystring: locationReverseSchema },
  }, async (request, reply) => {
    try {
      return await requireLocationService().reverse({ lat: request.query.lat, lng: request.query.lng });
    } catch (error) {
      const response = sendLocationError(error, reply);
      if (response) return response;
      throw error;
    }
  });

  app.post<{ Body: ConvertGpsBody }>('/v1/location/convert-gps', {
    schema: { body: locationReverseSchema },
  }, async (request, reply) => {
    try {
      return await requireLocationService().convertGps(request.body);
    } catch (error) {
      const response = sendLocationError(error, reply);
      if (response) return response;
      throw error;
    }
  });

  // Anonymous, privacy-preserving location proxy for local-mode clients.
  // These endpoints accept only search text or coordinates and never access account data.
  app.get<{ Querystring: LocationSuggestQuery }>('/v1/location/public/suggest', { schema: { querystring: locationSuggestSchema } }, async (request, reply) => {
    try { return await requireLocationService().suggest(request.query.q, request.query.adcode); }
    catch (error) { const response = sendLocationError(error, reply); if (response) return response; throw error; }
  });
  app.get<{ Querystring: LocationReverseQuery }>('/v1/location/public/reverse', { schema: { querystring: locationReverseSchema } }, async (request, reply) => {
    try { return await requireLocationService().reverse({ lat: request.query.lat, lng: request.query.lng }); }
    catch (error) { const response = sendLocationError(error, reply); if (response) return response; throw error; }
  });
  app.post<{ Body: ConvertGpsBody }>('/v1/location/public/convert-gps', { schema: { body: locationReverseSchema } }, async (request, reply) => {
    try { return await requireLocationService().convertGps(request.body); }
    catch (error) { const response = sendLocationError(error, reply); if (response) return response; throw error; }
  });

  app.put<{ Body: VaultEnvelopeV1 }>('/v1/vault', {
    schema: { body: vaultEnvelopeSchema },
  }, async (request, reply) => {
    await options.store.putVault(currentAccountId(request), request.body);
    return reply.code(204).send();
  });

  app.get('/v1/vault', async (request, reply) => {
    const vault = await options.store.getVault(currentAccountId(request));
    if (!vault) return reply.code(404).send({ error: '服务器还没有钥匙信封。' });
    return vault;
  });

  app.put<{ Params: IdParams; Body: EncryptedMemoryV1 }>('/v1/memories/:id', {
    schema: {
      params: idParamsSchema,
      body: encryptedMemorySchema,
    },
  }, async (request, reply) => {
    if (request.params.id !== request.body.id) {
      return reply.code(400).send({ error: '路径中的记忆 ID 与密文不一致。' });
    }
    try {
      await options.store.putMemory(currentAccountId(request), request.body);
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof CipherConflictError) {
        return reply.code(409).send({ error: error.message });
      }
      throw error;
    }
  });

  app.get('/v1/memories', async (request): Promise<MemoryListResponse> => ({
    items: await options.store.listMemories(currentAccountId(request)),
  }));

  if (!options.photoTransfer) {
    app.put<{ Params: IdParams; Body: EncryptedPhotoV1 }>('/v1/photos/:id', {
      schema: {
        params: idParamsSchema,
        body: encryptedPhotoSchema,
      },
    }, async (request, reply) => {
      if (request.params.id !== request.body.id) {
        return reply.code(400).send({ error: '路径中的照片 ID 与密文不一致。' });
      }
      try {
        await options.store.putPhoto(currentAccountId(request), request.body);
        return reply.code(204).send();
      } catch (error) {
        if (error instanceof CipherConflictError) {
          return reply.code(409).send({ error: error.message });
        }
        throw error;
      }
    });

    app.get<{ Params: IdParams }>('/v1/photos/:id', {
      schema: { params: idParamsSchema },
    }, async (request, reply) => {
      const photo = await options.store.getPhoto(currentAccountId(request), request.params.id);
      if (!photo) return reply.code(404).send({ error: '找不到照片密文。' });
      return photo;
    });
  }

  if (options.photoTransfer) {
    app.post<{ Params: PhotoVariantParams; Body: BeginPhotoUploadBody }>(
      '/v1/photos/:id/:kind/upload',
      {
        schema: {
          params: photoVariantParamsSchema,
          body: beginPhotoUploadBodySchema,
        },
      },
      async (request, reply) => {
        try {
          return await options.photoTransfer!.beginUpload(currentAccountId(request), {
            id: request.params.id,
            kind: request.params.kind,
            cryptoVersion: request.body.cryptoVersion,
            metadata: request.body.metadata,
            contentLength: request.body.contentLength,
            contentSha256: request.body.contentSha256,
          });
        } catch (error) {
          const response = sendPhotoTransferError(error, reply);
          if (response) return response;
          throw error;
        }
      },
    );

    app.post<{ Params: PhotoVariantParams; Body: CompletePhotoUploadBody }>(
      '/v1/photos/:id/:kind/complete',
      {
        schema: {
          params: photoVariantParamsSchema,
          body: completePhotoUploadBodySchema,
        },
      },
      async (request, reply) => {
        try {
          await options.photoTransfer!.completeUpload(
            currentAccountId(request),
            request.params.id,
            request.params.kind,
            request.body.uploadId,
          );
          return reply.code(204).send();
        } catch (error) {
          const response = sendPhotoTransferError(error, reply);
          if (response) return response;
          throw error;
        }
      },
    );

    app.get<{ Params: PhotoVariantParams }>(
      '/v1/photos/:id/:kind/download',
      { schema: { params: photoVariantParamsSchema } },
      async (request, reply) => {
        const grant = await options.photoTransfer!.createDownload(
          currentAccountId(request),
          request.params.id,
          request.params.kind,
        );
        if (!grant) {
          return reply.code(404).send({ error: '找不到可下载的照片密文。' });
        }
        return grant;
      },
    );
  }

  return app;
}
