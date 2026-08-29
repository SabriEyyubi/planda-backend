import { ApiProperty } from '@nestjs/swagger';
import { ProjectStatus } from '@prisma/client';
import { IsIn } from 'class-validator';

export class UpdateAdminProjectStatusDto {
  @ApiProperty({ enum: [ProjectStatus.PUBLISHED, ProjectStatus.ARCHIVED] })
  @IsIn([ProjectStatus.PUBLISHED, ProjectStatus.ARCHIVED])
  status!: ProjectStatus;
}
