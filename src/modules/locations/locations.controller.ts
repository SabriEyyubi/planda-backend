import { Controller, Get, Header, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { CityCatalogDto, LocationReferenceDto } from './dto/location-response.dto';
import { LocationsService } from './locations.service';

@ApiTags('Locations')
@ApiErrorResponses()
@RateLimit('public')
@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get('provinces')
  @Header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
  @ApiOkResponse({ type: [LocationReferenceDto] })
  listProvinces(): Promise<LocationReferenceDto[]> {
    return this.locations.listProvinces();
  }

  @Get('provinces/:provinceId/districts')
  @Header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
  @ApiOkResponse({ type: [LocationReferenceDto] })
  listDistricts(
    @Param('provinceId', new ParseUUIDPipe()) provinceId: string,
  ): Promise<LocationReferenceDto[]> {
    return this.locations.listDistricts(provinceId);
  }

  @Get('cities')
  @Header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
  @ApiOkResponse({ type: [CityCatalogDto] })
  listCities(): Promise<CityCatalogDto[]> {
    return this.locations.listCities();
  }

  @Get('cities/:slug')
  @Header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
  @ApiOkResponse({ type: CityCatalogDto })
  city(@Param('slug') slug: string): Promise<CityCatalogDto> {
    return this.locations.city(slug);
  }
}
