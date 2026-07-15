import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { RawEvent } from '../src/persistence/entities/raw-event.entity';
import { createTestApp, truncateAll } from './create-app';

describe('tenant isolation (e2e)', () => {
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

  const webhook = (brand: string, body: object) =>
    request(app.getHttpServer()).post('/webhooks/psp/stripe').set('X-Brand-Id', brand).send(body);

  it('does not dedupe the same event id across brands', async () => {
    const body = { eventId: 'evt-shared', type: 'payment.succeeded' };

    const a = await webhook('alpha', body);
    const b = await webhook('beta', body);

    expect(a.status).toBe(202);
    expect(b.status).toBe(202);

    const events = ds.getRepository(RawEvent);
    expect(await events.count({ where: { brandId: 'alpha' } })).toBe(1);
    expect(await events.count({ where: { brandId: 'beta' } })).toBe(1);
  });

  it('keeps brand A events invisible to brand B queries', async () => {
    await webhook('alpha', { eventId: 'e1', type: 't' });
    await webhook('alpha', { eventId: 'e2', type: 't' });

    expect(await ds.getRepository(RawEvent).count({ where: { brandId: 'beta' } })).toBe(0);
  });

  it('treats the same email on two brands as two independent accounts', async () => {
    const http = request(app.getHttpServer());
    const creds = { email: 'user@example.com', password: 'alpha-password' };

    const a = await http.post('/auth/register').send({ brandId: 'alpha', ...creds });
    const b = await http
      .post('/auth/register')
      .send({ brandId: 'beta', email: creds.email, password: 'beta-password' });

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.id).not.toBe(b.body.id);
  });

  it('does not let brand A credentials log into brand B', async () => {
    const http = request(app.getHttpServer());
    await http
      .post('/auth/register')
      .send({ brandId: 'alpha', email: 'a@example.com', password: 'password-a' });

    const res = await http
      .post('/auth/login')
      .send({ brandId: 'beta', email: 'a@example.com', password: 'password-a' });

    expect(res.status).toBe(401);
  });

  it('refuses a brand A token used against brand B context', async () => {
    const http = request(app.getHttpServer());
    await http
      .post('/auth/register')
      .send({ brandId: 'alpha', email: 'a@example.com', password: 'password-a' });
    const login = await http
      .post('/auth/login')
      .send({ brandId: 'alpha', email: 'a@example.com', password: 'password-a' });
    const token = login.body.accessToken as string;

    const own = await http.get('/profile/me').set('Authorization', `Bearer ${token}`);
    expect(own.status).toBe(200);
    expect(own.body.brandId).toBe('alpha');

    const crossTenant = await http
      .get('/profile/me')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Brand-Id', 'beta');

    expect(crossTenant.status).toBe(403);
    expect(crossTenant.body.code).toBe('TENANT_MISMATCH');
  });
});
