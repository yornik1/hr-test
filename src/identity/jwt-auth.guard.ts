import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { Repository } from 'typeorm';
import { Session } from '../persistence/entities/session.entity';
import { User } from '../persistence/entities/user.entity';
import { AuthenticatedUser, JwtPayload } from './authenticated-user';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();

    const [scheme, token] = (req.header('authorization') ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException({
        message: 'missing bearer token',
        code: 'UNAUTHENTICATED',
      });
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException({
        message: 'invalid or expired token',
        code: 'UNAUTHENTICATED',
      });
    }

    // token alone is not enough — the session row must still be alive,
    // which is what makes server-side revocation possible at all
    const session = await this.sessions.findOne({
      where: { id: payload.sid, brandId: payload.brand },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException({
        message: 'session is not active',
        code: 'SESSION_INACTIVE',
      });
    }

    // a client explicitly asking for another tenant's context gets a hard no
    const headerBrand = req.header('x-brand-id');
    if (headerBrand && headerBrand !== session.brandId) {
      throw new ForbiddenException({
        message: 'authenticated for a different brand',
        code: 'TENANT_MISMATCH',
      });
    }

    const user = await this.users.findOne({
      where: { id: session.userId, brandId: session.brandId },
    });
    if (!user) {
      throw new UnauthorizedException({ message: 'user not found', code: 'UNAUTHENTICATED' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      brandId: user.brandId,
      createdAt: user.createdAt,
    };
    return true;
  }
}
