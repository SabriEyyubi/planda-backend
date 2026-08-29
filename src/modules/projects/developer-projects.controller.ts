import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PlatformRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AccessTokenGuard } from '../../common/guards/access-token.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedRequest, AuthenticatedUser } from '../../common/types/authenticated-request';
import { MutationContext } from '../../common/types/mutation-context';
import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { CreateProjectDto } from './dto/create-project.dto';
import {
  DeveloperOverviewResponseDto,
  DeveloperProjectDetailResponseDto,
  DeveloperProjectListResponseDto,
  OperationsProjectQueryDto,
} from './dto/operations-project.dto';
import { ProjectResponseDto } from './dto/project-response.dto';
import { UpdateDeveloperProjectDto } from './dto/update-developer-project.dto';
import { ProjectsService } from './projects.service';

@ApiTags('Developer Projects')
@ApiErrorResponses()
@RateLimit('public')
@ApiBearerAuth()
@Controller('developer/projects')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(PlatformRole.DEVELOPER_MEMBER)
export class DeveloperProjectsController {
  constructor(private readonly projects: ProjectsService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: DeveloperProjectListResponseDto })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OperationsProjectQueryDto,
  ): Promise<DeveloperProjectListResponseDto> {
    return this.projects.listDeveloperProjects(user.id, query);
  }

  @Get(':projectId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: DeveloperProjectDetailResponseDto })
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ): Promise<DeveloperProjectDetailResponseDto> {
    return this.projects.getDeveloperProject(user.id, projectId);
  }

  @Post()
  @Header('Cache-Control', 'private, no-store')
  @ApiCreatedResponse({ type: ProjectResponseDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProjectDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProjectResponseDto> {
    return this.projects.createDeveloper(user.id, dto, this.context(req));
  }
  @Patch(':id')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: ProjectResponseDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateDeveloperProjectDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProjectResponseDto> {
    return this.projects.updateDeveloper(user.id, id, dto, this.context(req));
  }

  private context(request: AuthenticatedRequest): MutationContext {
    return {
      requestId: request.requestId,
      ...(request.ip ? { ipAddress: request.ip } : {}),
      ...(request.header('user-agent') ? { userAgent: request.header('user-agent') } : {}),
    };
  }
}

@ApiTags('Developer Operations')
@ApiErrorResponses()
@RateLimit('public')
@ApiBearerAuth()
@Controller('developer')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(PlatformRole.DEVELOPER_MEMBER)
export class DeveloperOverviewController {
  constructor(private readonly projects: ProjectsService) {}

  @Get('overview')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: DeveloperOverviewResponseDto })
  overview(@CurrentUser() user: AuthenticatedUser): Promise<DeveloperOverviewResponseDto> {
    return this.projects.getDeveloperOverview(user.id);
  }
}
