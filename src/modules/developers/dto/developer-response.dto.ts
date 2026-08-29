import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PublicDeveloperDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) verifiedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) about!: string | null;
  @ApiPropertyOptional({ nullable: true }) logoUrl!: string | null;
  @ApiProperty() publishedProjectCount!: number;
  @ApiProperty({ nullable: true, example: '6750000.0000' }) startingPrice!: string | null;
  @ApiProperty({ nullable: true, example: 'TRY' }) currency!: string | null;
}
