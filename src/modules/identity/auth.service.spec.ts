import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { MembershipRole, PlatformRole } from '@prisma/client';
import { verify } from 'argon2';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  it('public registration assigns only BUYER and hashes the password', async () => {
    let createData:
      | { email: string; passwordHash: string; roles: { create: { role: PlatformRole } } }
      | undefined;
    const prisma = {
      user: {
        create: jest.fn().mockImplementation((args: { data: typeof createData }) => {
          createData = args.data;
          return Promise.resolve({
            id: '00000000-0000-4000-8000-000000000001',
            email: args.data?.email,
            passwordHash: args.data?.passwordHash,
            status: 'ACTIVE',
            securityVersion: 1,
            roles: [{ role: PlatformRole.BUYER }],
            memberships: [
              {
                organizationId: '10000000-0000-4000-8000-000000000001',
                role: MembershipRole.MEMBER,
              },
            ],
          });
        }),
      },
      authSession: { create: jest.fn().mockResolvedValue({}) },
      refreshToken: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: unknown) => unknown) =>
          Promise.resolve(callback(prisma)),
        ),
    } as unknown as PrismaService;
    const jwt = {
      signAsync: jest
        .fn()
        .mockResolvedValueOnce('refresh.jwt.token')
        .mockResolvedValueOnce('access.jwt.token'),
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
            'auth.refreshRotationGraceSeconds': 5,
          })[key],
      ),
    } as unknown as ConfigService;
    const service = new AuthService(prisma, jwt, config, {} as RedisService);
    const result = await service.register(
      { email: 'buyer@example.test', password: 'DevelopmentOnly!123' },
      {},
    );
    expect(createData?.roles.create.role).toBe(PlatformRole.BUYER);
    expect(createData?.passwordHash).not.toBe('DevelopmentOnly!123');
    expect(await verify(createData!.passwordHash, 'DevelopmentOnly!123')).toBe(true);
    expect(result.user.roles).toEqual([PlatformRole.BUYER]);
    expect(result.user.organizationMemberships).toEqual([
      {
        organizationId: '10000000-0000-4000-8000-000000000001',
        role: MembershipRole.MEMBER,
      },
    ]);
  });

  it('returns all platform roles separately from organization membership roles', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: '00000000-0000-4000-8000-000000000001',
          email: 'developer@example.test',
          passwordHash: 'unused',
          status: 'ACTIVE',
          securityVersion: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          roles: [{ role: PlatformRole.BUYER }, { role: PlatformRole.DEVELOPER_MEMBER }],
          memberships: [
            {
              userId: '00000000-0000-4000-8000-000000000001',
              organizationId: '10000000-0000-4000-8000-000000000001',
              role: MembershipRole.OWNER,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        }),
      },
    } as unknown as PrismaService;
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
            'auth.refreshRotationGraceSeconds': 5,
          })[key],
      ),
    } as unknown as ConfigService;
    const result = await new AuthService(prisma, {} as JwtService, config, {} as RedisService).me(
      '00000000-0000-4000-8000-000000000001',
    );
    expect(result.roles).toEqual([PlatformRole.BUYER, PlatformRole.DEVELOPER_MEMBER]);
    expect(result.organizationMemberships).toEqual([
      {
        organizationId: '10000000-0000-4000-8000-000000000001',
        role: MembershipRole.OWNER,
      },
    ]);
  });
});
