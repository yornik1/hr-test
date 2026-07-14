import { BadRequestException, CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { BrandsService } from './brands.service';

// Resolves tenant context for webhook endpoints. PSP/GSP integrations get a
// per-brand callback URL configured on their side, we model that with the
// X-Brand-Id header.
@Injectable()
export class BrandHeaderGuard implements CanActivate {
  constructor(private readonly brands: BrandsService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const brandId = req.header('x-brand-id');

    if (!brandId) {
      throw new BadRequestException({
        message: 'X-Brand-Id header is required',
        code: 'BRAND_HEADER_MISSING',
      });
    }
    if (!this.brands.isKnown(brandId)) {
      throw new BadRequestException({
        message: `unknown brand '${brandId}'`,
        code: 'UNKNOWN_BRAND',
      });
    }

    (req as Request & { brandId: string }).brandId = brandId;
    return true;
  }
}
