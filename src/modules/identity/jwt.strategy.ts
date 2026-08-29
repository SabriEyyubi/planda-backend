import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { PlatformRole, UserStatus } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { PrismaService } from '../../infrastructure/database/prisma.service';

interface AccessClaims {
  sub: string;
  sid: string;
  ver: number;
  email: string;
  roles: PlatformRole[];
  type: 'access';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwt.accessSecret'),
      issuer: config.getOrThrow<string>('jwt.issuer'),
      audience: config.getOrThrow<string>('jwt.audience'),
    });
  }
  async validate(payload: AccessClaims): Promise<AuthenticatedUser | null> {
    if (payload.type !== 'access' || !payload.sid) return null;
    const now = new Date();
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: now },
        absoluteExpiresAt: { gt: now },
      },
      include: { user: { include: { roles: true } } },
    });
    if (
      !session ||
      session.user.status !== UserStatus.ACTIVE ||
      session.user.securityVersion !== payload.ver
    )
      return null;
    return {
      id: session.user.id,
      email: session.user.email,
      roles: session.user.roles.map(({ role }) => role),
      sessionId: session.id,
      securityVersion: session.user.securityVersion,
    };
  }
}
