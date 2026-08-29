import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';

const deterministicEnvironment: Record<string, string> = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://openapi:openapi@127.0.0.1:5432/openapi',
  REDIS_URL: 'redis://127.0.0.1:6379',
  JWT_ACCESS_SECRET: 'openapi-access-secret-not-used-at-runtime',
  JWT_REFRESH_SECRET: 'openapi-refresh-secret-not-used-at-runtime',
  AUTH_REFRESH_ROTATION_GRACE_SECONDS: '5',
  LEAD_CONSENT_CURRENT_VERSION: 'kvkk-lead-v1',
  LEAD_CONSENT_APPROVED_VERSIONS: 'kvkk-lead-v1',
};

for (const [key, value] of Object.entries(deterministicEnvironment)) process.env[key] = value;

async function generate(): Promise<void> {
  const [{ AppModule }, { createOpenApiDocument }] = await Promise.all([
    import('../src/app.module'),
    import('../src/common/openapi/openapi'),
  ]);
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  const outputDirectory = resolve(process.cwd(), 'openapi');
  const outputPath = resolve(outputDirectory, 'openapi.json');
  await mkdir(outputDirectory, { recursive: true });
  const prettierConfig = (await resolveConfig(outputPath)) ?? {};
  const artifact = await format(JSON.stringify(createOpenApiDocument(app)), {
    ...prettierConfig,
    filepath: outputPath,
  });
  await writeFile(outputPath, artifact, 'utf8');
  await app.close();
}

void generate().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
