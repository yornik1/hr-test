import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Tenant registry backed by an env allowlist. Good enough for the assignment;
// in a real system brands live in their own table with per-brand webhook secrets.
@Injectable()
export class BrandsService {
  private readonly known: Set<string>;

  constructor(config: ConfigService) {
    this.known = new Set(
      config
        .getOrThrow<string>('BRANDS')
        .split(',')
        .map((b) => b.trim())
        .filter(Boolean),
    );
  }

  isKnown(brandId: string): boolean {
    return this.known.has(brandId);
  }
}
