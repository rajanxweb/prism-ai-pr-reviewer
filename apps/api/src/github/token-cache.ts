import type { Clock } from './clock.js';
import { SystemClock } from './clock.js';

export interface CachedToken {
  token: string;
  expiresAt: Date;
}

export interface InstallationTokenCache {
  get(installationId: number): Promise<string | null> | string | null;
  set(installationId: number, token: string, expiresAt: Date): Promise<void> | void;
  clear(): Promise<void> | void;
}

export class InMemoryInstallationTokenCache implements InstallationTokenCache {
  private cache = new Map<number, CachedToken>();

  constructor(
    private clock: Clock = new SystemClock(),
    private bufferMs: number = 5 * 60 * 1000, // 5 minutes before expiry
  ) {}

  get(installationId: number): string | null {
    const entry = this.cache.get(installationId);
    if (!entry) {
      return null;
    }

    const now = this.clock.now().getTime();
    const expiresAt = entry.expiresAt.getTime();

    // If current time is past (expiresAt - buffer), treat as expired
    if (now >= expiresAt - this.bufferMs) {
      this.cache.delete(installationId);
      return null;
    }

    return entry.token;
  }

  set(installationId: number, token: string, expiresAt: Date): void {
    this.cache.set(installationId, {
      token,
      expiresAt: new Date(expiresAt),
    });
  }

  clear(): void {
    this.cache.clear();
  }
}
