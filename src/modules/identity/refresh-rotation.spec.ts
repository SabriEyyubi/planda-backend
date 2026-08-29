import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PlatformRole, UserStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { AuthService } from './auth.service';

const oldRefreshToken = 'old-refresh-token';
const nextRefreshToken = 'next-refresh-token';
const sessionId = '10000000-0000-4000-8000-000000000001';
const oldTokenId = '20000000-0000-4000-8000-000000000001';
const nextTokenId = '30000000-0000-4000-8000-000000000001';
const future = (): Date => new Date(Date.now() + 60_000);
const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

interface Harness {
  service: AuthService;
  redis: RedisService;
  refreshUpdate: jest.Mock;
  sessionUpdate: jest.Mock;
  findUnique: jest.Mock;
  transactionStarted: Promise<void>;
  releaseTransaction: () => void;
  committedRotations: () => number;
}

function hasCompromiseWrite(mock: jest.Mock): boolean {
  const calls = mock.mock.calls as unknown as Array<[{ data?: { compromisedAt?: unknown } }]>;
  return calls.some(([argument]) => argument.data?.compromisedAt instanceof Date);
}

function createHarness(
  options: {
    used?: boolean;
    redisFailure?: boolean;
    stageFailure?: boolean;
    nearExpiryRace?: boolean;
    transactionFailure?: 'commit-then-throw' | 'rollback-then-throw';
  } = {},
): Harness {
  const user = {
    id: '40000000-0000-4000-8000-000000000001',
    email: 'buyer@example.test',
    passwordHash: 'unused',
    status: UserStatus.ACTIVE,
    securityVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    roles: [{ role: PlatformRole.BUYER }],
    memberships: [],
  };
  let persistedNext = false;
  let signedNextTokenId = nextTokenId;
  let committedRotations = 0;
  let transactionAttempts = 0;
  const oldToken = {
    id: oldTokenId,
    sessionId,
    tokenHash: hashToken(oldRefreshToken),
    expiresAt: future(),
    usedAt: options.used ? new Date() : null,
    revokedAt: null,
    createdAt: new Date(),
    session: {
      id: sessionId,
      userId: user.id,
      expiresAt: future(),
      absoluteExpiresAt: future(),
      revokedAt: null,
      compromisedAt: null,
      userAgent: null,
      ipAddress: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      user,
    },
  };
  const findUnique = jest.fn().mockImplementation((args: { where: { tokenHash: string } }) => {
    if (args.where.tokenHash === hashToken(oldRefreshToken)) return Promise.resolve(oldToken);
    if (args.where.tokenHash === hashToken(nextRefreshToken) && persistedNext) {
      return Promise.resolve({
        id: signedNextTokenId,
        sessionId,
        revokedAt: null,
        expiresAt: future(),
        session: {
          revokedAt: null,
          expiresAt: future(),
          absoluteExpiresAt: future(),
          user: { status: UserStatus.ACTIVE, securityVersion: 1 },
        },
      });
    }
    return Promise.resolve(null);
  });
  let signalTransactionStarted: () => void = () => undefined;
  let releaseTransaction: () => void = () => undefined;
  const transactionStarted = new Promise<void>((resolve) => {
    signalTransactionStarted = resolve;
  });
  const transactionGate = new Promise<void>((resolve) => {
    releaseTransaction = resolve;
  });
  const refreshUpdate = jest.fn().mockImplementation(async () => {
    signalTransactionStarted();
    if (options.nearExpiryRace) await transactionGate;
    return { count: options.used ? 0 : 1 };
  });
  const sessionUpdate = jest.fn().mockResolvedValue({ count: 1 });
  const refreshCreate = jest.fn().mockImplementation(() => {
    persistedNext = true;
    return Promise.resolve({});
  });
  const tx = {
    refreshToken: { updateMany: refreshUpdate, create: refreshCreate },
    authSession: { updateMany: sessionUpdate },
  };
  const prisma = {
    refreshToken: { findUnique, updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    authSession: { updateMany: sessionUpdate },
    $transaction: jest.fn(async (operation: unknown) => {
      if (typeof operation === 'function') {
        transactionAttempts += 1;
        const transactionResult = await (operation as (client: typeof tx) => Promise<unknown>)(tx);
        if (transactionAttempts === 1 && options.transactionFailure === 'commit-then-throw') {
          oldToken.usedAt = new Date();
          committedRotations += 1;
          throw new Error('database acknowledgement lost');
        }
        if (transactionAttempts === 1 && options.transactionFailure === 'rollback-then-throw') {
          persistedNext = false;
          oldToken.usedAt = null;
          throw new Error('database transaction rolled back');
        }
        oldToken.usedAt = new Date();
        committedRotations += 1;
        return transactionResult;
      }
      return Promise.all(operation as Promise<unknown>[]);
    }),
  } as unknown as PrismaService;
  const jwt = {
    verifyAsync: jest.fn((token: string) => {
      if (token === oldRefreshToken)
        return Promise.resolve({
          sub: user.id,
          sid: sessionId,
          jti: oldTokenId,
          ver: 1,
          type: 'refresh',
        });
      if (token === nextRefreshToken)
        return Promise.resolve({
          sub: user.id,
          sid: sessionId,
          jti: signedNextTokenId,
          ver: 1,
          type: 'refresh',
        });
      return Promise.reject(new Error('invalid'));
    }),
    signAsync: jest.fn((payload: { type: string; jti?: string }) => {
      if (payload.type === 'refresh') {
        signedNextTokenId = payload.jti ?? nextTokenId;
        return Promise.resolve(nextRefreshToken);
      }
      return Promise.resolve('next-access-token');
    }),
  } as unknown as JwtService;
  const config = {
    getOrThrow: jest.fn(
      (key: string) =>
        ({
          'jwt.accessTtl': '15m',
          'jwt.refreshTtl': '30d',
          'jwt.accessSecret': 'a'.repeat(32),
          'jwt.refreshSecret': 'r'.repeat(32),
          'jwt.issuer': 'planda-api',
          'jwt.audience': 'planda-clients',
          'auth.refreshRotationGraceSeconds': 1,
        })[key],
    ),
  } as unknown as ConfigService;
  let owner: string | null = null;
  let result: string | null = null;
  let leaseRenewed = false;
  const redis = {
    getRefreshRotation: jest.fn(() => {
      if (options.redisFailure) return Promise.reject(new Error('redis unavailable'));
      return Promise.resolve({ locked: owner !== null, result });
    }),
    acquireRefreshRotation: jest.fn((_hash: string, candidate: string) => {
      if (owner && !(options.nearExpiryRace && !leaseRenewed)) return Promise.resolve(false);
      owner = candidate;
      return Promise.resolve(true);
    }),
    stageRefreshRotation: jest.fn((_hash: string, candidate: string, value: string) => {
      if (options.stageFailure) return Promise.reject(new Error('redis unavailable'));
      if (owner !== candidate) return Promise.resolve(false);
      leaseRenewed = true;
      result = value;
      return Promise.resolve(true);
    }),
    finishRefreshRotation: jest.fn((_hash: string, candidate: string, discardResult: boolean) => {
      if (owner === candidate) {
        if (discardResult) result = null;
        owner = null;
      }
      return Promise.resolve();
    }),
  } as unknown as RedisService;
  return {
    service: new AuthService(prisma, jwt, config, redis),
    redis,
    refreshUpdate,
    sessionUpdate,
    findUnique,
    transactionStarted,
    releaseTransaction,
    committedRotations: () => committedRotations,
  };
}

describe('AuthService distributed refresh rotation', () => {
  it('rotates once and returns the exact same pair to concurrent callers', async () => {
    const harness = createHarness();
    const [first, second] = await Promise.all([
      harness.service.refresh(oldRefreshToken),
      harness.service.refresh(oldRefreshToken),
    ]);
    expect(second).toEqual(first);
    expect(harness.refreshUpdate).toHaveBeenCalledTimes(1);
    expect(hasCompromiseWrite(harness.sessionUpdate)).toBe(false);
  });

  it('replays the exact cached pair inside the grace window without another rotation', async () => {
    const harness = createHarness();
    const first = await harness.service.refresh(oldRefreshToken);
    const replay = await harness.service.refresh(oldRefreshToken);
    expect(replay).toEqual(first);
    expect(harness.refreshUpdate).toHaveBeenCalledTimes(1);
  });

  it('renews a near-expiry lease before DB work so a second owner cannot rotate', async () => {
    const harness = createHarness({ nearExpiryRace: true });
    const first = harness.service.refresh(oldRefreshToken);
    await harness.transactionStarted;
    const second = harness.service.refresh(oldRefreshToken);
    await new Promise((resolve) => setTimeout(resolve, 50));
    harness.releaseTransaction();
    const [firstPair, secondPair] = await Promise.all([first, second]);
    expect(secondPair).toEqual(firstPair);
    expect(harness.refreshUpdate).toHaveBeenCalledTimes(1);
    expect(hasCompromiseWrite(harness.sessionUpdate)).toBe(false);
    const stageCalls = (harness.redis.stageRefreshRotation as unknown as jest.Mock).mock
      .calls as unknown as Array<[string, string, string, number, number]>;
    expect(stageCalls[0]?.slice(3)).toEqual([11_000, 10_000]);
  });

  it('compromises the session for reuse after the grace result is gone', async () => {
    const harness = createHarness({ used: true });
    await expect(harness.service.refresh(oldRefreshToken)).rejects.toThrow(
      'Refresh token reuse detected',
    );
    expect(hasCompromiseWrite(harness.sessionUpdate)).toBe(true);
  });

  it('fails closed on Redis errors before any DB read or compromise', async () => {
    const harness = createHarness({ redisFailure: true });
    await expect(harness.service.refresh(oldRefreshToken)).rejects.toMatchObject({
      code: 'AUTH_REFRESH_COORDINATION_UNAVAILABLE',
    } satisfies Partial<AppException>);
    expect(harness.findUnique).not.toHaveBeenCalled();
    expect(harness.sessionUpdate).not.toHaveBeenCalled();
  });

  it('does not mutate refresh state when Redis fails after the lock is acquired', async () => {
    const harness = createHarness({ stageFailure: true });
    await expect(harness.service.refresh(oldRefreshToken)).rejects.toMatchObject({
      code: 'AUTH_REFRESH_COORDINATION_UNAVAILABLE',
    } satisfies Partial<AppException>);
    expect(harness.refreshUpdate).not.toHaveBeenCalled();
    expect(hasCompromiseWrite(harness.sessionUpdate)).toBe(false);
  });

  it('recovers the exact staged pair when the commit succeeds but its acknowledgement is lost', async () => {
    const harness = createHarness({ transactionFailure: 'commit-then-throw' });
    await expect(harness.service.refresh(oldRefreshToken)).rejects.toThrow(
      'database acknowledgement lost',
    );
    const stageCalls = (harness.redis.stageRefreshRotation as unknown as jest.Mock).mock
      .calls as unknown as Array<[string, string, string, number, number]>;
    const stagedPair = JSON.parse(stageCalls[0]![2]) as unknown;
    await expect(harness.service.refresh(oldRefreshToken)).resolves.toEqual(stagedPair);
    expect(harness.committedRotations()).toBe(1);
    expect(hasCompromiseWrite(harness.sessionUpdate)).toBe(false);
  });

  it('rejects a staged rollback result and safely retries one successful rotation', async () => {
    const harness = createHarness({ transactionFailure: 'rollback-then-throw' });
    await expect(harness.service.refresh(oldRefreshToken)).rejects.toThrow(
      'database transaction rolled back',
    );
    await expect(harness.service.refresh(oldRefreshToken)).resolves.toMatchObject({
      refreshToken: nextRefreshToken,
      accessToken: 'next-access-token',
    });
    expect(harness.committedRotations()).toBe(1);
    expect(harness.refreshUpdate).toHaveBeenCalledTimes(2);
    expect(hasCompromiseWrite(harness.sessionUpdate)).toBe(false);
  });
});
