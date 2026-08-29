import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlatformRole, PreferredLanguage } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';
import { normalizeE164Input } from '../../marketplace/dto/create-lead.dto';

export class UpdateProfileDto {
  @ApiPropertyOptional({ nullable: true, minLength: 2, maxLength: 160 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @IsString()
  @Length(2, 160)
  fullName?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '+905551112233' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === null || value === '' ? null : normalizeE164Input(value),
  )
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone?: string | null;

  @ApiPropertyOptional({ enum: PreferredLanguage, nullable: true })
  @IsOptional()
  @IsEnum(PreferredLanguage)
  preferredLanguage?: PreferredLanguage | null;

  @ApiPropertyOptional({ nullable: true, example: 'TRY' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() || null : value,
  )
  @Matches(/^[A-Z]{3}$/)
  preferredCurrency?: string | null;
}

export class ProfileResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'email', readOnly: true }) email!: string;
  @ApiPropertyOptional({ nullable: true }) fullName!: string | null;
  @ApiPropertyOptional({ nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ enum: PreferredLanguage, nullable: true })
  preferredLanguage!: PreferredLanguage | null;
  @ApiPropertyOptional({ nullable: true }) preferredCurrency!: string | null;
  @ApiProperty({ format: 'date-time', readOnly: true }) createdAt!: Date;
  @ApiProperty({ enum: PlatformRole, isArray: true, readOnly: true }) roles!: PlatformRole[];
}
