import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JSendStatusEnum } from '../enums';

//=> https://github.com/omniti-labs/jsend
@Catch()
export class JSendExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const httpStatus =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const statusMessage =
      httpStatus === HttpStatus.INTERNAL_SERVER_ERROR
        ? JSendStatusEnum.error
        : JSendStatusEnum.fail;

    const errorMessage =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Try again later if the problem persist please contact support.';

    response.status(httpStatus).json({
      status: statusMessage,
      message:
        typeof errorMessage === 'string'
          ? errorMessage
          : (errorMessage as any).message,
    });
  }
}
