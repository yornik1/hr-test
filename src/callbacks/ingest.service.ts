import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { DataSource } from 'typeorm';
import { CallbackSource, RawEvent } from '../persistence/entities/raw-event.entity';

export interface IngestInput {
  source: CallbackSource;
  provider: string;
  brandId: string;
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  correlationId?: string;
}

export interface IngestResult {
  duplicate: boolean;
  rawEventId?: string;
}

// marker to roll the transaction back without treating it as a failure
class DuplicateCallback extends Error {}

const PROVIDER_RE = /^[a-z0-9][a-z0-9_-]*$/;

@Injectable()
export class IngestService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectPinoLogger(IngestService.name) private readonly logger: PinoLogger,
  ) {}

  // Stores the callback and nothing else. Balance changes belong to a ledger
  // worker that will consume raw_events (processed_at is its cursor).
  async ingest(input: IngestInput): Promise<IngestResult> {
    if (!PROVIDER_RE.test(input.provider)) {
      throw new BadRequestException({
        message: `invalid provider '${input.provider}'`,
        code: 'INVALID_PROVIDER',
      });
    }

    const scope = `${input.source}:${input.provider}`;

    const result = await this.dataSource
      .transaction(async (em) => {
        const events = em.getRepository(RawEvent);
        const event = await events.save(
          events.create({
            brandId: input.brandId,
            source: input.source,
            provider: input.provider,
            eventType: input.eventType,
            externalId: input.eventId,
            payload: input.payload,
            correlationId: input.correlationId ?? null,
          }),
        );

        // The PK on (brand_id, scope, key) arbitrates races: of two concurrent
        // deliveries of the same event one insert wins, the loser sees 0 rows
        // and rolls its raw_event back.
        const claimed: unknown[] = await em.query(
          `INSERT INTO idempotency_keys (brand_id, scope, key, raw_event_id)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (brand_id, scope, key) DO NOTHING
           RETURNING raw_event_id`,
          [input.brandId, scope, input.eventId, event.id],
        );
        if (claimed.length === 0) {
          throw new DuplicateCallback();
        }

        return { duplicate: false, rawEventId: event.id } satisfies IngestResult;
      })
      .catch((e) => {
        if (e instanceof DuplicateCallback) {
          return { duplicate: true } satisfies IngestResult;
        }
        throw e;
      });

    this.logger.info(
      {
        brandId: input.brandId,
        scope,
        eventId: input.eventId,
        duplicate: result.duplicate,
        correlationId: input.correlationId,
      },
      result.duplicate ? 'duplicate callback ignored' : 'callback stored',
    );

    return result;
  }
}
