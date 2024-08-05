import { Module } from '@nestjs/common';
import { PokerModule } from './poker/poker.module';

@Module({
  imports: [PokerModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
