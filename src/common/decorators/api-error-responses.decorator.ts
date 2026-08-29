import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiServiceUnavailableResponse,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ApiErrorDto } from '../dto/api-error.dto';

export function ApiErrorResponses(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(ApiErrorDto),
    ApiBadRequestResponse({ type: ApiErrorDto }),
    ApiUnauthorizedResponse({ type: ApiErrorDto }),
    ApiForbiddenResponse({ type: ApiErrorDto }),
    ApiNotFoundResponse({ type: ApiErrorDto }),
    ApiConflictResponse({ type: ApiErrorDto }),
    ApiUnprocessableEntityResponse({ type: ApiErrorDto }),
    ApiTooManyRequestsResponse({ type: ApiErrorDto }),
    ApiInternalServerErrorResponse({ type: ApiErrorDto }),
    ApiServiceUnavailableResponse({ type: ApiErrorDto }),
  );
}
