import { randomUUID } from 'crypto';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { CallbacksModule } from './callbacks/callbacks.module';
import { CommonModule } from './common/common.module';
import { envSchema } from './config/env.schema';
import { HealthController } from './health.controller';
import { IdentityModule } from './identity/identity.module';
import { PersistenceModule } from './persistence/persistence.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get<string>('LOG_LEVEL', 'info'),
          // correlation id: reuse the caller's X-Request-Id or mint one;
          // it is echoed back in the response and in error bodies
          genReqId: (req, res) => {
            const id = (req.headers['x-request-id'] as string) ?? randomUUID();
            res.setHeader('x-request-id', id);
            return id;
          },
          redact: ['req.headers.authorization'],
        },
      }),
    }),
    CommonModule,
    PersistenceModule,
    IdentityModule,
    CallbacksModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
