import { validateEnvironment } from './environment.validation';

const validEnvironment = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://localhost:5432/planda',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'access-secret-with-at-least-32-characters',
  JWT_REFRESH_SECRET: 'refresh-secret-with-at-least-32-characters',
};

describe('validateEnvironment', () => {
  it('loads Joi through the CommonJS-compatible import and validates a valid environment', () => {
    expect(validateEnvironment(validEnvironment)).toMatchObject({
      ...validEnvironment,
      PORT: 3001,
      LEAD_CONSENT_CURRENT_VERSION: 'kvkk-lead-v1',
      LEAD_CONSENT_APPROVED_VERSIONS: 'kvkk-lead-v1',
      AUTH_REFRESH_ROTATION_GRACE_SECONDS: 5,
    });
  });

  it('still rejects invalid environment values', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        JWT_REFRESH_SECRET: validEnvironment.JWT_ACCESS_SECRET,
      }),
    ).toThrow('Environment validation failed');
  });

  it('requires the current lead consent version to be in the approved allowlist', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        LEAD_CONSENT_CURRENT_VERSION: 'kvkk-lead-v2',
        LEAD_CONSENT_APPROVED_VERSIONS: 'kvkk-lead-v1',
      }),
    ).toThrow('LEAD_CONSENT_CURRENT_VERSION must be included');
  });

  it('bounds the distributed refresh replay grace window', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        AUTH_REFRESH_ROTATION_GRACE_SECONDS: 0,
      }),
    ).toThrow('Environment validation failed');
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        AUTH_REFRESH_ROTATION_GRACE_SECONDS: 31,
      }),
    ).toThrow('Environment validation failed');
  });

  it('rejects development storage endpoints and credentials in production', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://planda.example',
        ANALYTICS_SESSION_HASH_SECRET: 'production-analytics-secret-at-least-32-characters',
      }),
    ).toThrow('Production storage must use non-local endpoints');
  });

  it('accepts only HTTP(S) storage endpoints', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        STORAGE_ENDPOINT: 'ftp://storage.example.test',
      }),
    ).toThrow('Environment validation failed');
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        STORAGE_PUBLIC_BASE_URL: 'javascript:alert(1)',
      }),
    ).toThrow('Environment validation failed');
  });

  it('requires an HTTPS public media base in production', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://planda.example',
        ANALYTICS_SESSION_HASH_SECRET: 'production-analytics-secret-at-least-32-characters',
        STORAGE_ENDPOINT: 'https://storage.example.test',
        STORAGE_PUBLIC_BASE_URL: 'http://media.example.test/api/v1/media',
        STORAGE_ACCESS_KEY: 'production-access-key',
        STORAGE_SECRET_KEY: 'production-storage-secret',
      }),
    ).toThrow('STORAGE_PUBLIC_BASE_URL must use HTTPS in production');
  });
});
