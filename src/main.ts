// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import fastifyHelmet from '@fastify/helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
// (opcional, mas recomendado quando usa cookies/autenticação)
import fastifyCookie from '@fastify/cookie';

// substitui bodyParser.json/urlencoded({ limit: '25mb' })
const BODY_LIMIT = 25 * 1024 * 1024;

function parseOrigins(env?: string): (string | RegExp)[] {
  if (!env) return [];
  return env
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => {
      // Permite regex usando prefixo "regex:"
      if (s.startsWith('regex:')) {
        const pattern = s.slice(6);
        return new RegExp(pattern);
      }
      return s;
    });
}

function isAllowedOrigin(origin: string | undefined, allowed: (string | RegExp)[]) {
  if (!origin) return true; // requests server-to-server, curl, etc.
  if (allowed.length === 0) return true; // se não configurou nada, libera
  for (const rule of allowed) {
    if (rule instanceof RegExp && rule.test(origin)) return true;
    if (typeof rule === 'string' && rule === origin) return true;
  }
  return false;
}

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // O FastifyAdapter já registra @fastify/formbody (urlencoded) automaticamente.
    new FastifyAdapter({ bodyLimit: BODY_LIMIT }),
    { bufferLogs: true },
  );

  // Se estiver atrás de proxy reverso (Nginx/Traefik) e usar cookies Secure, habilite:
  // new FastifyAdapter({ bodyLimit: BODY_LIMIT, trustProxy: 1 })

  await app.register(fastifyCookie as any);

  await app.register(fastifyHelmet as any, {
    contentSecurityPolicy: false,     // necessário para swagger-ui
    crossOriginEmbedderPolicy: false, // evita bloqueio de assets
  });

  const fastify = app.getHttpAdapter().getInstance();

  // Basic Auth do Swagger — equivalente ao antigo app.use(['/docs', '/docs-json'], ...)
  fastify.addHook(
    'onRequest',
    (req: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) => {
      const path = (req.raw.url ?? '').split('?')[0];
      if (!path.startsWith('/docs')) return done();

      const authHeader = req.headers.authorization;

      const user = 'admin';
      const password = 'Ac@2025acesso';

      if (!authHeader || !authHeader.startsWith('Basic ')) {
        reply.header('WWW-Authenticate', 'Basic realm="Swagger"');
        return reply.status(401).send('Autenticação necessária');
      }

      const base64Credentials = authHeader.split(' ')[1];
      const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');

      const [inputUser, inputPassword] = credentials.split(':');

      if (inputUser !== user || inputPassword !== password) {
        reply.header('WWW-Authenticate', 'Basic realm="Swagger"');
        return reply.status(401).send('Usuário ou senha inválidos');
      }

      done();
    },
  );

  const allowedOrigins = parseOrigins(process.env.CORS_ORIGIN);
  // Ex.: CORS_ORIGIN="http://intranet.acacessorios.local,http://localhost:3000"
  // ou   CORS_ORIGIN="regex:^https?://(localhost:\d+|.*\.acacessorios\.local)$"

  app.enableCors({
    origin: (origin, callback) => {
      const ok = isAllowedOrigin(origin, allowedOrigins);
      callback(null, ok);
    },
    credentials: true, // necessário se usar cookies/autenticação
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'Cache-Control',
      'Pragma',
    ],
    exposedHeaders: ['Content-Disposition'],
    maxAge: 86400, // cache do preflight por 1 dia
  });

  // Garante Vary: Origin (útil se usar origin dinâmico/função)
  fastify.addHook(
    'onRequest',
    (_req: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) => {
      reply.header('Vary', 'Origin');
      done();
    },
  );

  // (opcional) prefixo global
  // app.setGlobalPrefix('api');

  // === Swagger only if enabled ===
  if (process.env.SWAGGER_ENABLED === 'true') {
    const config = new DocumentBuilder()
      .setTitle('Expedição API')
      .setDescription(`
      API do módulo de Expedição da AC Acessórios

      ## Funcionalidades principais:
      - **Expedição**: Gerenciamento de processos de expedição, envio e recebimento de mercadorias

      ## Autenticação:
      A API utiliza tokens de acesso que podem ser enviados via query parameter \`token\` ou header \`Authorization: Bearer <token>\`.
      `)
      .setVersion('1.0.0')
      .setContact('AC Acessórios - TI', 'https://acacessorios.com.br', 'ti@acacessorios.com.br')
      .setLicense('Proprietário', '')
      .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token JWT para autenticação',
      },
      'jwt',
      )
      .addApiKey(
      {
        type: 'apiKey',
        name: 'token',
        in: 'query',
        description: 'TOKEN de acesso da aplicação enviado via query parameter',
      },
      'appToken',
      )
      .addServer(process.env.PUBLIC_URL ?? 'http://localhost:8000', 'Servidor de Desenvolvimento')
      .addServer('http://expedicao-service.acacessorios.local', 'Servidor de Produção')
      .build();

    const document = SwaggerModule.createDocument(app, config, {
      operationIdFactory: (controllerKey: string, methodKey: string) => methodKey,
      deepScanRoutes: true,
    });

    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        docExpansion: 'none',
        filter: true,
        showRequestHeaders: true,
        tryItOutEnabled: true,
      },
      customSiteTitle: 'Intranet AC Acessórios — API Documentation',
      customfavIcon: '/favicon.ico',
      customJs: [
        'https://unpkg.com/swagger-ui-themes@3.0.1/themes/3.x/theme-material.css',
      ],
      customCssUrl: [
        'https://unpkg.com/swagger-ui-themes@3.0.1/themes/3.x/theme-material.css',
      ],
    });
    // UI: /docs • JSON: /docs-json
  }

  const port = parseInt(process.env.PORT || '8000', 10);
  await app.listen(port, '0.0.0.0');
  console.log(`API listening on http://localhost:${port}`);
  if (process.env.SWAGGER_ENABLED === 'true') {
    console.log(`Swagger em http://localhost:${port}/docs`);
  }
}
bootstrap();
