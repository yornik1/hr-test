import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const Brand = createParamDecorator(
  (_: unknown, context: ExecutionContext): string =>
    context.switchToHttp().getRequest().brandId,
);
