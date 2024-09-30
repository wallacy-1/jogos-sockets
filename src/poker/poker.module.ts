import { Module } from '@nestjs/common';
import { PokerGateway } from './poker.gateway';
import { PokerController } from './poker.controller';
import { PokerService } from './poker.service';

@Module({
  providers: [PokerGateway, PokerService],
  controllers: [PokerController],
})
export class PokerModule {}
