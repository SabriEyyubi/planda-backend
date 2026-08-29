import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { RedisModule } from '../../infrastructure/redis/redis.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { SecurityInvalidationService } from './security-invalidation.service';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
  imports: [PassportModule, JwtModule.register({}), RedisModule],
  controllers: [AuthController, ProfileController],
  providers: [AuthService, JwtStrategy, SecurityInvalidationService, ProfileService],
  exports: [AuthService, SecurityInvalidationService, JwtModule],
})
export class IdentityModule {}
