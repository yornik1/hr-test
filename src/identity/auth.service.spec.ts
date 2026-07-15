import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { QueryFailedError } from 'typeorm';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const users = { create: jest.fn((x) => x), save: jest.fn(), findOne: jest.fn() };
  const sessions = { create: jest.fn((x) => x), save: jest.fn() };
  const jwt = { signAsync: jest.fn().mockResolvedValue('signed.jwt') };
  const brands = { isKnown: (b: string) => b === 'alpha' || b === 'beta' };
  const config = { get: jest.fn((_key: string, def?: unknown) => def) };

  const service = new AuthService(
    users as never,
    sessions as never,
    jwt as never,
    brands as never,
    config as never,
  );

  beforeEach(() => jest.clearAllMocks());

  describe('register', () => {
    it('rejects an unknown brand', async () => {
      await expect(
        service.register({ brandId: 'ghost', email: 'a@example.com', password: 'password1' }),
      ).rejects.toThrow(BadRequestException);
      expect(users.save).not.toHaveBeenCalled();
    });

    it('stores a hashed password and lowercased email, returns no hash', async () => {
      users.save.mockImplementation(async (u) => ({
        ...u,
        id: 'u1',
        createdAt: new Date('2026-07-14T10:00:00Z'),
      }));

      const out = await service.register({
        brandId: 'alpha',
        email: 'Mixed.Case@Example.COM',
        password: 'password1',
      });

      const saved = users.save.mock.calls[0][0];
      expect(saved.email).toBe('mixed.case@example.com');
      expect(saved.passwordHash).not.toContain('password1');
      await expect(argon2.verify(saved.passwordHash, 'password1')).resolves.toBe(true);
      expect(out).toEqual({
        id: 'u1',
        email: 'mixed.case@example.com',
        brandId: 'alpha',
        createdAt: new Date('2026-07-14T10:00:00Z'),
      });
      expect(out).not.toHaveProperty('passwordHash');
    });

    it('maps a unique violation to 409', async () => {
      const dup = new QueryFailedError('INSERT', [], { code: '23505' } as never);
      users.save.mockRejectedValue(dup);

      await expect(
        service.register({ brandId: 'alpha', email: 'a@example.com', password: 'password1' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('rejects when the user does not exist in this brand', async () => {
      users.findOne.mockResolvedValue(null);

      await expect(
        service.login({ brandId: 'beta', email: 'a@example.com', password: 'password1' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(users.findOne).toHaveBeenCalledWith({
        where: { brandId: 'beta', email: 'a@example.com' },
      });
    });

    it('rejects a wrong password', async () => {
      users.findOne.mockResolvedValue({
        id: 'u1',
        brandId: 'alpha',
        passwordHash: await argon2.hash('correct-horse'),
      });

      await expect(
        service.login({ brandId: 'alpha', email: 'a@example.com', password: 'wrong-horse' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(sessions.save).not.toHaveBeenCalled();
    });

    it('creates a session bound to the user brand and signs a jwt', async () => {
      users.findOne.mockResolvedValue({
        id: 'u1',
        brandId: 'alpha',
        passwordHash: await argon2.hash('correct-horse'),
      });
      sessions.save.mockImplementation(async (s) => ({ ...s, id: 's1' }));

      const out = await service.login({
        brandId: 'alpha',
        email: 'a@example.com',
        password: 'correct-horse',
      });

      expect(sessions.save.mock.calls[0][0]).toMatchObject({ userId: 'u1', brandId: 'alpha' });
      expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 'u1', sid: 's1', brand: 'alpha' });
      expect(out).toEqual({ accessToken: 'signed.jwt', tokenType: 'Bearer', expiresIn: 86400 });
    });
  });
});
