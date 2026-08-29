import { ConfigService } from '@nestjs/config';
import { PlatformRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const config = {
    getOrThrow: jest.fn(
      (key: string) =>
        ({
          'jwt.accessSecret': 'a'.repeat(32),
          'jwt.issuer': 'planda-api',
          'jwt.audience': 'planda-clients',
        })[key],
    ),
  } as unknown as ConfigService;

  it('rejects access tokens after session revocation or security version change', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'session-id',
        user: {
          id: 'user-id',
          email: 'admin@example.test',
          status: UserStatus.ACTIVE,
          securityVersion: 2,
          roles: [{ role: PlatformRole.ADMIN }],
        },
      });
    const strategy = new JwtStrategy(config, {
      authSession: { findFirst },
    } as unknown as PrismaService);
    const claims = {
      sub: 'user-id',
      sid: 'session-id',
      ver: 1,
      email: 'admin@example.test',
      roles: [PlatformRole.ADMIN],
      type: 'access' as const,
    };
    expect(await strategy.validate(claims)).toBeNull();
    expect(await strategy.validate(claims)).toBeNull();
  });
});
