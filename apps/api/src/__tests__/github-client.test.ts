import { describe, expect, it, vi } from 'vitest';
import type { Octokit } from 'octokit';
import { InMemoryInstallationTokenCache } from '../github/token-cache.js';
import { OctokitGithubClient } from '../github/client.js';
import type { Clock } from '../github/clock.js';

class FakeClock implements Clock {
  private currentTime: Date;

  constructor(initialTime: Date = new Date('2026-01-01T00:00:00Z')) {
    this.currentTime = new Date(initialTime);
  }

  now(): Date {
    return new Date(this.currentTime);
  }

  advanceSeconds(seconds: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + seconds * 1000);
  }

  advanceMinutes(minutes: number): void {
    this.advanceSeconds(minutes * 60);
  }

  setTime(time: Date): void {
    this.currentTime = new Date(time);
  }
}

describe('GitHub App Client & Token Cache', () => {
  describe('InMemoryInstallationTokenCache with FakeClock', () => {
    it('returns cached token when within valid lifetime', () => {
      const clock = new FakeClock(new Date('2026-01-01T12:00:00Z'));
      const bufferMs = 5 * 60 * 1000; // 5 minutes buffer
      const cache = new InMemoryInstallationTokenCache(clock, bufferMs);

      // Token expires in 60 minutes (13:00:00Z)
      const expiresAt = new Date('2026-01-01T13:00:00Z');
      cache.set(12345, 'ghs_token_initial', expiresAt);

      // At 12:00:00Z, token is valid
      expect(cache.get(12345)).toBe('ghs_token_initial');

      // Advance 50 minutes (12:50:00Z) - Still valid (10m until expiry, buffer is 5m)
      clock.advanceMinutes(50);
      expect(cache.get(12345)).toBe('ghs_token_initial');
    });

    it('considers token expired shortly before expiry (inside buffer window)', () => {
      const clock = new FakeClock(new Date('2026-01-01T12:00:00Z'));
      const bufferMs = 5 * 60 * 1000; // 5 minutes buffer
      const cache = new InMemoryInstallationTokenCache(clock, bufferMs);

      const expiresAt = new Date('2026-01-01T13:00:00Z');
      cache.set(12345, 'ghs_token_expiring', expiresAt);

      // Advance 55 minutes (12:55:00Z) - Exactly at expiresAt - bufferMs
      clock.advanceMinutes(55);
      expect(cache.get(12345)).toBeNull();

      // Advance 56 minutes (12:56:00Z) - Past the buffer window
      clock.advanceMinutes(1);
      expect(cache.get(12345)).toBeNull();
    });

    it('clears all cached tokens on clear()', () => {
      const clock = new FakeClock();
      const cache = new InMemoryInstallationTokenCache(clock);
      cache.set(1, 't1', new Date('2099-01-01'));
      cache.set(2, 't2', new Date('2099-01-01'));

      expect(cache.get(1)).toBe('t1');
      expect(cache.get(2)).toBe('t2');

      cache.clear();

      expect(cache.get(1)).toBeNull();
      expect(cache.get(2)).toBeNull();
    });
  });

  describe('OctokitGithubClient', () => {
    it('fetches a new token on first call and caches it until expiry', async () => {
      const clock = new FakeClock(new Date('2026-01-01T10:00:00Z'));
      const bufferMs = 5 * 60 * 1000;
      const cache = new InMemoryInstallationTokenCache(clock, bufferMs);

      let fetchCount = 0;
      const tokenFetcher = vi.fn().mockImplementation(async (installationId: number) => {
        fetchCount++;
        return {
          token: `ghs_token_${installationId}_v${fetchCount}`,
          expiresAt: new Date(clock.now().getTime() + 60 * 60 * 1000).toISOString(), // 1 hour from now
        };
      });

      const client = new OctokitGithubClient({
        appId: '123456',
        privateKey: 'dummy-key',
        clock,
        cache,
        tokenFetcher,
      });

      // Call 1: fetches token
      const token1 = await client.getInstallationToken(999);
      expect(token1).toBe('ghs_token_999_v1');
      expect(tokenFetcher).toHaveBeenCalledTimes(1);

      // Call 2 at 10:30:00Z: returns cached token without re-fetching
      clock.advanceMinutes(30);
      const token2 = await client.getInstallationToken(999);
      expect(token2).toBe('ghs_token_999_v1');
      expect(tokenFetcher).toHaveBeenCalledTimes(1);

      // Advance clock to 10:56:00Z (within buffer window, 4 minutes before expiry):
      // Token should now be refreshed!
      clock.advanceMinutes(26);
      const token3 = await client.getInstallationToken(999);
      expect(token3).toBe('ghs_token_999_v2');
      expect(tokenFetcher).toHaveBeenCalledTimes(2);
    });

    it('returns an Octokit instance authenticated with the installation token', async () => {
      const clock = new FakeClock();
      const mockOctokit = { rest: {} } as unknown as Octokit;
      const octokitFactory = vi.fn().mockReturnValue(mockOctokit);

      const client = new OctokitGithubClient({
        appId: '123456',
        privateKey: 'dummy-key',
        clock,
        tokenFetcher: async () => ({
          token: 'ghs_installation_secret_token',
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        }),
        octokitFactory,
      });

      const octokitInstance = await client.getInstallationOctokit(888);
      expect(octokitInstance).toBe(mockOctokit);
      expect(octokitFactory).toHaveBeenCalledWith('ghs_installation_secret_token');
    });
  });
});
