import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, truncateAll } from './create-app';

describe('auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(app);
  });

  const register = (body: object) => request(app.getHttpServer()).post('/auth/register').send(body);

  it('registers, logs in and returns the profile', async () => {
    const reg = await register({
      brandId: 'alpha',
      email: 'User@Example.com',
      password: 'long-enough-password',
    });
    expect(reg.status).toBe(201);
    expect(reg.body.email).toBe('user@example.com');
    expect(reg.body).not.toHaveProperty('passwordHash');

    const login = await request(app.getHttpServer()).post('/auth/login').send({
      brandId: 'alpha',
      email: 'user@example.com',
      password: 'long-enough-password',
    });
    expect(login.status).toBe(200);
    expect(login.body.tokenType).toBe('Bearer');

    const me = await request(app.getHttpServer())
      .get('/profile/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({
      id: reg.body.id,
      email: 'user@example.com',
      brandId: 'alpha',
    });
  });

  it('returns 409 for a duplicate email within one brand', async () => {
    const body = { brandId: 'alpha', email: 'dup@example.com', password: 'long-enough-password' };
    await register(body);
    const second = await register(body);

    expect(second.status).toBe(409);
    expect(second.body.code).toBe('EMAIL_TAKEN');
  });

  it('validates input and reports unknown brands', async () => {
    const weak = await register({ brandId: 'alpha', email: 'a@example.com', password: 'short' });
    expect(weak.status).toBe(400);

    const ghost = await register({
      brandId: 'ghost',
      email: 'a@example.com',
      password: 'long-enough-password',
    });
    expect(ghost.status).toBe(400);
    expect(ghost.body.code).toBe('UNKNOWN_BRAND');
  });

  it('rejects wrong credentials and missing tokens', async () => {
    await register({ brandId: 'alpha', email: 'a@example.com', password: 'long-enough-password' });

    const wrong = await request(app.getHttpServer()).post('/auth/login').send({
      brandId: 'alpha',
      email: 'a@example.com',
      password: 'not-the-password',
    });
    expect(wrong.status).toBe(401);
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');

    const noToken = await request(app.getHttpServer()).get('/profile/me');
    expect(noToken.status).toBe(401);

    const badToken = await request(app.getHttpServer())
      .get('/profile/me')
      .set('Authorization', 'Bearer not-a-jwt');
    expect(badToken.status).toBe(401);
  });

  it('propagates the caller correlation id into error responses', async () => {
    const res = await request(app.getHttpServer())
      .get('/profile/me')
      .set('X-Request-Id', 'corr-42');

    expect(res.status).toBe(401);
    expect(res.headers['x-request-id']).toBe('corr-42');
    expect(res.body.correlationId).toBe('corr-42');
  });
});
