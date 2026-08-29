import { Module } from '@nestjs/common';
import {
  BrokerMarketplaceController,
  BuyerMarketplaceController,
  DeveloperMarketplaceController,
} from './marketplace.controller';
import { MarketplaceService } from './marketplace.service';

@Module({
  controllers: [
    BuyerMarketplaceController,
    DeveloperMarketplaceController,
    BrokerMarketplaceController,
  ],
  providers: [MarketplaceService],
})
export class MarketplaceModule {}
