import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BrokerClientStatus, MembershipRole, OrganizationType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
const E164 = /^\+[1-9]\d{7,14}$/;
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const optionalTrim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() || null : value;

export class RecordProjectViewDto {
  @ApiProperty({ minLength: 16, maxLength: 200 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @Length(16, 200)
  sessionId!: string;
}
export class ProjectViewResponseDto {
  @ApiProperty() recorded!: boolean;
}
export class DeveloperAnalyticsQueryDto {
  @ApiPropertyOptional({ enum: [7, 30], default: 7 })
  @Type(() => Number)
  @IsInt()
  @IsIn([7, 30])
  range = 7;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}
export class OrganizationScopeQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}
export class OrganizationScopeResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: OrganizationType }) type!: OrganizationType;
  @ApiProperty({ enum: MembershipRole }) role!: MembershipRole;
  @ApiProperty() canManage!: boolean;
}
export class AnalyticsRangeDto {
  @ApiProperty() days!: number;
  @ApiProperty() from!: string;
  @ApiProperty() to!: string;
  @ApiProperty() previousFrom!: string;
  @ApiProperty() previousTo!: string;
  @ApiProperty({ example: 'UTC' }) timeZone!: 'UTC';
}
export class AnalyticsTotalsDto {
  @ApiProperty() views!: number;
  @ApiProperty() favorites!: number;
  @ApiProperty() leads!: number;
  @ApiProperty({ type: Number, nullable: true }) conversionRate!: number | null;
  @ApiProperty({ type: Number, nullable: true }) viewsChangePercent!: number | null;
  @ApiProperty({ type: Number, nullable: true }) favoritesChangePercent!: number | null;
  @ApiProperty({ type: Number, nullable: true }) leadsChangePercent!: number | null;
}
export class AnalyticsDailyDto {
  @ApiProperty() date!: string;
  @ApiProperty() views!: number;
  @ApiProperty() favorites!: number;
  @ApiProperty() leads!: number;
}
export class AnalyticsProjectDto {
  @ApiProperty() projectId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() views!: number;
  @ApiProperty() favorites!: number;
  @ApiProperty() leads!: number;
  @ApiProperty({ type: Number, nullable: true }) conversionRate!: number | null;
}
export class DeveloperAnalyticsResponseDto {
  @ApiProperty({ type: AnalyticsRangeDto }) range!: AnalyticsRangeDto;
  @ApiProperty({ type: AnalyticsTotalsDto }) totals!: AnalyticsTotalsDto;
  @ApiProperty({ type: [AnalyticsDailyDto] }) daily!: AnalyticsDailyDto[];
  @ApiProperty({ type: [AnalyticsProjectDto] }) topProjects!: AnalyticsProjectDto[];
}

export class BrokerClientQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  organizationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cursor?: string;
  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
  @ApiPropertyOptional({ enum: BrokerClientStatus })
  @IsOptional()
  @IsEnum(BrokerClientStatus)
  status?: BrokerClientStatus;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(160) q?: string;
}
export class CreateBrokerClientDto {
  @ApiProperty() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(160) fullName!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(optionalTrim)
  @Matches(E164)
  phone?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'email' })
  @IsOptional()
  @Transform(optionalTrim)
  @IsEmail()
  @MaxLength(320)
  email?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
export class UpdateBrokerClientDto {
  @ApiProperty() @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  fullName?: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(optionalTrim)
  @Matches(E164)
  phone?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'email' })
  @IsOptional()
  @Transform(optionalTrim)
  @IsEmail()
  @MaxLength(320)
  email?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
  @ApiPropertyOptional({ enum: BrokerClientStatus })
  @IsOptional()
  @IsEnum(BrokerClientStatus)
  status?: BrokerClientStatus;
}
export class BrokerClientResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty({ type: String, nullable: true }) phone!: string | null;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty({ enum: BrokerClientStatus }) status!: BrokerClientStatus;
  @ApiProperty() version!: number;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}
export class BrokerClientListResponseDto {
  @ApiProperty({ type: [BrokerClientResponseDto] }) items!: BrokerClientResponseDto[];
  @ApiProperty({
    type: 'object',
    properties: {
      hasNextPage: { type: 'boolean' },
      nextCursor: { type: 'string', nullable: true },
    },
    required: ['hasNextPage', 'nextCursor'],
  })
  pageInfo!: { hasNextPage: boolean; nextCursor: string | null };
}
export class BrokerContactResponseDto {
  @ApiProperty() projectId!: string;
  @ApiProperty() projectName!: string;
  @ApiProperty() developerName!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty({ type: String, nullable: true }) phone!: string | null;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
}

export class DeveloperSettingsResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) about!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'email' }) salesEmail!: string | null;
  @ApiProperty({ type: String, nullable: true }) salesPhone!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uri' }) websiteUrl!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uri' }) logoUrl!: string | null;
  @ApiProperty() version!: number;
}
export class UpdateDeveloperSettingsDto {
  @ApiProperty() @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(5000)
  about?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'email' })
  @IsOptional()
  @Transform(optionalTrim)
  @IsEmail()
  @MaxLength(320)
  salesEmail?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(optionalTrim)
  @Matches(E164)
  salesPhone?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'uri' })
  @IsOptional()
  @Transform(optionalTrim)
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  websiteUrl?: string | null;
}

export class UploadMediaDto {
  @ApiPropertyOptional({ enum: ['IMAGE'], default: 'IMAGE' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsIn(['IMAGE'])
  kind = 'IMAGE' as const;
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(240)
  altText?: string | null;
}
export class UpdateMediaDto {
  @ApiProperty() @IsInt() @Min(1) version!: number;
  @ApiProperty({ type: String, nullable: true })
  @IsOptional()
  @Transform(optionalTrim)
  @IsString()
  @MaxLength(240)
  altText?: string | null;
}
export class MediaOrderItemDto {
  @ApiProperty() @IsString() id!: string;
  @ApiProperty() @IsInt() @Min(1) version!: number;
}
export class ReorderMediaDto {
  @ApiProperty({ type: [MediaOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MediaOrderItemDto)
  items!: MediaOrderItemDto[];
}
export class DeleteMediaQueryDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) version!: number;
}
export class ArchiveClientQueryDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) version!: number;
}
export class DeveloperMediaResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['IMAGE'] }) kind!: 'IMAGE';
  @ApiProperty() url!: string;
  @ApiProperty({ type: String, nullable: true }) altText!: string | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() version!: number;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}
