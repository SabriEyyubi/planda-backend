import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { createHash } from 'node:crypto';
import { AppConfiguration, RateLimitPolicyName } from '../config/configuration';
import { AppException } from '../exceptions/app.exception';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { RATE_LIMIT_POLICY_KEY } from './rate-limit.decorator';

interface RefreshRateClaims {
  sid?: string;
  type?: string;
}
interface RequestBody {
  email?: unknown;
  refreshToken?: unknown;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly jwtConfig: AppConfiguration['jwt'];
  private readonly rateLimits: AppConfiguration['rateLimit'];

  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.jwtConfig = config.getOrThrow<AppConfiguration['jwt']>('jwt');
    this.rateLimits = config.getOrThrow<AppConfiguration['rateLimit']>('rateLimit');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<RateLimitPolicyName>(RATE_LIMIT_POLICY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!policy) return true;
    const request = context.switchToHttp().getRequest<Request>();
    const tracker = await this.tracker(policy, request);
    const settings = this.rateLimits[policy];
    try {
      const result = await this.redis.consumeRateLimit(
        `rate-limit:${policy}:${this.hash(tracker)}`,
        settings.limit,
        settings.ttlSeconds,
      );
      if (!result.allowed) {
        throw new AppException('RATE_LIMIT_EXCEEDED', 'Too many requests', 429, {
          retryAfterSeconds: result.retryAfterSeconds,
        });
      }
      return true;
    } catch (error) {
      if (error instanceof AppException) throw error;
      throw new AppException(
        'RATE_LIMIT_UNAVAILABLE',
        'Request protection is temporarily unavailable',
        503,
      );
    }
  }

  private async tracker(policy: RateLimitPolicyName, request: Request): Promise<string> {
    const ip = request.ip || request.socket.remoteAddress || 'unknown';
    const body = (request.body ?? {}) as RequestBody;
    if (policy === 'login') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : 'unknown';
      return `${ip}:${email}`;
    }
    if (policy === 'refresh') {
      const token = typeof body.refreshToken === 'string' ? body.refreshToken : '';
      const sessionId = await this.extractVerifiedSessionId(token);
      return `${ip}:${sessionId ?? this.hash(token || 'missing')}`;
    }
    return ip;
  }

  private async extractVerifiedSessionId(token: string): Promise<string | undefined> {
    if (!token) return undefined;
    try {
      const claims = await this.jwt.verifyAsync<RefreshRateClaims>(token, {
        secret: this.jwtConfig.refreshSecret,
        issuer: this.jwtConfig.issuer,
        audience: this.jwtConfig.audience,
      });
      return claims.type === 'refresh' ? claims.sid : undefined;
    } catch {
      return undefined;
    }
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
