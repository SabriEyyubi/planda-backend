import { ApiProperty, ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger';
import { ProjectStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { CreateProjectDto } from './create-project.dto';

export class UpdateDeveloperProjectDto extends PartialType(
  PickType(CreateProjectDto, [
    'name',
    'slug',
    'provinceId',
    'districtId',
    'latitude',
    'longitude',
    'startingPrice',
    'currency',
    'deliveryDate',
    'summary',
    'heroImageUrl',
    'constructionStatus',
  ] as const),
) {
  @ApiProperty({ minimum: 1, description: 'Project version originally loaded by the editor' })
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiPropertyOptional({
    enum: [ProjectStatus.IN_REVIEW],
    description: 'Developer transition is limited to DRAFT → IN_REVIEW',
  })
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;
}
