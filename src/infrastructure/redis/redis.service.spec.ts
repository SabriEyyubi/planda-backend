import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

describe('RedisService rate limits', () => {
  it('interprets the atomic counter result without exposing tracker values', async () => {
    const config = {
      getOrThrow: jest.fn().mockReturnValue('redis://localhost:6379'),
    } as unknown as ConfigService;
    const service = new RedisService(config);
    jest.spyOn(service.client, 'eval').mockResolvedValue([6, 42]);
    Object.defineProperty(service.client, 'status', { value: 'ready' });
    await expect(service.consumeRateLimit('hashed-key', 5, 900)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 42,
    });
    service.onModuleDestroy();
  });

  it('renews the owner lease atomically when staging a refresh result', async () => {
    const config = {
      getOrThrow: jest.fn().mockReturnValue('redis://localhost:6379'),
    } as unknown as ConfigService;
    const service = new RedisService(config);
    const evalCommand = jest.spyOn(service.client, 'eval').mockResolvedValue(1);
    Object.defineProperty(service.client, 'status', { value: 'ready' });
    await expect(
      service.stageRefreshRotation('token-hash', 'owner-1', '{"pair":true}', 15_000, 10_000),
    ).resolves.toBe(true);
    expect(evalCommand).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('PEXPIRE',KEYS[1],ARGV[4])"),
      2,
      'auth:refresh-rotation:token-hash:lock',
      'auth:refresh-rotation:token-hash:result',
      'owner-1',
      '{"pair":true}',
      15_000,
      10_000,
    );
    service.onModuleDestroy();
  });

  it('owner-checks result deletion and lock release in one Lua command', async () => {
    const config = {
      getOrThrow: jest.fn().mockReturnValue('redis://localhost:6379'),
    } as unknown as ConfigService;
    const service = new RedisService(config);
    const evalCommand = jest.spyOn(service.client, 'eval').mockResolvedValue(0);
    Object.defineProperty(service.client, 'status', { value: 'ready' });
    await service.finishRefreshRotation('token-hash', 'stale-owner', true, 5_000);
    expect(evalCommand).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('GET',KEYS[1])~=ARGV[1]"),
      2,
      'auth:refresh-rotation:token-hash:lock',
      'auth:refresh-rotation:token-hash:result',
      'stale-owner',
      '1',
      5_000,
    );
    service.onModuleDestroy();
  });
});
