import { ApiProperty } from '@nestjs/swagger';
import { MembershipRole, PlatformRole } from '@prisma/client';

export class OrganizationMembershipDto {
  @ApiProperty({ format: 'uuid' }) organizationId!: string;
  @ApiProperty({ enum: MembershipRole }) role!: MembershipRole;
}

export class AuthUserDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'email' }) email!: string;
  @ApiProperty({ enum: PlatformRole, isArray: true }) roles!: PlatformRole[];
  @ApiProperty({ type: [OrganizationMembershipDto] })
  organizationMemberships!: OrganizationMembershipDto[];
}

export class TokenPairDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty() refreshToken!: string;
  @ApiProperty({ example: 900 }) accessTokenExpiresIn!: number;
  @ApiProperty({ example: 2592000 }) refreshTokenExpiresIn!: number;
  @ApiProperty({ type: AuthUserDto }) user!: AuthUserDto;
}
