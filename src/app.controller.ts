import { Controller, Get } from '@nestjs/common';

@Controller('ping')
export class AppController {
  @Get()
  ping() {
    return { message: 'Server is active' };
  }
}
