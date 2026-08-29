import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConstructionStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsISO4217CurrencyCode,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateProjectDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() developerOrganizationId!: string;
  @ApiProperty({ example: 'Planda Park' }) @IsString() @MaxLength(200) name!: string;
  @ApiProperty({ example: 'planda-park' })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(200)
  slug!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() provinceId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() districtId!: string;
  @ApiProperty({ example: '40.990868', description: 'Exact decimal string' })
  @IsLatitude()
  latitude!: string;
  @ApiProperty({ example: '29.027707', description: 'Exact decimal string' })
  @IsLongitude()
  longitude!: string;
  @ApiProperty({ example: '7500000.00', description: 'Non-negative decimal string' })
  @Matches(/^\d{1,15}(?:\.\d{1,4})?$/)
  startingPrice!: string;
  @ApiProperty({ example: 'TRY', minLength: 3, maxLength: 3 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsISO4217CurrencyCode()
  currency!: string;
  @ApiPropertyOptional({ example: '2028-06-30', format: 'date' })
  @IsOptional()
  @IsDateString({ strict: true })
  deliveryDate?: string;
  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string;
  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  heroImageUrl?: string;
  @ApiPropertyOptional({ enum: ConstructionStatus, default: ConstructionStatus.PLANNED })
  @IsOptional()
  @IsEnum(ConstructionStatus)
  constructionStatus?: ConstructionStatus;
}
