import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { StorageModule } from '../../infrastructure/storage/storage.module';
@Module({ imports: [StorageModule], controllers: [HealthController] })
export class HealthModule {}
