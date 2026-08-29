/* eslint-disable @typescript-eslint/explicit-function-return-type */
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PlatformRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AccessTokenGuard } from '../../common/guards/access-token.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedRequest, AuthenticatedUser } from '../../common/types/authenticated-request';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { GrowthService } from './growth.service';
import { AppException } from '../../common/exceptions/app.exception';
import {
  ArchiveClientQueryDto,
  BrokerClientListResponseDto,
  BrokerClientQueryDto,
  BrokerClientResponseDto,
  BrokerContactResponseDto,
  CreateBrokerClientDto,
  DeleteMediaQueryDto,
  DeveloperAnalyticsQueryDto,
  DeveloperAnalyticsResponseDto,
  DeveloperMediaResponseDto,
  DeveloperSettingsResponseDto,
  OrganizationScopeQueryDto,
  OrganizationScopeResponseDto,
  ProjectViewResponseDto,
  RecordProjectViewDto,
  ReorderMediaDto,
  UpdateBrokerClientDto,
  UpdateDeveloperSettingsDto,
  UpdateMediaDto,
  UploadMediaDto,
} from './dto/growth.dto';

@ApiTags('Project Analytics')
@Controller('projects')
export class ProjectViewsController {
  constructor(private readonly growth: GrowthService) {}
  @Post(':idOrSlug/views')
  @RateLimit('public')
  @HttpCode(200)
  @ApiOkResponse({ type: ProjectViewResponseDto })
  record(@Param('idOrSlug') id: string, @Body() dto: RecordProjectViewDto) {
    return this.growth.recordView(id, dto.sessionId);
  }
}

@ApiTags('Project Media')
@Controller('media')
export class PublicMediaController {
  constructor(private readonly growth: GrowthService) {}
  @Get(':mediaId')
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  async get(
    @Param('mediaId', new ParseUUIDPipe()) id: string,
    @Res() response: Response,
  ): Promise<void> {
    const media = await this.growth.publicMedia(id);
    response.setHeader('Content-Type', media.contentType);
    response.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    response.send(Buffer.from(media.body));
  }
}

@ApiTags('Developer Growth')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(PlatformRole.DEVELOPER_MEMBER)
@Controller('developer')
export class DeveloperGrowthController {
  constructor(private readonly growth: GrowthService) {}
  @Get('organizations')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: [OrganizationScopeResponseDto] })
  organizations(@CurrentUser() user: AuthenticatedUser) {
    return this.growth.organizations(user.id, 'DEVELOPER');
  }
  @Get('analytics')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: DeveloperAnalyticsResponseDto })
  analytics(@CurrentUser() user: AuthenticatedUser, @Query() query: DeveloperAnalyticsQueryDto) {
    return this.growth.analytics(user.id, query.range, query.organizationId);
  }
  @Get('settings')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: DeveloperSettingsResponseDto })
  settings(@CurrentUser() user: AuthenticatedUser, @Query() query: OrganizationScopeQueryDto) {
    return this.growth.settings(user.id, query.organizationId);
  }
  @Patch('settings')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: DeveloperSettingsResponseDto })
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OrganizationScopeQueryDto,
    @Body() dto: UpdateDeveloperSettingsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    if (Object.keys(dto).every((key) => key === 'version'))
      throw new AppException('EMPTY_UPDATE', 'At least one setting must change', 400);
    return this.growth.updateSettings(user.id, dto, this.context(req), query.organizationId);
  }
  @Get('projects/:projectId/media')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: [DeveloperMediaResponseDto] })
  media(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    return this.growth.listMedia(user.id, projectId);
  }
  @Post('projects/:projectId/media')
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        kind: { type: 'string', enum: ['IMAGE'], default: 'IMAGE' },
        altText: { type: 'string', nullable: true },
      },
    },
  })
  @ApiCreatedResponse({ type: DeveloperMediaResponseDto })
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadMediaDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.growth.uploadMedia(user.id, projectId, file, dto, this.context(req));
  }
  @Patch('projects/:projectId/media/:mediaId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: DeveloperMediaResponseDto })
  updateMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('mediaId', new ParseUUIDPipe()) mediaId: string,
    @Body() dto: UpdateMediaDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.growth.updateMedia(user.id, projectId, mediaId, dto, this.context(req));
  }
  @Delete('projects/:projectId/media/:mediaId')
  @HttpCode(204)
  @Header('Cache-Control', 'private, no-store')
  @ApiNoContentResponse()
  async deleteMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('mediaId', new ParseUUIDPipe()) mediaId: string,
    @Query() query: DeleteMediaQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.growth.deleteMedia(user.id, projectId, mediaId, query.version, this.context(req));
  }
  @Put('projects/:projectId/media/reorder')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: [DeveloperMediaResponseDto] })
  reorder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body() dto: ReorderMediaDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.growth.reorderMedia(user.id, projectId, dto, this.context(req));
  }
  private context(r: AuthenticatedRequest) {
    return {
      requestId: r.requestId,
      ...(r.ip ? { ipAddress: r.ip } : {}),
      ...(r.header('user-agent') ? { userAgent: r.header('user-agent') } : {}),
    };
  }
}

@ApiTags('Broker CRM')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(PlatformRole.BROKER)
@Controller('broker')
export class BrokerGrowthController {
  constructor(private readonly growth: GrowthService) {}
  @Get('organizations')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: [OrganizationScopeResponseDto] })
  organizations(@CurrentUser() user: AuthenticatedUser) {
    return this.growth.organizations(user.id, 'BROKER_AGENCY');
  }
  @Get('clients')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: BrokerClientListResponseDto })
  clients(@CurrentUser() user: AuthenticatedUser, @Query() query: BrokerClientQueryDto) {
    return this.growth.listClients(user.id, query);
  }
  @Post('clients')
  @Header('Cache-Control', 'private, no-store')
  @ApiCreatedResponse({ type: BrokerClientResponseDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OrganizationScopeQueryDto,
    @Body() dto: CreateBrokerClientDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.growth.createClient(user.id, dto, this.context(req), query.organizationId);
  }
  @Get('clients/:clientId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: BrokerClientResponseDto })
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId', new ParseUUIDPipe()) id: string,
  ) {
    return this.growth.getClient(user.id, id);
  }
  @Patch('clients/:clientId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: BrokerClientResponseDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateBrokerClientDto,
    @Req() req: AuthenticatedRequest,
  ) {
    if (Object.keys(dto).every((key) => key === 'version'))
      throw new AppException('EMPTY_UPDATE', 'At least one client field must change', 400);
    return this.growth.updateClient(user.id, id, dto, this.context(req));
  }
  @Delete('clients/:clientId')
  @Header('Cache-Control', 'private, no-store')
  @HttpCode(204)
  @ApiNoContentResponse()
  async archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId', new ParseUUIDPipe()) id: string,
    @Query() query: ArchiveClientQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.growth.archiveClient(user.id, id, query.version, this.context(req));
  }
  @Get('contacts')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: [BrokerContactResponseDto] })
  contacts(@CurrentUser() user: AuthenticatedUser) {
    return this.growth.contacts(user.id);
  }
  private context(r: AuthenticatedRequest) {
    return {
      requestId: r.requestId,
      ...(r.ip ? { ipAddress: r.ip } : {}),
      ...(r.header('user-agent') ? { userAgent: r.header('user-agent') } : {}),
    };
  }
}
