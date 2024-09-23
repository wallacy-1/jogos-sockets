import { Controller, Get } from '@nestjs/common';

@Controller('ping')
export class AppController {
  @Get()
  ping() {
    console.log('<<<<<<<<<<<<<<<<<<<<<<<< PING >>>>>>>>>>>>>>>>>>>>>>>>');
    return { message: 'Server is active' };
  }
}
