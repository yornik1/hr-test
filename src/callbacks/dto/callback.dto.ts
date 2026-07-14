import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

// The minimal envelope we require from a provider callback. Anything else in
// the body is persisted as-is in raw_events.payload — mapping provider
// specifics is a job for adapters that don't exist yet.
export class CallbackDto {
  @IsString()
  @IsNotEmpty()
  eventId: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsObject()
  @IsOptional()
  data?: Record<string, unknown>;
}
