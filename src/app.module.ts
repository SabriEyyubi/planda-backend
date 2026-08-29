import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { configuration } from './common/config/configuration';
import { validateEnvironment } from './common/config/environment.validation';
import { HttpLoggerMiddleware } from './common/middleware/http-logger.middleware';
import { RequestContextService } from './common/middleware/request-context.service';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { RateLimitGuard } from './common/rate-limit/rate-limit.guard';
import { DatabaseModule } from './infrastructure/database/database.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { HealthModule } from './modules/health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { LocationsModule } from './modules/locations/locations.module';
import { MarketplaceModule } from './modules/marketplace/marketplace.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { DevelopersModule } from './modules/developers/developers.module';
import { GrowthModule } from './modules/growth/growth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validate: validateEnvironment }),
    DatabaseModule,
    RedisModule,
    HealthModule,
    IdentityModule,
    LocationsModule,
    MarketplaceModule,
    ProjectsModule,
    DevelopersModule,
    GrowthModule,
  ],
  providers: [
    RequestContextService,
    RequestIdMiddleware,
    HttpLoggerMiddleware,
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, HttpLoggerMiddleware).forRoutes('*');
  }
}
