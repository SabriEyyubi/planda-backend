import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppException } from '../exceptions/app.exception';

interface ValidationBody {
  message?: string | string[];
  error?: string;
}

const STATUS_CODES: Partial<Record<number, string>> = {
  400: 'BAD_REQUEST',
  401: 'AUTHENTICATION_REQUIRED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'RATE_LIMIT_EXCEEDED',
  503: 'SERVICE_UNAVAILABLE',
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request & { requestId?: string }>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = exception instanceof HttpException ? exception.getResponse() : undefined;
    const validation =
      typeof payload === 'object' && payload !== null ? (payload as ValidationBody) : undefined;
    const isValidation = status === 400 && Array.isArray(validation?.message);
    const code =
      exception instanceof AppException
        ? exception.code
        : isValidation
          ? 'VALIDATION_ERROR'
          : status >= 500
            ? 'INTERNAL_ERROR'
            : (STATUS_CODES[status] ?? 'HTTP_ERROR');
    const message =
      exception instanceof AppException
        ? exception.message
        : isValidation
          ? 'Validation failed'
          : status >= 500
            ? 'Internal server error'
            : typeof payload === 'string'
              ? payload
              : (validation?.message ?? 'Request failed');

    if (status >= 500) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(
        { requestId: request.requestId, statusCode: status, path: request.path },
        stack,
      );
    }
    response.status(status).json({
      statusCode: status,
      code,
      message,
      ...(exception instanceof AppException && exception.details
        ? { details: exception.details }
        : {}),
      ...(isValidation ? { details: validation?.message } : {}),
      requestId: request.requestId,
    });
  }
}
