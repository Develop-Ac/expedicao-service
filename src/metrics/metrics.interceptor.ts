// metrics.interceptor.ts
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Histogram } from 'prom-client';
import { Observable, tap } from 'rxjs';
import type { FastifyReply, FastifyRequest } from 'fastify';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(
    @InjectMetric('http_request_duration_seconds')
    private histogram: Histogram<string>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const end = this.histogram.startTimer();

    // No Express era `req.route?.path`; no Fastify o padrão da rota vem de
    // `routeOptions.url` (v4.10+), com `routerPath` como fallback legado.
    const route = () =>
      (req as any).routeOptions?.url ?? (req as any).routerPath ?? req.url;

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse<FastifyReply>();
          end({
            method: req.method,
            route: route(),
            status_code: res.statusCode,
          });
        },
        error: () => {
          end({ method: req.method, route: route(), status_code: 500 });
        },
      }),
    );
  }
}
