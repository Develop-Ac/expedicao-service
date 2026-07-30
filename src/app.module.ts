import { Module } from '@nestjs/common';
import { RouterModule } from '@nestjs/core';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { S3Module } from './storage/s3.module';
import { EntregasModule } from './expedicao/entregas/entregas.module';

@Module({
imports: [
    PrismaModule,
    S3Module,
    EntregasModule,

    PrometheusModule.register({
      defaultMetrics: { enabled: true }, // CPU, memória, event loop, GC
    }),

    // ⬇️ Prefixa *somente* esses módulos com /compras
    RouterModule.register([
      { path: 'expedicao', module: EntregasModule }
    ]),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
