import { ConsoleLogger, Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import * as express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { configuration } from './common/config/configuration';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { setupOpenApi } from './common/openapi/openapi';

async function bootstrap(): Promise<void> {
  const config = configuration();
  const server = express();
  if (config.trustProxyHops > 0) server.set('trust proxy', config.trustProxyHops);
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    bodyParser: false,
    logger: new ConsoleLogger({ json: true, colors: false }),
  });
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.enableCors({
    credentials: false,
    origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
      if (!origin || config.corsOrigins.includes(origin)) callback(null, true);
      else callback(null, false);
    },
  });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      stopAtFirstError: false,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();

  if (config.nodeEnv !== 'production') {
    setupOpenApi(app);
  }
  await app.listen(config.port);
  Logger.log(`PLANDA API listening on port ${config.port}`, 'Bootstrap');
}

void bootstrap();
