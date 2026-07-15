# Decisions

Notes on the non-obvious choices, roughly in the order I made them.

## Callback envelope instead of "accept anything"

Providers all have different payload shapes, but building per-provider
adapters for a stub is premature. So the contract is a minimal envelope
(`eventId`, `type`) that any adapter layer can produce later, and the rest of
the body is stored untouched in `raw_events.payload`. Requests without the
envelope get a 400 and are not persisted: without a stable event id there is
nothing to deduplicate on, and storing unidentifiable junk mostly helps
whoever wants to flood the table.

Trade-off: a real PSP won't send our envelope. In production the mapping from
provider format to envelope happens in a thin provider adapter before ingest;
the ingest path itself would not change.

## Idempotency: insert-first, let the constraint decide

`idempotency_keys` has a composite PK `(brand_id, scope, key)` where scope is
`source:provider` ("psp:stripe") and key is the provider event id. Ingest runs
in one transaction: insert into `raw_events`, then
`INSERT ... ON CONFLICT DO NOTHING` into `idempotency_keys`. If the second
insert claims nothing, the whole transaction rolls back and the request is
answered as a duplicate.

There is deliberately no check-then-insert: with concurrent deliveries of the
same event both requests pass the check. With insert-first, postgres blocks
the second insert until the first transaction commits, so exactly one
delivery wins. Covered by an e2e test with 5 parallel requests.

Response codes: 202 for a fresh event (accepted for processing later, which is
literally true), 200 for a duplicate. Both are 2xx on purpose — the provider
should stop retrying in either case.

## Tenant model

Everything tenant-scoped carries a `brand_id` column and every query filters
by it. Brands themselves are an env allowlist (`BRANDS=alpha,beta`) — a table
would be the real answer (with per-brand webhook secrets etc.), but for the
assignment a registry that can reject unknown tenants is enough.

Webhooks resolve the brand from `X-Brand-Id`. In reality you give each brand
its own callback URL and derive tenant from routing/config, the header just
models that in a testable way.

Identity is tenant-scoped too: uniqueness of email is per brand, and login
looks the user up by `(brand_id, email)`, so credentials from brand A simply
don't exist in brand B. The JWT carries the brand; if a request also sends
`X-Brand-Id` and it disagrees with the token, that's a 403 `TENANT_MISMATCH`.

## Auth: JWT + a sessions row

Pure stateless JWT can't be revoked, pure DB sessions make every service that
verifies tokens hit the DB with an opaque string. The compromise: the JWT
carries `sub`/`sid`/`brand` and is verified by signature, then the guard
checks the `sessions` row is alive (not revoked, not expired). Revocation is
one `UPDATE ... SET revoked_at = now()`.

Out of scope, consciously: refresh tokens, logout endpoint, session pruning,
rate limiting on login. Passwords are argon2id.

## No balance updates, ledger readiness

The assignment says PSP/GSP adapters must not touch balances, and they don't:
ingest writes `raw_events` and nothing else. The table is effectively an
outbox for a ledger worker that doesn't exist yet: `processed_at IS NULL` is
its work queue, `received_at` gives ordering, `id` gives the worker its own
idempotency key, and the full payload is there to build ledger entries from.
Double-entry accounting, wallets and the worker itself are all downstream of
this table and need no changes on the ingest side.

## What I skipped and would do next

- webhook signature verification (HMAC per brand+provider secret) — the
  biggest real-world gap; needs a brands table with secrets first
- raw-body capture for signatures (currently the parsed JSON is stored, which
  is fine for dedup but not for verifying signatures byte-exact)
- retry/poison handling for the future ledger worker (attempts counter,
  dead-letter state)
- rate limiting and audit log on auth endpoints

## Small things

- Schema lives in hand-written SQL migrations, `synchronize` is off. Entities
  are just mappings.
- Errors: one global filter, `{ statusCode, message, code?, correlationId }`.
  Machine-readable `code` only where a client can actually branch on it.
- Logs are pino JSON. `X-Request-Id` in → same id out (header + error body +
  `raw_events.correlation_id`), generated when absent.
- e2e uses its own database it creates itself; `--runInBand` because the
  suites share one schema and truncate between tests.
