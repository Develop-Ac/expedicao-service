// src/common/middlewares/app-token.middleware.ts
//
// Migrado de NestMiddleware (Express) para hook do Fastify.
// Motivo: sob o FastifyAdapter, middlewares aplicados via `consumer.apply()`
// recebem os objetos crus do Node (IncomingMessage/ServerResponse) através do
// @fastify/middie, que não possuem `.status()`, `.json()`, `.sendStatus()`,
// `.path` nem `.query`. Como este guard lê o token do BODY, ele precisa rodar
// em `preHandler` (no `onRequest` o body ainda não foi parseado).
//
// NOTA: este hook não está registrado em lugar nenhum hoje (o middleware
// original também não estava). Para ativar, no main.ts:
//   app.getHttpAdapter().getInstance().addHook('preHandler', appTokenPreHandler);
import type { FastifyReply, FastifyRequest } from 'fastify';

const APP_TOKEN = process.env.APP_TOKEN || '';

export function appTokenPreHandler(
  req: FastifyRequest,
  reply: FastifyReply,
  done: (err?: Error) => void,
) {
  if (req.method === 'OPTIONS') return reply.status(204).send();

  // whitelist do Swagger
  const path = (req.raw.url ?? '').split('?')[0] || '';
  if (
    path.startsWith('/docs') ||     // UI e assets
    path.startsWith('/docs-json') ||// JSON
    path.startsWith('/health')      // healthcheck, se tiver
  ) {
    return done();
  }

  const body = req.body as Record<string, any> | undefined;
  const query = req.query as Record<string, any> | undefined;

  const tokenFromBody = (body && (body.token as string)) || '';
  const tokenFromQuery = (query?.token as string) || '';
  const token = tokenFromBody || tokenFromQuery;

  if (!token) {
    return reply.status(401).send({ error: 'TOKEN_MISSING', message: 'Token é obrigatório.' });
  }
  if (token !== APP_TOKEN) {
    return reply.status(403).send({ error: 'TOKEN_INVALID', message: 'Token inválido.' });
  }

  if (body && 'token' in body) delete body.token;
  done();
}
