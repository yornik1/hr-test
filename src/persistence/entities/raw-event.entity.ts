import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type CallbackSource = 'psp' | 'gsp';

@Entity('raw_events')
export class RawEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'brand_id' })
  brandId: string;

  @Column({ type: 'text' })
  source: CallbackSource;

  @Column()
  provider: string;

  @Column({ name: 'event_type', type: 'text', nullable: true })
  eventType: string | null;

  @Column({ name: 'external_id' })
  externalId: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ name: 'correlation_id', type: 'text', nullable: true })
  correlationId: string | null;

  @CreateDateColumn({ name: 'received_at', type: 'timestamptz' })
  receivedAt: Date;

  // reserved for the future ledger consumer; nobody sets it yet
  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;
}
