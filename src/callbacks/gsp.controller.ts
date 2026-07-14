import {
  Body,
  Controller,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { BrandHeaderGuard } from '../common/brand-header.guard';
import { Brand } from '../common/brand.decorator';
import { CallbackDto } from './dto/callback.dto';
import { IngestService } from './ingest.service';

@Controller('webhooks/gsp')
@UseGuards(BrandHeaderGuard)
export class GspController {
  constructor(private readonly ingest: IngestService) {}

  @Post(':provider')
  async handle(
    @Param('provider') provider: string,
    @Body() dto: CallbackDto,
    @Brand() brandId: string,
    @Req() req: Request & { id?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.ingest.ingest({
      source: 'gsp',
      provider,
      brandId,
      eventId: dto.eventId,
      eventType: dto.type,
      payload: req.body,
      correlationId: req.id,
    });

    res.status(result.duplicate ? HttpStatus.OK : HttpStatus.ACCEPTED);
    return { status: result.duplicate ? 'duplicate' : 'accepted', eventId: dto.eventId };
  }
}
