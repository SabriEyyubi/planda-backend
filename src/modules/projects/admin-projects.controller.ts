import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PlatformRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AccessTokenGuard } from '../../common/guards/access-token.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedRequest, AuthenticatedUser } from '../../common/types/authenticated-request';
import { MutationContext } from '../../common/types/mutation-context';
import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import {
  AdminOverviewResponseDto,
  AdminProjectListResponseDto,
  AdminProjectMutationResponseDto,
  OperationsProjectQueryDto,
} from './dto/operations-project.dto';
import { UpdateAdminProjectStatusDto } from './dto/update-admin-project-status.dto';
import { ProjectsService } from './projects.service';

@ApiTags('Admin Projects')
@ApiErrorResponses()
@RateLimit('public')
@ApiBearerAuth()
@Controller('admin/projects')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
export class AdminProjectsController {
  constructor(private readonly projects: ProjectsService) {}
  @Get('review-queue')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: AdminProjectListResponseDto })
  reviewQueue(@Query() query: OperationsProjectQueryDto): Promise<AdminProjectListResponseDto> {
    return this.projects.listAdminReviewQueue(query);
  }

  @Patch(':id/status')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: AdminProjectMutationResponseDto })
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAdminProjectStatusDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<AdminProjectMutationResponseDto> {
    return this.projects.updateAdminStatus(user.id, id, dto.status, this.context(req));
  }

  private context(request: AuthenticatedRequest): MutationContext {
    return {
      requestId: request.requestId,
      ...(request.ip ? { ipAddress: request.ip } : {}),
      ...(request.header('user-agent') ? { userAgent: request.header('user-agent') } : {}),
    };
  }
}

@ApiTags('Admin Project Operations')
@ApiErrorResponses()
@RateLimit('public')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN)
export class AdminOperationsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get('overview')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: AdminOverviewResponseDto })
  overview(): Promise<AdminOverviewResponseDto> {
    return this.projects.getAdminOverview();
  }

  @Get('data-quality')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: AdminProjectListResponseDto })
  dataQuality(@Query() query: OperationsProjectQueryDto): Promise<AdminProjectListResponseDto> {
    return this.projects.listAdminDataQuality(query);
  }
}
