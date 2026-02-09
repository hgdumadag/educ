import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { MulterError } from "multer";

@Catch(MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const isSizeError = exception.code === "LIMIT_FILE_SIZE";
    const status = isSizeError ? HttpStatus.PAYLOAD_TOO_LARGE : HttpStatus.BAD_REQUEST;
    const message = isSizeError ? "Uploaded file exceeds max allowed size" : exception.message;

    response.status(status).json({
      statusCode: status,
      message,
      code: exception.code,
    });
  }
}
