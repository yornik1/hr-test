import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { IdempotencyKey } from '../src/persistence/entities/idempotency-key.entity';
import { RawEvent } from '../src/persistence/entities/raw-event.entity';
import { createTestApp, truncateAll } from './create-app';

describe('callback ingestion (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(app);
  });

  const post = (path: string, brand: string | null, body: object) => {
    const req = request(app.getHttpServer()).post(path);
    return (brand ? req.set('X-Brand-Id', brand) : req).send(body);
  };

  it('accepts a callback and persists the full payload', async () => {
    const res = await post('/webhooks/psp/stripe', 'alpha', {
      eventId: 'evt-1',
      type: 'payment.succeeded',
      data: { amount: 100, currency: 'EUR' },
      providerSpecificField: 'kept as-is',
    });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: 'accepted', eventId: 'evt-1' });

    const rows = await ds.getRepository(RawEvent).find();
    expect(rows).toHaveLength(1);
    expect(rows[0].brandId).toBe('alpha');
    expect(rows[0].source).toBe('psp');
    expect(rows[0].provider).toBe('stripe');
    expect(rows[0].externalId).toBe('evt-1');
    // fields outside the envelope survive — raw means raw
    expect(rows[0].payload).toMatchObject({
      eventId: 'evt-1',
      providerSpecificField: 'kept as-is',
    });
    expect(rows[0].processedAt).toBeNull();
  });

  it('ignores a repeated delivery of the same event', async () => {
    const body = { eventId: 'evt-2', type: 'payment.succeeded' };

    const first = await post('/webhooks/psp/stripe', 'alpha', body);
    const second = await post('/webhooks/psp/stripe', 'alpha', body);

    expect(first.status).toBe(202);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ status: 'duplicate', eventId: 'evt-2' });

    expect(await ds.getRepository(RawEvent).count()).toBe(1);
    expect(await ds.getRepository(IdempotencyKey).count()).toBe(1);
  });

  it('lets exactly one of N concurrent duplicates through', async () => {
    const body = { eventId: 'evt-3', type: 'bet.settled' };

    const results = await Promise.all(
      Array.from({ length: 5 }, () => post('/webhooks/gsp/pragmatic', 'alpha', body)),
    );

    const accepted = results.filter((r) => r.status === 202);
    const duplicates = results.filter((r) => r.status === 200);
    expect(accepted).toHaveLength(1);
    expect(duplicates).toHaveLength(4);
    expect(await ds.getRepository(RawEvent).count()).toBe(1);
  });

  it('does not dedupe the same event id across providers', async () => {
    await post('/webhooks/psp/stripe', 'alpha', { eventId: 'evt-4', type: 't' });
    const res = await post('/webhooks/psp/adyen', 'alpha', { eventId: 'evt-4', type: 't' });

    expect(res.status).toBe(202);
    expect(await ds.getRepository(RawEvent).count()).toBe(2);
  });

  it('does not dedupe psp against gsp', async () => {
    await post('/webhooks/psp/stripe', 'alpha', { eventId: 'evt-5', type: 't' });
    const res = await post('/webhooks/gsp/stripe', 'alpha', { eventId: 'evt-5', type: 't' });

    expect(res.status).toBe(202);
    expect(await ds.getRepository(RawEvent).count()).toBe(2);
  });

  it('rejects a payload without the required envelope', async () => {
    const res = await post('/webhooks/psp/stripe', 'alpha', { type: 'payment.succeeded' });

    expect(res.status).toBe(400);
    expect(await ds.getRepository(RawEvent).count()).toBe(0);
  });

  it('rejects a missing brand header', async () => {
    const res = await post('/webhooks/psp/stripe', null, { eventId: 'e', type: 't' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BRAND_HEADER_MISSING');
  });

  it('rejects an unknown brand', async () => {
    const res = await post('/webhooks/psp/stripe', 'ghost', { eventId: 'e', type: 't' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UNKNOWN_BRAND');
  });

  it('rejects a malformed provider segment', async () => {
    const res = await post('/webhooks/psp/st%24ripe', 'alpha', { eventId: 'e', type: 't' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PROVIDER');
  });
});
