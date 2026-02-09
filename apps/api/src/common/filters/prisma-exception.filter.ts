import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpStatus,
  NotFoundException,
} from "@nestjs/common";
import type { Response } from "express";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

@Catch(PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: PrismaClientKnownRequestError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    let status = HttpStatus.BAD_REQUEST;
    let message = "Database request failed";

    if (exception.code === "P2002") {
      status = new ConflictException().getStatus();
      message = "Resource already exists";
    } else if (exception.code === "P2025") {
      status = new NotFoundException().getStatus();
      message = "Requested resource was not found";
    } else if (exception.code === "P2003") {
      status = HttpStatus.BAD_REQUEST;
      message = "Invalid related resource reference";
    }

    response.status(status).json({
      statusCode: status,
      message,
      code: exception.code,
    });
  }
}
