import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export enum ProjectSort {
  NEWEST = 'NEWEST',
  PRICE_ASC = 'PRICE_ASC',
  PRICE_DESC = 'PRICE_DESC',
  DELIVERY_ASC = 'DELIVERY_ASC',
}

const NON_NEGATIVE_DECIMAL = /^\d{1,15}(?:\.\d{1,4})?$/;

export class ProjectQueryDto {
  @ApiPropertyOptional({ description: 'Project, developer or location search', maxLength: 100 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  q?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() provinceId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() districtId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() developerOrganizationId?: string;
  @ApiPropertyOptional({ example: '6000000.0000' })
  @IsOptional()
  @Matches(NON_NEGATIVE_DECIMAL)
  minPrice?: string;
  @ApiPropertyOptional({ example: '12000000.0000' })
  @IsOptional()
  @Matches(NON_NEGATIVE_DECIMAL)
  maxPrice?: string;
  @ApiPropertyOptional({ example: '2+1' })
  @IsOptional()
  @IsString()
  roomType?: string;
  @ApiPropertyOptional({ example: '80.00', description: 'Minimum net area of an available unit' })
  @IsOptional()
  @Matches(/^\d{1,8}(?:\.\d{1,2})?$/)
  minNetArea?: string;
  @ApiPropertyOptional({ example: '30.00', description: 'Maximum down-payment percentage' })
  @IsOptional()
  @Matches(/^\d{1,3}(?:\.\d{1,2})?$/)
  maxDownPaymentPercent?: string;
  @ApiPropertyOptional({ example: '300000.0000', description: 'Maximum monthly payment' })
  @IsOptional()
  @Matches(NON_NEGATIVE_DECIMAL)
  maxMonthlyPayment?: string;
  @ApiPropertyOptional({ description: 'Only ready or only not-ready projects' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  deliveryReady?: boolean;
  @ApiPropertyOptional({ format: 'date', description: 'Delivery on or before this date' })
  @IsOptional()
  @IsDateString({ strict: true })
  deliveryBefore?: string;
  @ApiPropertyOptional({ description: 'west,south,east,north decimal bounds' })
  @IsOptional()
  @Matches(
    /^-?\d{1,3}(?:\.\d+)?,\s*-?\d{1,2}(?:\.\d+)?,\s*-?\d{1,3}(?:\.\d+)?,\s*-?\d{1,2}(?:\.\d+)?$/,
  )
  bounds?: string;
  @ApiPropertyOptional({ enum: ProjectSort, default: ProjectSort.NEWEST })
  @IsOptional()
  @IsEnum(ProjectSort)
  sort?: ProjectSort = ProjectSort.NEWEST;
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
  @ApiPropertyOptional({ description: 'Opaque cursor from pageInfo.nextCursor' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  cursor?: string;
}
