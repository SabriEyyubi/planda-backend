import { GUARDS_METADATA, HEADERS_METADATA } from '@nestjs/common/constants';
import { PlatformRole } from '@prisma/client';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { AccessTokenGuard } from '../../common/guards/access-token.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminOperationsController, AdminProjectsController } from './admin-projects.controller';
import {
  DeveloperOverviewController,
  DeveloperProjectsController,
} from './developer-projects.controller';

const privateNoStore = { name: 'Cache-Control', value: 'private, no-store' };
const handler = (controller: object, method: string): object =>
  Object.getOwnPropertyDescriptor(controller, method)?.value as object;

describe('Operations controller security metadata', () => {
  it.each([
    [DeveloperProjectsController, [PlatformRole.DEVELOPER_MEMBER]],
    [DeveloperOverviewController, [PlatformRole.DEVELOPER_MEMBER]],
    [AdminProjectsController, [PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN]],
    [AdminOperationsController, [PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN]],
  ])('protects %p with access-token, role guards and the expected roles', (controller, roles) => {
    expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual([
      AccessTokenGuard,
      RolesGuard,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, controller)).toEqual(roles);
  });

  it.each([
    [DeveloperProjectsController.prototype, 'list'],
    [DeveloperProjectsController.prototype, 'detail'],
    [DeveloperProjectsController.prototype, 'create'],
    [DeveloperProjectsController.prototype, 'update'],
    [DeveloperOverviewController.prototype, 'overview'],
    [AdminProjectsController.prototype, 'reviewQueue'],
    [AdminProjectsController.prototype, 'updateStatus'],
    [AdminOperationsController.prototype, 'overview'],
    [AdminOperationsController.prototype, 'dataQuality'],
  ])('marks %p.%s responses private and non-cacheable', (controller, method) => {
    expect(Reflect.getMetadata(HEADERS_METADATA, handler(controller, method))).toContainEqual(
      privateNoStore,
    );
  });
});
