import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ProjectQueryDto } from './dto/project-query.dto';
import { ProjectDetailResponseDto, ProjectListResponseDto } from './dto/project-response.dto';
import { ProjectsService } from './projects.service';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';

@ApiTags('Projects')
@ApiErrorResponses()
@Controller('projects')
@RateLimit('public')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}
  @Get()
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  @ApiOkResponse({ type: ProjectListResponseDto })
  list(@Query() query: ProjectQueryDto): Promise<ProjectListResponseDto> {
    return this.projects.listPublic(query);
  }
  @Get(':idOrSlug')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  @ApiOkResponse({ type: ProjectDetailResponseDto })
  get(@Param('idOrSlug') idOrSlug: string): Promise<ProjectDetailResponseDto> {
    return this.projects.getPublic(idOrSlug);
  }
}
