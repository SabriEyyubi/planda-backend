import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PreferredLanguage } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateLeadDto {
  @ApiProperty({ minLength: 2, maxLength: 160 })
  @IsString()
  @Length(2, 160)
  fullName!: string;

  @ApiProperty({ example: '+905551112233' })
  @Transform(({ value }: { value: unknown }) => normalizeE164Input(value))
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @ApiProperty({ enum: PreferredLanguage })
  @IsEnum(PreferredLanguage)
  preferredLanguage!: PreferredLanguage;

  @ApiPropertyOptional({ example: '2+1' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  unitPreference?: string;

  @ApiPropertyOptional({ example: '8000000.0000' })
  @IsOptional()
  @Matches(/^\d{1,15}(?:\.\d{1,4})?$/)
  budgetMin?: string;

  @ApiPropertyOptional({ example: '12000000.0000' })
  @IsOptional()
  @Matches(/^\d{1,15}(?:\.\d{1,4})?$/)
  budgetMax?: string;

  @ApiProperty({ example: 'TRY' })
  @Matches(/^[A-Z]{3}$/)
  currency = 'TRY';

  @ApiProperty({ description: 'Must be true for developer sharing' })
  @IsBoolean()
  consentToDeveloper!: boolean;

  @ApiProperty({ example: 'kvkk-lead-v1' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @Length(1, 50)
  consentVersion!: string;
}

export function normalizeE164Input(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const compact = value.trim().replace(/[\s().-]/g, '');
  return compact.startsWith('00') ? `+${compact.slice(2)}` : compact;
}
