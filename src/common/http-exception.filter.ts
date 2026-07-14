import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';

// Single place that shapes error responses:
// { statusCode, message, code?, correlationId }
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = isHttp ? exception.getResponse() : { message: 'internal server error' };
    const body = typeof raw === 'string' ? { message: raw } : (raw as Record<string, unknown>);

    if (!isHttp) {
      this.logger.error({ err: exception }, 'unhandled exception');
    }

    res.status(status).json({
      statusCode: status,
      ...body,
      correlationId: req.id,
    });
  }
}
