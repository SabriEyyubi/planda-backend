import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { UnitStatus } from '@prisma/client';
import {
  IsEnum,
  IsBoolean,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateUnitDto {
  @ApiProperty() @IsString() @Length(1, 80) unitNumber!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 80) block?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(-10) @Max(200) floor?: number;
  @ApiProperty({ example: '2+1' }) @IsString() @Length(1, 40) roomType!: string;
  @ApiProperty({ example: '86.50', pattern: '^\\d{1,8}(?:\\.\\d{1,2})?$' })
  @Matches(/^\d{1,8}(?:\.\d{1,2})?$/)
  netArea!: string;
  @ApiPropertyOptional({ example: '104.00', pattern: '^\\d{1,8}(?:\\.\\d{1,2})?$' })
  @IsOptional()
  @Matches(/^\d{1,8}(?:\.\d{1,2})?$/)
  grossArea?: string;
  @ApiProperty({ example: '8750000.0000', pattern: '^\\d{1,15}(?:\\.\\d{1,4})?$' })
  @Matches(/^\d{1,15}(?:\.\d{1,4})?$/)
  price!: string;
  @ApiProperty({ example: 'TRY' }) @Matches(/^[A-Z]{3}$/) currency!: string;
  @ApiPropertyOptional({ enum: UnitStatus }) @IsOptional() @IsEnum(UnitStatus) status?: UnitStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 40) orientation?: string;
  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  floorPlanImageUrl?: string;
}

export class UpdateUnitDto extends PartialType(CreateUnitDto) {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion!: number;
}

export class CreatePaymentPlanDto {
  @ApiProperty() @IsString() @Length(1, 120) name!: string;
  @ApiProperty({ example: '30.00' }) @IsNumberString() downPaymentPercent!: string;
  @ApiProperty({ minimum: 0, maximum: 120 }) @IsInt() @Min(0) @Max(120) termMonths!: number;
  @ApiPropertyOptional({ example: '0.00', default: '0.00' })
  @IsOptional()
  @IsNumberString()
  deliveryPercent?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isRecommended?: boolean;
  @ApiPropertyOptional({
    example: '291666.0000',
    pattern: '^\\d{1,15}(?:\\.\\d{1,4})?$',
  })
  @IsOptional()
  @Matches(/^\d{1,15}(?:\.\d{1,4})?$/)
  monthlyPayment?: string;
  @ApiPropertyOptional({
    example: '10000000.0000',
    pattern: '^\\d{1,15}(?:\\.\\d{1,4})?$',
  })
  @IsOptional()
  @Matches(/^\d{1,15}(?:\.\d{1,4})?$/)
  totalPrice?: string;
  @ApiPropertyOptional({ example: '10.00' })
  @IsOptional()
  @Matches(/^\d{1,2}(?:\.\d{1,2})?$|^100(?:\.0{1,2})?$/)
  cashDiscountPercent?: string;
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  timelineNote?: string;
}
