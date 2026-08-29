import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PlatformRole } from '@prisma/client';
import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AppException } from '../../common/exceptions/app.exception';
import { Roles } from '../../common/decorators/roles.decorator';
import { AccessTokenGuard } from '../../common/guards/access-token.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { AuthenticatedRequest, AuthenticatedUser } from '../../common/types/authenticated-request';
import { MutationContext } from '../../common/types/mutation-context';
import { CreateLeadDto } from './dto/create-lead.dto';
import {
  BrokerProjectResponseDto,
  BrokerMaterialMetadataDto,
  LeadListResponseDto,
  LeadResponseDto,
  PaymentPlanResponseDto,
  SavedProjectResponseDto,
  UnitResponseDto,
  UnitListResponseDto,
} from './dto/marketplace-response.dto';
import { LeadQueryDto, UnitQueryDto } from './dto/operations-query.dto';
import { DeletePaymentPlanDto, UpdatePaymentPlanDto } from './dto/update-payment-plan.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { CreatePaymentPlanDto, CreateUnitDto, UpdateUnitDto } from './dto/upsert-inventory.dto';
import { MarketplaceService } from './marketplace.service';

@ApiTags('Buyer Marketplace')
@ApiErrorResponses()
@RateLimit('public')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(PlatformRole.BUYER)
@Controller()
export class BuyerMarketplaceController {
  constructor(private readonly marketplace: MarketplaceService) {}

  @Post('projects/:projectId/leads')
  @Header('Cache-Control', 'private, no-store')
  @ApiCreatedResponse({ type: LeadResponseDto })
  createLead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateLeadDto,
  ): Promise<LeadResponseDto> {
    const normalizedKey = idempotencyKey?.trim();
    if (!normalizedKey)
      throw new AppException('IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required', 400);
    if (normalizedKey.length > 100)
      throw new AppException('IDEMPOTENCY_KEY_INVALID', 'Idempotency-Key is too long', 400);
    return this.marketplace.createLead(user.id, projectId, normalizedKey, dto);
  }

  @Get('me/saved-projects')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: [SavedProjectResponseDto] })
  listSaved(@CurrentUser() user: AuthenticatedUser): Promise<SavedProjectResponseDto[]> {
    return this.marketplace.listSaved(user.id);
  }

  @Put('me/saved-projects/:projectId')
  @Header('Cache-Control', 'private, no-store')
  @HttpCode(204)
  @ApiNoContentResponse()
  async save(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ): Promise<void> {
    await this.marketplace.save(user.id, projectId);
  }

  @Delete('me/saved-projects/:projectId')
  @Header('Cache-Control', 'private, no-store')
  @HttpCode(204)
  @ApiNoContentResponse()
  async unsave(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ): Promise<void> {
    await this.marketplace.unsave(user.id, projectId);
  }
}

@ApiTags('Developer Marketplace')
@ApiErrorResponses()
@RateLimit('public')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(PlatformRole.DEVELOPER_MEMBER)
@Controller('developer')
export class DeveloperMarketplaceController {
  constructor(private readonly marketplace: MarketplaceService) {}

  @Get('leads')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: LeadListResponseDto })
  listLeads(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: LeadQueryDto,
  ): Promise<LeadListResponseDto> {
    return this.marketplace.listDeveloperLeads(user.id, query);
  }

  @Patch('leads/:leadId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: LeadResponseDto })
  updateLead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('leadId', new ParseUUIDPipe()) leadId: string,
    @Body() dto: UpdateLeadDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<LeadResponseDto> {
    return this.marketplace.updateDeveloperLead(user.id, leadId, dto, this.context(req));
  }

  @Get('projects/:projectId/units')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: UnitListResponseDto })
  listUnits(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Query() query: UnitQueryDto,
  ): Promise<UnitListResponseDto> {
    return this.marketplace.listUnits(user.id, projectId, query);
  }

  @Post('projects/:projectId/units')
  @Header('Cache-Control', 'private, no-store')
  @ApiCreatedResponse({ type: UnitResponseDto })
  createUnit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body() dto: CreateUnitDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<UnitResponseDto> {
    return this.marketplace.createUnit(user.id, projectId, dto, this.context(req));
  }

  @Patch('projects/:projectId/units/:unitId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: UnitResponseDto })
  updateUnit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('unitId', new ParseUUIDPipe()) unitId: string,
    @Body() dto: UpdateUnitDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<UnitResponseDto> {
    return this.marketplace.updateUnit(user.id, projectId, unitId, dto, this.context(req));
  }

  @Get('projects/:projectId/payment-plans')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: [PaymentPlanResponseDto] })
  listPaymentPlans(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ): Promise<PaymentPlanResponseDto[]> {
    return this.marketplace.listPaymentPlans(user.id, projectId);
  }

  @Post('projects/:projectId/payment-plans')
  @Header('Cache-Control', 'private, no-store')
  @ApiCreatedResponse({ type: PaymentPlanResponseDto })
  createPaymentPlan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body() dto: CreatePaymentPlanDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<PaymentPlanResponseDto> {
    return this.marketplace.createPaymentPlan(user.id, projectId, dto, this.context(req));
  }

  @Patch('projects/:projectId/payment-plans/:planId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: PaymentPlanResponseDto })
  updatePaymentPlan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('planId', new ParseUUIDPipe()) planId: string,
    @Body() dto: UpdatePaymentPlanDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<PaymentPlanResponseDto> {
    return this.marketplace.updatePaymentPlan(user.id, projectId, planId, dto, this.context(req));
  }

  @Delete('projects/:projectId/payment-plans/:planId')
  @Header('Cache-Control', 'private, no-store')
  @HttpCode(204)
  @ApiNoContentResponse()
  async deletePaymentPlan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('planId', new ParseUUIDPipe()) planId: string,
    @Body() dto: DeletePaymentPlanDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    await this.marketplace.deletePaymentPlan(user.id, projectId, planId, dto, this.context(req));
  }

  private context(request: AuthenticatedRequest): MutationContext {
    return {
      requestId: request.requestId,
      ...(request.ip ? { ipAddress: request.ip } : {}),
      ...(request.header('user-agent') ? { userAgent: request.header('user-agent') } : {}),
    };
  }
}

@ApiTags('Broker Marketplace')
@ApiErrorResponses()
@RateLimit('public')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(PlatformRole.BROKER)
@Controller('broker/projects')
export class BrokerMarketplaceController {
  constructor(private readonly marketplace: MarketplaceService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: [BrokerProjectResponseDto] })
  list(): Promise<BrokerProjectResponseDto[]> {
    return this.marketplace.listBrokerProjects();
  }

  @Get(':idOrSlug/materials')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: [BrokerMaterialMetadataDto] })
  materials(@Param('idOrSlug') idOrSlug: string): Promise<BrokerMaterialMetadataDto[]> {
    return this.marketplace.listBrokerMaterials(idOrSlug);
  }

  @Get(':idOrSlug')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: BrokerProjectResponseDto })
  detail(@Param('idOrSlug') idOrSlug: string): Promise<BrokerProjectResponseDto> {
    return this.marketplace.getBrokerProject(idOrSlug);
  }
}
