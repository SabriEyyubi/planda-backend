import { Module } from '@nestjs/common';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import {
  BrokerGrowthController,
  DeveloperGrowthController,
  ProjectViewsController,
  PublicMediaController,
} from './growth.controller';
import { GrowthService } from './growth.service';
@Module({
  imports: [StorageModule],
  controllers: [
    ProjectViewsController,
    PublicMediaController,
    DeveloperGrowthController,
    BrokerGrowthController,
  ],
  providers: [GrowthService],
})
export class GrowthModule {}
