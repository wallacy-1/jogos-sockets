import { Module } from '@nestjs/common';
import { PokerModule } from './poker/poker.module';
import { AppController } from './app.controller';

@Module({
  imports: [PokerModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
