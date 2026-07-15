# API

Swagger UI lives at `/docs`. Below is the same thing in curl.

Errors always look like this:

```json
{
  "statusCode": 403,
  "message": "authenticated for a different brand",
  "code": "TENANT_MISMATCH",
  "correlationId": "5f0f3a1e-..."
}
```

`code` is present for domain errors (`UNKNOWN_BRAND`, `EMAIL_TAKEN`,
`INVALID_CREDENTIALS`, `SESSION_INACTIVE`, `TENANT_MISMATCH`,
`BRAND_HEADER_MISSING`, `INVALID_PROVIDER`). Validation errors keep the
standard Nest shape (`message` is an array).

## Identity

### POST /auth/register

```bash
curl -s -X POST localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"brandId":"alpha","email":"user@example.com","password":"long-enough-password"}'
```

201:

```json
{
  "id": "0c9f8a3e-…",
  "email": "user@example.com",
  "brandId": "alpha",
  "createdAt": "2026-07-15T09:00:00.000Z"
}
```

409 `EMAIL_TAKEN` if the email is already registered *for this brand*. The
same email on another brand is a separate account.

### POST /auth/login

```bash
curl -s -X POST localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"brandId":"alpha","email":"user@example.com","password":"long-enough-password"}'
```

200:

```json
{ "accessToken": "eyJ…", "tokenType": "Bearer", "expiresIn": 86400 }
```

Login creates a row in `sessions`; the JWT carries the session id, so a
session can be revoked server-side and the token stops working.

### GET /profile/me

```bash
curl -s localhost:3000/profile/me -H "Authorization: Bearer $TOKEN"
```

200 returns the authenticated user. Sending `X-Brand-Id` with a *different*
brand than the token's one returns 403 `TENANT_MISMATCH`.

## Webhooks

Both stubs behave the same, `psp` and `gsp` only differ in the dedup scope.
Tenant context comes from the `X-Brand-Id` header (stands in for per-brand
callback URLs configured on the provider side).

The body must carry a minimal envelope: `eventId` and `type`. Everything else
is persisted untouched in `raw_events.payload`.

### POST /webhooks/psp/:provider

```bash
curl -s -X POST localhost:3000/webhooks/psp/stripe \
  -H 'Content-Type: application/json' -H 'X-Brand-Id: alpha' \
  -d '{"eventId":"evt-1001","type":"payment.succeeded","data":{"amount":100,"currency":"EUR"}}'
```

First delivery — 202:

```json
{ "status": "accepted", "eventId": "evt-1001" }
```

Repeat the same request — 200, nothing is written twice:

```json
{ "status": "duplicate", "eventId": "evt-1001" }
```

Missing envelope — 400. Missing/unknown `X-Brand-Id` — 400 with
`BRAND_HEADER_MISSING` / `UNKNOWN_BRAND`.

### POST /webhooks/gsp/:provider

Same contract:

```bash
curl -s -X POST localhost:3000/webhooks/gsp/pragmatic \
  -H 'Content-Type: application/json' -H 'X-Brand-Id: alpha' \
  -d '{"eventId":"round-77","type":"bet.settled","data":{"win":250}}'
```

Dedup key is `(brand, source:provider, eventId)`: the same `eventId` from
another provider, another source or another brand is a different event.

## Misc

`GET /health` pings the database and returns `{ "status": "ok" }`.
