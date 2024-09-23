import { env } from 'process';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { JSendExceptionFilter } from './common/exceptions';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe());
  app.useGlobalFilters(new JSendExceptionFilter());

  app.enableCors({
    origin: '*',
    methods: 'GET',
  });

  await app.listen(env.APP_PORT ?? 3001);
}
bootstrap();
