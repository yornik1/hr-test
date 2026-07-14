import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('idempotency_keys')
export class IdempotencyKey {
  @PrimaryColumn({ name: 'brand_id' })
  brandId: string;

  // "<source>:<provider>", e.g. "psp:stripe" — the same event id from
  // different providers must not collide
  @PrimaryColumn()
  scope: string;

  @PrimaryColumn()
  key: string;

  @Column({ name: 'raw_event_id', type: 'uuid' })
  rawEventId: string;

  @CreateDateColumn({ name: 'first_seen_at', type: 'timestamptz' })
  firstSeenAt: Date;
}
