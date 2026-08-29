import { GUARDS_METADATA, HEADERS_METADATA } from '@nestjs/common/constants';
import { PlatformRole } from '@prisma/client';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { AccessTokenGuard } from '../../common/guards/access-token.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  BrokerMarketplaceController,
  BuyerMarketplaceController,
  DeveloperMarketplaceController,
} from './marketplace.controller';

const privateNoStore = { name: 'Cache-Control', value: 'private, no-store' };
const handler = (controller: object, method: string): object =>
  Object.getOwnPropertyDescriptor(controller, method)?.value as object;

describe('Marketplace controller security metadata', () => {
  it.each([
    [BuyerMarketplaceController, [PlatformRole.BUYER]],
    [DeveloperMarketplaceController, [PlatformRole.DEVELOPER_MEMBER]],
    [BrokerMarketplaceController, [PlatformRole.BROKER]],
  ])('protects %p with access-token, role guards and the expected roles', (controller, roles) => {
    expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual([
      AccessTokenGuard,
      RolesGuard,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, controller)).toEqual(roles);
  });

  it.each([
    [BuyerMarketplaceController.prototype, 'createLead'],
    [BuyerMarketplaceController.prototype, 'listSaved'],
    [BuyerMarketplaceController.prototype, 'save'],
    [BuyerMarketplaceController.prototype, 'unsave'],
    [DeveloperMarketplaceController.prototype, 'listLeads'],
    [DeveloperMarketplaceController.prototype, 'updateLead'],
    [DeveloperMarketplaceController.prototype, 'listUnits'],
    [DeveloperMarketplaceController.prototype, 'createUnit'],
    [DeveloperMarketplaceController.prototype, 'updateUnit'],
    [DeveloperMarketplaceController.prototype, 'listPaymentPlans'],
    [DeveloperMarketplaceController.prototype, 'createPaymentPlan'],
    [DeveloperMarketplaceController.prototype, 'updatePaymentPlan'],
    [DeveloperMarketplaceController.prototype, 'deletePaymentPlan'],
    [BrokerMarketplaceController.prototype, 'list'],
    [BrokerMarketplaceController.prototype, 'detail'],
    [BrokerMarketplaceController.prototype, 'materials'],
  ])('marks %p.%s responses private and non-cacheable', (controller, method) => {
    expect(Reflect.getMetadata(HEADERS_METADATA, handler(controller, method))).toContainEqual(
      privateNoStore,
    );
  });
});
