import cors from '@fastify/cors';
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import {
  encryptedMemorySchema,
  encryptedPhotoSchema,
  idParamsSchema,
  vaultEnvelopeSchema,
  type EncryptedMemoryV1,
  type EncryptedPhotoV1,
  type MemoryListResponse,
  type VaultEnvelopeV1,
} from './contracts';
import { CipherConflictError, type CipherStore } from './store';

export interface BuildAppOptions {
  store: CipherStore;
  localToken: string;
  localUserId?: string;
  allowedOrigins?: string[];
}

interface IdParams {
  id: string;
}

function requireLocalToken(
  request: FastifyRequest,
  reply: FastifyReply,
  expectedToken: string,
): void | FastifyReply {
  if (request.headers.authorization !== `Bearer ${expectedToken}`) {
    return reply.code(401).send({ error: '本地访问令牌无效。' });
  }
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  if (options.localToken.length < 16) {
    throw new Error('本地访问令牌至少需要 16 个字符。');
  }

  const app = Fastify({
    logger: false,
    bodyLimit: 64 * 1024 * 1024,
    ajv: {
      customOptions: {
        removeAdditional: false,
      },
    },
  });
  const userId = options.localUserId ?? 'local-user';

  await app.register(cors, {
    origin: options.allowedOrigins ?? [
      'http://127.0.0.1:3000',
      'http://localhost:3000',
    ],
    methods: ['GET', 'PUT', 'OPTIONS'],
    allowedHeaders: ['authorization', 'content-type'],
  });

  app.get('/health', async () => ({ ok: true }));

  app.addHook('onRequest', async (request, reply) => {
    if (request.url === '/health' || request.method === 'OPTIONS') return;
    return requireLocalToken(request, reply, options.localToken);
  });

  app.put<{ Body: VaultEnvelopeV1 }>('/v1/vault', {
    schema: { body: vaultEnvelopeSchema },
  }, async (request, reply) => {
    await options.store.putVault(userId, request.body);
    return reply.code(204).send();
  });

  app.get('/v1/vault', async (_request, reply) => {
    const vault = await options.store.getVault(userId);
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
      await options.store.putMemory(userId, request.body);
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof CipherConflictError) {
        return reply.code(409).send({ error: error.message });
      }
      throw error;
    }
  });

  app.get('/v1/memories', async (): Promise<MemoryListResponse> => ({
    items: await options.store.listMemories(userId),
  }));

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
      await options.store.putPhoto(userId, request.body);
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
    const photo = await options.store.getPhoto(userId, request.params.id);
    if (!photo) return reply.code(404).send({ error: '找不到照片密文。' });
    return photo;
  });

  return app;
}
