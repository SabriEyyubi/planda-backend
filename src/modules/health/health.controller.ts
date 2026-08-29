import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { ObjectStorageService } from '../../infrastructure/storage/object-storage.service';

interface ServiceHealth {
  status: 'ok';
  timestamp: string;
}
interface Readiness {
  status: 'ready';
  checks: { postgres: 'up'; redis: 'up'; storage: 'up' };
  timestamp: string;
}

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly storage: ObjectStorageService,
  ) {}
  @Get()
  @ApiOkResponse({ schema: { example: { status: 'ok', timestamp: '2026-08-13T12:00:00.000Z' } } })
  health(): ServiceHealth {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
  @Get('ready')
  @ApiOkResponse({
    schema: {
      example: { status: 'ready', checks: { postgres: 'up', redis: 'up', storage: 'up' } },
    },
  })
  async ready(): Promise<Readiness> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      await this.redis.ping();
      await this.storage.ping();
      return {
        status: 'ready',
        checks: { postgres: 'up', redis: 'up', storage: 'up' },
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException('Service dependencies are not ready');
    }
  }
}
