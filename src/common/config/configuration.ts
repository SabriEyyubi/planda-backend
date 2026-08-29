export type NodeEnvironment = 'development' | 'test' | 'production';

export interface AppConfiguration {
  nodeEnv: NodeEnvironment;
  port: number;
  databaseUrl: string;
  redisUrl: string;
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
    issuer: string;
    audience: string;
  };
  corsOrigins: string[];
  trustProxyHops: number;
  leadConsent: {
    currentVersion: string;
    approvedVersions: string[];
  };
  auth: { refreshRotationGraceSeconds: number };
  analytics: { sessionHashSecret: string };
  storage: {
    endpoint: string;
    region: string;
    bucket: string;
    accessKey: string;
    secretKey: string;
    publicBaseUrl: string;
    forcePathStyle: boolean;
  };
  rateLimit: Record<RateLimitPolicyName, { limit: number; ttlSeconds: number }>;
}

export type RateLimitPolicyName = 'register' | 'login' | 'refresh' | 'public';

const LOCAL_DEVELOPMENT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

export function configuration(): AppConfiguration {
  const nodeEnv = (process.env.NODE_ENV ?? 'development') as NodeEnvironment;
  const configuredOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    nodeEnv,
    port: Number(process.env.PORT ?? 3001),
    databaseUrl: process.env.DATABASE_URL ?? '',
    redisUrl: process.env.REDIS_URL ?? '',
    jwt: {
      accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
      refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
      accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
      refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
      issuer: process.env.JWT_ISSUER ?? 'planda-api',
      audience: process.env.JWT_AUDIENCE ?? 'planda-clients',
    },
    corsOrigins:
      configuredOrigins.length > 0
        ? configuredOrigins
        : nodeEnv === 'development'
          ? LOCAL_DEVELOPMENT_ORIGINS
          : [],
    trustProxyHops: Number(process.env.TRUST_PROXY_HOPS ?? 0),
    leadConsent: {
      currentVersion: (process.env.LEAD_CONSENT_CURRENT_VERSION ?? 'kvkk-lead-v1').trim(),
      approvedVersions: (process.env.LEAD_CONSENT_APPROVED_VERSIONS ?? 'kvkk-lead-v1')
        .split(',')
        .map((version) => version.trim())
        .filter(Boolean),
    },
    auth: {
      refreshRotationGraceSeconds: Number(process.env.AUTH_REFRESH_ROTATION_GRACE_SECONDS ?? 5),
    },
    analytics: {
      sessionHashSecret:
        process.env.ANALYTICS_SESSION_HASH_SECRET ?? 'development-only-analytics-secret-change-me',
    },
    storage: {
      endpoint: process.env.STORAGE_ENDPOINT ?? 'http://localhost:9000',
      region: process.env.STORAGE_REGION ?? 'us-east-1',
      bucket: process.env.STORAGE_BUCKET ?? 'planda-media',
      accessKey: process.env.STORAGE_ACCESS_KEY ?? 'planda',
      secretKey: process.env.STORAGE_SECRET_KEY ?? 'planda-development-secret',
      publicBaseUrl: process.env.STORAGE_PUBLIC_BASE_URL ?? 'http://localhost:3001/api/v1/media',
      forcePathStyle: (process.env.STORAGE_FORCE_PATH_STYLE ?? 'true') === 'true',
    },
    rateLimit: {
      register: {
        limit: Number(process.env.RATE_LIMIT_REGISTER_LIMIT ?? 5),
        ttlSeconds: Number(process.env.RATE_LIMIT_REGISTER_TTL_SECONDS ?? 900),
      },
      login: {
        limit: Number(process.env.RATE_LIMIT_LOGIN_LIMIT ?? 10),
        ttlSeconds: Number(process.env.RATE_LIMIT_LOGIN_TTL_SECONDS ?? 900),
      },
      refresh: {
        limit: Number(process.env.RATE_LIMIT_REFRESH_LIMIT ?? 30),
        ttlSeconds: Number(process.env.RATE_LIMIT_REFRESH_TTL_SECONDS ?? 60),
      },
      public: {
        limit: Number(process.env.RATE_LIMIT_PUBLIC_LIMIT ?? 120),
        ttlSeconds: Number(process.env.RATE_LIMIT_PUBLIC_TTL_SECONDS ?? 60),
      },
    },
  };
}
