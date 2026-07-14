import 'dotenv/config';
import { DataSource } from 'typeorm';
import { IdempotencyKey } from './entities/idempotency-key.entity';
import { RawEvent } from './entities/raw-event.entity';
import { Session } from './entities/session.entity';
import { User } from './entities/user.entity';

// used by the typeorm CLI (migrations); the app wires its own connection
// in persistence.module.ts
export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [User, Session, RawEvent, IdempotencyKey],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
});
