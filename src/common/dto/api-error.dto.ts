import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiErrorDto {
  @ApiProperty({ example: 400 }) statusCode!: number;
  @ApiProperty({ example: 'VALIDATION_ERROR' }) code!: string;
  @ApiProperty({ example: 'Validation failed' }) message!: string;
  @ApiPropertyOptional({ type: 'array', items: { type: 'string' } }) details?: unknown;
  @ApiProperty({ example: '4f12bc5f-1a5e-4d14-bf14-6c7bb19ea413' }) requestId!: string;
}
