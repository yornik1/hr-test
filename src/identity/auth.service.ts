import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { QueryFailedError, Repository } from 'typeorm';
import { BrandsService } from '../common/brands.service';
import { Session } from '../persistence/entities/session.entity';
import { User } from '../persistence/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
    private readonly jwt: JwtService,
    private readonly brands: BrandsService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    if (!this.brands.isKnown(dto.brandId)) {
      throw new BadRequestException({
        message: `unknown brand '${dto.brandId}'`,
        code: 'UNKNOWN_BRAND',
      });
    }

    const email = dto.email.toLowerCase();
    const passwordHash = await argon2.hash(dto.password);

    try {
      // no select-then-insert: the unique constraint decides, so concurrent
      // registrations can't slip through
      const user = await this.users.save(
        this.users.create({ brandId: dto.brandId, email, passwordHash }),
      );
      return { id: user.id, email: user.email, brandId: user.brandId, createdAt: user.createdAt };
    } catch (e) {
      if (this.isUniqueViolation(e)) {
        throw new ConflictException({
          message: 'email already registered for this brand',
          code: 'EMAIL_TAKEN',
        });
      }
      throw e;
    }
  }

  async login(dto: LoginDto) {
    const email = dto.email.toLowerCase();
    // brand is part of the lookup — same email on another brand is a different account
    const user = await this.users.findOne({ where: { brandId: dto.brandId, email } });
    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
      // one error for every failure mode, nothing to enumerate
      throw new UnauthorizedException({
        message: 'invalid credentials',
        code: 'INVALID_CREDENTIALS',
      });
    }

    const ttlSeconds = this.config.get<number>('JWT_TTL_SECONDS', 86400);
    const session = await this.sessions.save(
      this.sessions.create({
        userId: user.id,
        brandId: user.brandId,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      }),
    );

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      sid: session.id,
      brand: user.brandId,
    });

    return { accessToken, tokenType: 'Bearer', expiresIn: ttlSeconds };
  }

  private isUniqueViolation(e: unknown): boolean {
    return (
      e instanceof QueryFailedError &&
      (e.driverError as { code?: string } | undefined)?.code === PG_UNIQUE_VIOLATION
    );
  }
}
