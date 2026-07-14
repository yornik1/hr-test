import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { BrandsService } from './brands.service';
import { AllExceptionsFilter } from './http-exception.filter';

@Global()
@Module({
  providers: [BrandsService, { provide: APP_FILTER, useClass: AllExceptionsFilter }],
  exports: [BrandsService],
})
export class CommonModule {}
