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
}

interface IdParams {
  id: string;
}

interface LoginBody {
  loginName: string;
  password: string;
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
