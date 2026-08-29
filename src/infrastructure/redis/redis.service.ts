import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  constructor(config: ConfigService) {
    this.client = new Redis(config.getOrThrow<string>('redisUrl'), {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    this.client.on('error', () => undefined);
  }
  async ping(): Promise<string> {
    if (this.client.status === 'wait') await this.client.connect();
    return this.client.ping();
  }
  async consumeRateLimit(
    key: string,
    limit: number,
    ttlSeconds: number,
  ): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    if (this.client.status === 'wait' || this.client.status === 'end') await this.client.connect();
    const result = (await this.client.eval(
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return {n,redis.call('TTL',KEYS[1])}",
      1,
      key,
      ttlSeconds,
    )) as [number, number];
    return { allowed: result[0] <= limit, retryAfterSeconds: Math.max(1, result[1]) };
  }

  async getRefreshRotation(tokenHash: string): Promise<{ locked: boolean; result: string | null }> {
    await this.ensureConnected();
    const [locked, result] = (await this.client.eval(
      "return {redis.call('EXISTS',KEYS[1]),redis.call('GET',KEYS[2]) or ''}",
      2,
      this.refreshLockKey(tokenHash),
      this.refreshResultKey(tokenHash),
    )) as [number, string];
    return { locked: locked === 1, result: result || null };
  }

  async acquireRefreshRotation(tokenHash: string, owner: string, ttlMs: number): Promise<boolean> {
    await this.ensureConnected();
    return (
      (await this.client.set(this.refreshLockKey(tokenHash), owner, 'PX', ttlMs, 'NX')) === 'OK'
    );
  }

  async stageRefreshRotation(
    tokenHash: string,
    owner: string,
    result: string,
    ttlMs: number,
    lockTtlMs: number,
  ): Promise<boolean> {
    await this.ensureConnected();
    const staged = await this.client.eval(
      "if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end redis.call('PEXPIRE',KEYS[1],ARGV[4]); redis.call('SET',KEYS[2],ARGV[2],'PX',ARGV[3]); return 1",
      2,
      this.refreshLockKey(tokenHash),
      this.refreshResultKey(tokenHash),
      owner,
      result,
      ttlMs,
      lockTtlMs,
    );
    return Number(staged) === 1;
  }

  async finishRefreshRotation(
    tokenHash: string,
    owner: string,
    discardResult: boolean,
    resultTtlMs: number,
  ): Promise<void> {
    await this.ensureConnected();
    await this.client.eval(
      "if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end if ARGV[2]=='1' then redis.call('DEL',KEYS[2]) else redis.call('PEXPIRE',KEYS[2],ARGV[3]) end redis.call('DEL',KEYS[1]); return 1",
      2,
      this.refreshLockKey(tokenHash),
      this.refreshResultKey(tokenHash),
      owner,
      discardResult ? '1' : '0',
      resultTtlMs,
    );
  }

  private async ensureConnected(): Promise<void> {
    if (this.client.status === 'wait' || this.client.status === 'end') await this.client.connect();
  }

  private refreshLockKey(tokenHash: string): string {
    return `auth:refresh-rotation:${tokenHash}:lock`;
  }

  private refreshResultKey(tokenHash: string): string {
    return `auth:refresh-rotation:${tokenHash}:result`;
  }
  onModuleDestroy(): void {
    if (this.client.status !== 'end') this.client.disconnect();
  }
}
