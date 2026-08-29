import * as Joi from 'joi';

const schema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3001),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required(),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.string()
    .pattern(/^\d+[smhd]$/)
    .default('15m'),
  JWT_REFRESH_TTL: Joi.string()
    .pattern(/^\d+[smhd]$/)
    .default('7d'),
  JWT_ISSUER: Joi.string().min(1).max(100).default('planda-api'),
  JWT_AUDIENCE: Joi.string().min(1).max(100).default('planda-clients'),
  AUTH_REFRESH_ROTATION_GRACE_SECONDS: Joi.number().integer().min(1).max(30).default(5),
  TRUST_PROXY_HOPS: Joi.number().integer().min(0).max(10).default(0),
  RATE_LIMIT_REGISTER_LIMIT: Joi.number().integer().min(1).default(5),
  RATE_LIMIT_REGISTER_TTL_SECONDS: Joi.number().integer().min(1).default(900),
  RATE_LIMIT_LOGIN_LIMIT: Joi.number().integer().min(1).default(10),
  RATE_LIMIT_LOGIN_TTL_SECONDS: Joi.number().integer().min(1).default(900),
  RATE_LIMIT_REFRESH_LIMIT: Joi.number().integer().min(1).default(30),
  RATE_LIMIT_REFRESH_TTL_SECONDS: Joi.number().integer().min(1).default(60),
  RATE_LIMIT_PUBLIC_LIMIT: Joi.number().integer().min(1).default(120),
  RATE_LIMIT_PUBLIC_TTL_SECONDS: Joi.number().integer().min(1).default(60),
  CORS_ORIGINS: Joi.string()
    .allow('')
    .custom((value: string, helpers) => {
      if (value.split(',').some((origin) => origin.trim() === '*')) {
        return helpers.error('any.invalid');
      }
      return value;
    }),
  LEAD_CONSENT_CURRENT_VERSION: Joi.string().trim().min(1).max(50).default('kvkk-lead-v1'),
  LEAD_CONSENT_APPROVED_VERSIONS: Joi.string()
    .custom((value: string, helpers) => {
      const versions = value
        .split(',')
        .map((version) => version.trim())
        .filter(Boolean);
      if (versions.length === 0 || new Set(versions).size !== versions.length) {
        return helpers.error('any.invalid');
      }
      return versions.join(',');
    })
    .default('kvkk-lead-v1'),
  ANALYTICS_SESSION_HASH_SECRET: Joi.string()
    .min(32)
    .default('development-only-analytics-secret-change-me'),
  STORAGE_ENDPOINT: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .default('http://localhost:9000'),
  STORAGE_REGION: Joi.string().min(1).default('us-east-1'),
  STORAGE_BUCKET: Joi.string().min(3).max(63).default('planda-media'),
  STORAGE_ACCESS_KEY: Joi.string().min(1).default('planda'),
  STORAGE_SECRET_KEY: Joi.string().min(16).default('planda-development-secret'),
  STORAGE_PUBLIC_BASE_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .default('http://localhost:3001/api/v1/media'),
  STORAGE_FORCE_PATH_STYLE: Joi.boolean().default(true),
}).custom((value: Record<string, string>, helpers) => {
  if (value.NODE_ENV === 'production' && !value.CORS_ORIGINS?.trim()) {
    return helpers.message({ custom: 'CORS_ORIGINS is required in production' });
  }
  if (
    value.NODE_ENV === 'production' &&
    value.ANALYTICS_SESSION_HASH_SECRET === 'development-only-analytics-secret-change-me'
  ) {
    return helpers.message({
      custom: 'ANALYTICS_SESSION_HASH_SECRET must be changed in production',
    });
  }
  if (
    value.NODE_ENV === 'production' &&
    (value.STORAGE_ENDPOINT?.includes('localhost') ||
      value.STORAGE_ENDPOINT?.includes('127.0.0.1') ||
      value.STORAGE_PUBLIC_BASE_URL?.includes('localhost') ||
      value.STORAGE_PUBLIC_BASE_URL?.includes('127.0.0.1') ||
      value.STORAGE_ACCESS_KEY === 'planda' ||
      value.STORAGE_SECRET_KEY === 'planda-development-secret')
  ) {
    return helpers.message({
      custom: 'Production storage must use non-local endpoints and non-development credentials',
    });
  }
  if (
    value.NODE_ENV === 'production' &&
    (!value.STORAGE_PUBLIC_BASE_URL || new URL(value.STORAGE_PUBLIC_BASE_URL).protocol !== 'https:')
  ) {
    return helpers.message({
      custom: 'STORAGE_PUBLIC_BASE_URL must use HTTPS in production',
    });
  }
  if (value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET) {
    return helpers.message({ custom: 'JWT access and refresh secrets must be different' });
  }
  const currentConsentVersion = value.LEAD_CONSENT_CURRENT_VERSION;
  const approvedConsentVersions = value.LEAD_CONSENT_APPROVED_VERSIONS;
  if (
    !currentConsentVersion ||
    !approvedConsentVersions ||
    !approvedConsentVersions.split(',').includes(currentConsentVersion)
  ) {
    return helpers.message({
      custom: 'LEAD_CONSENT_CURRENT_VERSION must be included in LEAD_CONSENT_APPROVED_VERSIONS',
    });
  }
  return value;
});

export function validateEnvironment(config: Record<string, unknown>): Record<string, unknown> {
  const result = schema.validate(config, { abortEarly: false, allowUnknown: true });
  if (result.error) throw new Error(`Environment validation failed: ${result.error.message}`);
  return result.value as Record<string, unknown>;
}
