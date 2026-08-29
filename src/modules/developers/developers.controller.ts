import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { DevelopersService } from './developers.service';
import { PublicDeveloperDto } from './dto/developer-response.dto';

@ApiTags('Developers')
@ApiErrorResponses()
@RateLimit('public')
@Controller('developers')
export class DevelopersController {
  constructor(private readonly developers: DevelopersService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600')
  @ApiOkResponse({ type: [PublicDeveloperDto] })
  list(): Promise<PublicDeveloperDto[]> {
    return this.developers.list();
  }

  @Get(':slug')
  @Header('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600')
  @ApiOkResponse({ type: PublicDeveloperDto })
  detail(@Param('slug') slug: string): Promise<PublicDeveloperDto> {
    return this.developers.detail(slug);
  }
}
