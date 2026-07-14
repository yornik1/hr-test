import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyKey } from '../persistence/entities/idempotency-key.entity';
import { RawEvent } from '../persistence/entities/raw-event.entity';
import { GspController } from './gsp.controller';
import { IngestService } from './ingest.service';
import { PspController } from './psp.controller';

@Module({
  imports: [TypeOrmModule.forFeature([RawEvent, IdempotencyKey])],
  controllers: [PspController, GspController],
  providers: [IngestService],
})
export class CallbacksModule {}
