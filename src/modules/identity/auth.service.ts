import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PlatformRole, Prisma, UserStatus } from '@prisma/client';
import { hash, verify } from 'argon2';
import { createHash, randomUUID } from 'node:crypto';
import { durationToSeconds } from '../../common/utils/duration';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { AuthUserDto, TokenPairDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import {
  nextSessionExpiry,
  remainingSeconds,
  SESSION_ABSOLUTE_TTL_SECONDS,
} from './session-policy';

export interface SessionMetadata {
  userAgent?: string;
  ipAddress?: string;
}

interface RefreshClaims {
  sub: string;
  sid: string;
  jti: string;
  ver: number;
  type: 'refresh';
}

type UserWithSessionContext = Prisma.UserGetPayload<{
  include: { roles: true; memberships: true };
}>;

const REFRESH_ROTATION_TRANSACTION_TIMEOUT_MS = 5_000;
const REFRESH_ROTATION_TRANSACTION_MAX_WAIT_MS = 2_000;
const REFRESH_ROTATION_MINIMUM_LEASE_MS = REFRESH_ROTATION_TRANSACTION_TIMEOUT_MS * 2;

@Injectable()
export class AuthService {
  private readonly accessTtl: number;
  private readonly refreshTtl: number;
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly refreshRotationGraceMs: number;
  private readonly refreshRotationLockMs: number;
  private readonly dummyPasswordHash: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.accessTtl = durationToSeconds(config.getOrThrow<string>('jwt.accessTtl'));
    this.refreshTtl = durationToSeconds(config.getOrThrow<string>('jwt.refreshTtl'));
    this.accessSecret = config.getOrThrow<string>('jwt.accessSecret');
    this.refreshSecret = config.getOrThrow<string>('jwt.refreshSecret');
    this.issuer = config.getOrThrow<string>('jwt.issuer');
    this.audience = config.getOrThrow<string>('jwt.audience');
    this.refreshRotationGraceMs =
      config.getOrThrow<number>('auth.refreshRotationGraceSeconds') * 1000;
    this.refreshRotationLockMs = Math.max(
      REFRESH_ROTATION_MINIMUM_LEASE_MS,
      this.refreshRotationGraceMs * 2,
    );
    this.dummyPasswordHash = hash('PLANDA constant-time invalid credential placeholder');
  }

  async register(dto: RegisterDto, metadata: SessionMetadata): Promise<TokenPairDto> {
    const passwordHash = await hash(dto.password);
    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          passwordHash,
          roles: { create: { role: PlatformRole.BUYER } },
        },
        include: { roles: true, memberships: true },
      });
      return this.createSession(user, metadata);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException('EMAIL_ALREADY_EXISTS', 'Email is already registered', 409);
      }
      throw error;
    }
  }

  async login(dto: LoginDto, metadata: SessionMetadata): Promise<TokenPairDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { roles: true, memberships: true },
    });
    const candidateHash = user?.passwordHash ?? (await this.dummyPasswordHash);
    const passwordMatches = await verify(candidateHash, dto.password);
    if (!user || !passwordMatches || user.status !== UserStatus.ACTIVE) {
      throw new AppException('AUTH_INVALID_CREDENTIALS', 'Invalid credentials', 401);
    }
    return this.createSession(user, metadata);
  }

  async refresh(rawToken: string): Promise<TokenPairDto> {
    const claims = await this.verifyRefresh(rawToken);
    const tokenHash = this.hashToken(rawToken);
    const cached = await this.readCompletedRefreshRotation(tokenHash, claims.sid);
    if (cached) return cached;

    const owner = randomUUID();
    const deadline = Date.now() + this.refreshRotationGraceMs;
    let acquired = await this.acquireRefreshRotation(tokenHash, owner);
    while (!acquired && Date.now() < deadline) {
      await this.delay(25);
      const replay = await this.readCompletedRefreshRotation(tokenHash, claims.sid);
      if (replay) return replay;
      acquired = await this.acquireRefreshRotation(tokenHash, owner);
    }
    if (!acquired) throw this.refreshCoordinationUnavailable();

    let committed = false;
    let staged = false;
    try {
      const replay = await this.readCompletedRefreshRotation(tokenHash, claims.sid, true);
      if (replay) {
        committed = true;
        try {
          await this.redis.finishRefreshRotation(
            tokenHash,
            owner,
            false,
            this.refreshRotationGraceMs,
          );
        } catch {
          // The lock is lease-based and the already validated result remains short lived.
        }
        return replay;
      }
      const pair = await this.rotateRefresh(tokenHash, claims, owner, () => {
        staged = true;
      });
      committed = true;
      try {
        await this.redis.finishRefreshRotation(
          tokenHash,
          owner,
          false,
          this.refreshRotationGraceMs,
        );
      } catch {
        // The staged result remains bounded by its TTL and can be DB-validated by another instance.
      }
      return pair;
    } finally {
      if (!committed) {
        try {
          await this.redis.finishRefreshRotation(
            tokenHash,
            owner,
            !staged,
            this.refreshRotationGraceMs,
          );
        } catch {
          // Lock and staged data still expire automatically; never compromise on coordination failure.
        }
      }
    }
  }

  private async rotateRefresh(
    tokenHash: string,
    claims: RefreshClaims,
    owner: string,
    onStaged: () => void,
  ): Promise<TokenPairDto> {
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        session: { include: { user: { include: { roles: true, memberships: true } } } },
      },
    });
    if (!token || token.sessionId !== claims.sid || token.id !== claims.jti) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const now = new Date();
    if (token.usedAt || token.revokedAt) {
      await this.compromiseSession(token.sessionId, now);
      throw new UnauthorizedException('Refresh token reuse detected');
    }
    if (
      token.expiresAt <= now ||
      token.session.expiresAt <= now ||
      token.session.absoluteExpiresAt <= now ||
      token.session.revokedAt ||
      token.session.user.status !== UserStatus.ACTIVE ||
      token.session.user.securityVersion !== claims.ver
    ) {
      throw new UnauthorizedException('Refresh session expired or revoked');
    }

    const nextId = randomUUID();
    const nextExpiresAt = nextSessionExpiry(now, this.refreshTtl, token.session.absoluteExpiresAt);
    const refreshExpiresIn = remainingSeconds(now, nextExpiresAt);
    if (refreshExpiresIn < 1) throw new UnauthorizedException('Refresh session expired or revoked');
    const nextToken = await this.signRefresh(
      token.session.userId,
      token.sessionId,
      nextId,
      token.session.user.securityVersion,
      refreshExpiresIn,
    );
    const pair = await this.buildPair(
      token.session.user,
      token.sessionId,
      nextToken,
      refreshExpiresIn,
    );
    const staged = await this.stageRefreshRotation(tokenHash, owner, pair);
    if (!staged) throw this.refreshCoordinationUnavailable();
    onStaged();

    const rotated = await this.prisma.$transaction(
      async (tx) => {
        const updated = await tx.refreshToken.updateMany({
          where: { id: token.id, usedAt: null, revokedAt: null },
          data: { usedAt: now },
        });
        if (updated.count !== 1) return false;
        const sessionUpdated = await tx.authSession.updateMany({
          where: {
            id: token.sessionId,
            revokedAt: null,
            expiresAt: { gt: now },
            absoluteExpiresAt: { gt: now },
          },
          data: { expiresAt: nextExpiresAt },
        });
        if (sessionUpdated.count !== 1) {
          throw new UnauthorizedException('Refresh session expired or revoked');
        }
        await tx.refreshToken.create({
          data: {
            id: nextId,
            sessionId: token.sessionId,
            tokenHash: this.hashToken(nextToken),
            expiresAt: nextExpiresAt,
          },
        });
        return true;
      },
      {
        maxWait: REFRESH_ROTATION_TRANSACTION_MAX_WAIT_MS,
        timeout: REFRESH_ROTATION_TRANSACTION_TIMEOUT_MS,
      },
    );
    if (!rotated) {
      await this.compromiseSession(token.sessionId, now);
      throw new UnauthorizedException('Refresh token reuse detected');
    }
    return pair;
  }

  async logout(rawToken: string): Promise<void> {
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(rawToken) },
    });
    if (!token) return;
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.authSession.updateMany({
        where: { id: token.sessionId, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.refreshToken.updateMany({
        where: { sessionId: token.sessionId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
  }

  async me(userId: string): Promise<AuthUserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: true, memberships: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE) throw new UnauthorizedException();
    return this.toAuthUser(user);
  }

  private async createSession(
    user: UserWithSessionContext,
    metadata: SessionMetadata,
  ): Promise<TokenPairDto> {
    const now = new Date();
    const absoluteExpiresAt = new Date(now.getTime() + SESSION_ABSOLUTE_TTL_SECONDS * 1000);
    const expiresAt = nextSessionExpiry(now, this.refreshTtl, absoluteExpiresAt);
    const refreshExpiresIn = remainingSeconds(now, expiresAt);
    const sessionId = randomUUID();
    const tokenId = randomUUID();
    const refreshToken = await this.signRefresh(
      user.id,
      sessionId,
      tokenId,
      user.securityVersion,
      refreshExpiresIn,
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.authSession.create({
        data: { id: sessionId, userId: user.id, expiresAt, absoluteExpiresAt, ...metadata },
      });
      await tx.refreshToken.create({
        data: {
          id: tokenId,
          sessionId,
          tokenHash: this.hashToken(refreshToken),
          expiresAt,
        },
      });
    });
    return this.buildPair(user, sessionId, refreshToken, refreshExpiresIn);
  }

  private async buildPair(
    user: UserWithSessionContext,
    sessionId: string,
    refreshToken: string,
    refreshExpiresIn: number,
  ): Promise<TokenPairDto> {
    const roles = user.roles.map(({ role }) => role);
    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        sid: sessionId,
        ver: user.securityVersion,
        email: user.email,
        roles,
        type: 'access',
      },
      {
        secret: this.accessSecret,
        expiresIn: this.accessTtl,
        issuer: this.issuer,
        audience: this.audience,
      },
    );
    return {
      accessToken,
      refreshToken,
      accessTokenExpiresIn: this.accessTtl,
      refreshTokenExpiresIn: refreshExpiresIn,
      user: this.toAuthUser(user),
    };
  }

  private toAuthUser(user: UserWithSessionContext): AuthUserDto {
    return {
      id: user.id,
      email: user.email,
      roles: user.roles.map(({ role }) => role),
      organizationMemberships: user.memberships.map(({ organizationId, role }) => ({
        organizationId,
        role,
      })),
    };
  }

  private signRefresh(
    userId: string,
    sessionId: string,
    tokenId: string,
    securityVersion: number,
    expiresIn: number,
  ): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, sid: sessionId, jti: tokenId, ver: securityVersion, type: 'refresh' },
      {
        secret: this.refreshSecret,
        expiresIn,
        issuer: this.issuer,
        audience: this.audience,
      },
    );
  }

  private async verifyRefresh(rawToken: string): Promise<RefreshClaims> {
    try {
      const claims = await this.jwt.verifyAsync<RefreshClaims>(rawToken, {
        secret: this.refreshSecret,
        issuer: this.issuer,
        audience: this.audience,
      });
      if (claims.type !== 'refresh') throw new Error('Wrong token type');
      return claims;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async readCompletedRefreshRotation(
    tokenHash: string,
    expectedSessionId: string,
    ignoreLock = false,
  ): Promise<TokenPairDto | null> {
    let state: { locked: boolean; result: string | null };
    try {
      state = await this.redis.getRefreshRotation(tokenHash);
    } catch {
      throw this.refreshCoordinationUnavailable();
    }
    if ((state.locked && !ignoreLock) || !state.result) return null;
    const pair = this.parseRefreshRotation(state.result);
    if (!pair) return null;
    return (await this.isPersistedRefreshRotation(pair, expectedSessionId)) ? pair : null;
  }

  private async isPersistedRefreshRotation(
    pair: TokenPairDto,
    expectedSessionId: string,
  ): Promise<boolean> {
    let claims: RefreshClaims;
    try {
      claims = await this.verifyRefresh(pair.refreshToken);
    } catch {
      return false;
    }
    if (claims.sid !== expectedSessionId) return false;
    const now = new Date();
    const persisted = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(pair.refreshToken) },
      select: {
        id: true,
        sessionId: true,
        revokedAt: true,
        expiresAt: true,
        session: {
          select: {
            revokedAt: true,
            expiresAt: true,
            absoluteExpiresAt: true,
            user: { select: { status: true, securityVersion: true } },
          },
        },
      },
    });
    return Boolean(
      persisted &&
      persisted.id === claims.jti &&
      persisted.sessionId === claims.sid &&
      !persisted.revokedAt &&
      !persisted.session.revokedAt &&
      persisted.expiresAt > now &&
      persisted.session.expiresAt > now &&
      persisted.session.absoluteExpiresAt > now &&
      persisted.session.user.status === UserStatus.ACTIVE &&
      persisted.session.user.securityVersion === claims.ver,
    );
  }

  private parseRefreshRotation(value: string): TokenPairDto | null {
    try {
      const pair = JSON.parse(value) as Partial<TokenPairDto>;
      if (
        typeof pair.accessToken !== 'string' ||
        typeof pair.refreshToken !== 'string' ||
        typeof pair.accessTokenExpiresIn !== 'number' ||
        typeof pair.refreshTokenExpiresIn !== 'number' ||
        !pair.user ||
        typeof pair.user.id !== 'string' ||
        typeof pair.user.email !== 'string' ||
        !Array.isArray(pair.user.roles) ||
        !Array.isArray(pair.user.organizationMemberships)
      )
        return null;
      return pair as TokenPairDto;
    } catch {
      return null;
    }
  }

  private async acquireRefreshRotation(tokenHash: string, owner: string): Promise<boolean> {
    try {
      return await this.redis.acquireRefreshRotation(tokenHash, owner, this.refreshRotationLockMs);
    } catch {
      throw this.refreshCoordinationUnavailable();
    }
  }

  private async stageRefreshRotation(
    tokenHash: string,
    owner: string,
    pair: TokenPairDto,
  ): Promise<boolean> {
    try {
      return await this.redis.stageRefreshRotation(
        tokenHash,
        owner,
        JSON.stringify(pair),
        this.refreshRotationLockMs + this.refreshRotationGraceMs,
        this.refreshRotationLockMs,
      );
    } catch {
      throw this.refreshCoordinationUnavailable();
    }
  }

  private refreshCoordinationUnavailable(): AppException {
    return new AppException(
      'AUTH_REFRESH_COORDINATION_UNAVAILABLE',
      'Refresh is temporarily unavailable',
      503,
    );
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async compromiseSession(sessionId: string, now: Date): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.authSession.updateMany({
        where: { id: sessionId },
        data: { compromisedAt: now, revokedAt: now },
      }),
      this.prisma.refreshToken.updateMany({
        where: { sessionId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
  }
}
