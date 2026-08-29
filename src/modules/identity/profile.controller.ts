import { Body, Controller, Get, Header, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AccessTokenGuard } from '../../common/guards/access-token.guard';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { ProfileResponseDto, UpdateProfileDto } from './dto/profile.dto';
import { ProfileService } from './profile.service';

@ApiTags('Profile')
@ApiErrorResponses()
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@RateLimit('public')
@Controller('me/profile')
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: ProfileResponseDto })
  get(@CurrentUser() user: AuthenticatedUser): Promise<ProfileResponseDto> {
    return this.profiles.get(user.id);
  }

  @Patch()
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: ProfileResponseDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    return this.profiles.update(user.id, dto);
  }
}
