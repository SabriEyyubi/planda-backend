import { ApiProperty } from '@nestjs/swagger';
import { IsJWT } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Opaque-to-client rotating refresh JWT' })
  @IsJWT()
  refreshToken!: string;
}
