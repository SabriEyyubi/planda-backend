import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { ProjectResponseDto } from './project-response.dto';

export class OperationsProjectQueryDto {
  @ApiPropertyOptional({ enum: ProjectStatus })
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 100)
  q?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;

  @ApiPropertyOptional({ description: 'Opaque keyset cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;
}

export class OperationsPageInfoDto {
  @ApiPropertyOptional({ nullable: true }) nextCursor!: string | null;
  @ApiProperty() hasNextPage!: boolean;
}

export class DeveloperProjectItemDto extends ProjectResponseDto {
  @ApiProperty() unitCount!: number;
  @ApiProperty() availableUnitCount!: number;
  @ApiProperty() leadCount!: number;
  @ApiProperty() paymentPlanCount!: number;
  @ApiProperty({ minimum: 0, maximum: 100 }) completenessPercent!: number;
}

export class DeveloperProjectListResponseDto {
  @ApiProperty({ type: [DeveloperProjectItemDto] }) items!: DeveloperProjectItemDto[];
  @ApiProperty({ type: OperationsPageInfoDto }) pageInfo!: OperationsPageInfoDto;
}

export class DeveloperProjectDetailResponseDto extends DeveloperProjectItemDto {
  @ApiProperty() mediaCount!: number;
}

export class DeveloperOverviewResponseDto {
  @ApiProperty() projectCount!: number;
  @ApiProperty() publishedProjectCount!: number;
  @ApiProperty() availableUnitCount!: number;
  @ApiProperty() newLeadCount!: number;
  @ApiProperty() staleInventoryProjectCount!: number;
}

export class AdminOverviewResponseDto {
  @ApiProperty() publishedProjectCount!: number;
  @ApiProperty() inReviewProjectCount!: number;
  @ApiProperty() draftProjectCount!: number;
  @ApiProperty() archivedProjectCount!: number;
  @ApiProperty() staleStockProjectCount!: number;
  @ApiProperty() stalePriceProjectCount!: number;
}

export class AdminProjectReadItemDto extends DeveloperProjectItemDto {
  @ApiProperty({ type: [String] }) issues!: string[];
}

export class AdminProjectListResponseDto {
  @ApiProperty({ type: [AdminProjectReadItemDto] }) items!: AdminProjectReadItemDto[];
  @ApiProperty({ type: OperationsPageInfoDto }) pageInfo!: OperationsPageInfoDto;
}

export class AdminProjectMutationResponseDto {
  @ApiProperty({ type: ProjectResponseDto }) project!: ProjectResponseDto;
  @ApiProperty({ format: 'uuid' }) auditId!: string;
}
