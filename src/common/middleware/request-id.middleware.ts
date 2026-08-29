import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { RequestContextService } from './request-context.service';

const VALID_REQUEST_ID = /^[A-Za-z0-9._:-]{1,100}$/;

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  constructor(private readonly context: RequestContextService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const supplied = request.header('x-request-id');
    const requestId = supplied && VALID_REQUEST_ID.test(supplied) ? supplied : randomUUID();
    Object.assign(request, { requestId });
    response.setHeader('x-request-id', requestId);
    this.context.run({ requestId }, next);
  }
}
