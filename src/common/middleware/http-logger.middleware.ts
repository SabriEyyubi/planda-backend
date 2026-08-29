import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { AuthenticatedRequest } from '../types/authenticated-request';

@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(request: Request, response: Response, next: NextFunction): void {
    const started = process.hrtime.bigint();
    response.on('finish', () => {
      const authRequest = request as Partial<AuthenticatedRequest>;
      this.logger.log({
        event: 'http_request_completed',
        requestId: authRequest.requestId,
        method: request.method,
        path: request.originalUrl.split('?')[0],
        statusCode: response.statusCode,
        durationMs: Number((Number(process.hrtime.bigint() - started) / 1_000_000).toFixed(3)),
        userId: authRequest.user?.id,
      });
    });
    next();
  }
}
