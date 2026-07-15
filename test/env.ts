// e2e always runs against its own database so it can never wipe dev data.
// Override with DATABASE_URL_E2E if your postgres lives elsewhere.
process.env.DATABASE_URL =
  process.env.DATABASE_URL_E2E ?? 'postgres://hr:hr@localhost:5432/hr_test_e2e';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'e2e-only-secret-not-for-prod';
process.env.JWT_TTL_SECONDS = process.env.JWT_TTL_SECONDS ?? '3600';
process.env.BRANDS = 'alpha,beta';
process.env.LOG_LEVEL = process.env.E2E_LOG_LEVEL ?? 'silent';
