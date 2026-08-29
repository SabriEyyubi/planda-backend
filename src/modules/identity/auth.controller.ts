import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AccessTokenGuard } from '../../common/guards/access-token.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator';
import { AuthService } from './auth.service';
import { AuthUserDto, TokenPairDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';

@ApiTags('Authentication')
@ApiErrorResponses()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @RateLimit('register')
  @Header('Cache-Control', 'no-store')
  @ApiCreatedResponse({ type: TokenPairDto })
  register(@Body() dto: RegisterDto, @Req() request: Request): Promise<TokenPairDto> {
    return this.auth.register(dto, this.metadata(request));
  }

  @Post('login')
  @RateLimit('login')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: TokenPairDto })
  login(@Body() dto: LoginDto, @Req() request: Request): Promise<TokenPairDto> {
    return this.auth.login(dto, this.metadata(request));
  }

  @Post('refresh')
  @RateLimit('refresh')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: TokenPairDto })
  refresh(@Body() dto: RefreshTokenDto): Promise<TokenPairDto> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @RateLimit('refresh')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  @RateLimit('public')
  @Header('Cache-Control', 'no-store')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ type: AuthUserDto })
  me(@CurrentUser() user: AuthenticatedUser): Promise<AuthUserDto> {
    return this.auth.me(user.id);
  }

  private metadata(request: Request): { userAgent?: string; ipAddress?: string } {
    return {
      ...(request.header('user-agent') ? { userAgent: request.header('user-agent') } : {}),
      ...(request.ip ? { ipAddress: request.ip } : {}),
    };
  }
}
