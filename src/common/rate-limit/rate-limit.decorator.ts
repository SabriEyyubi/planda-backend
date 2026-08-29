import { SetMetadata } from '@nestjs/common';
import { RateLimitPolicyName } from '../config/configuration';

export const RATE_LIMIT_POLICY_KEY = 'rate-limit-policy';

export const RateLimit = (policy: RateLimitPolicyName): MethodDecorator & ClassDecorator =>
  SetMetadata(RATE_LIMIT_POLICY_KEY, policy);
