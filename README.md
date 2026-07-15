# hr-test

Identity + PSP/GSP callback ingestion. NestJS, TypeScript, PostgreSQL.

Callbacks are stored as-is in `raw_events` and deduplicated through
`idempotency_keys`. Nothing here touches balances on purpose: a future ledger
worker is supposed to consume `raw_events` later. Reasoning and trade-offs are
in [DECISIONS.md](DECISIONS.md), request examples in [API.md](API.md).

## Run

Everything in docker:

    docker compose up --build

App: http://localhost:3000, Swagger UI: http://localhost:3000/docs
(raw spec at /docs-json). Migrations run automatically before the app starts.

Local development (only postgres in docker):

    cp .env.example .env
    npm ci
    npm run db:up
    npm run migration:run
    npm run start:dev

## Tests

    npm test            # unit
    npm run db:up       # e2e needs a live postgres, once
    npm run test:e2e

e2e creates and migrates its own database (`hr_test_e2e`) and never touches
the dev one. Point it at another server with `DATABASE_URL_E2E`.

## Configuration

| var             | default   | notes                                  |
| --------------- | --------- | -------------------------------------- |
| PORT            | 3000      |                                        |
| DATABASE_URL    | —         | required                               |
| JWT_SECRET      | —         | required, min 16 chars                 |
| JWT_TTL_SECONDS | 86400     | session and token lifetime             |
| BRANDS          | —         | comma-separated tenant allowlist       |
| LOG_LEVEL       | info      | pino level                             |

## Layout

    src/identity      auth + profile (users, sessions, jwt guard)
    src/callbacks     psp/gsp webhook controllers + ingest service
    src/persistence   entities, migrations, typeorm data source
    src/common        tenant allowlist/guard, error filter
    test/             e2e: auth, callback idempotency, tenant isolation

Logs are JSON (pino) with a request id: incoming `X-Request-Id` is reused,
otherwise one is generated. The same id is echoed in the response header and
in error bodies as `correlationId`.
