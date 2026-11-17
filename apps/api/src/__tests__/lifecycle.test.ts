import { describe, expect, it, vi } from 'vitest';
import { connectWithRetry } from '../db.js';
import { gracefulShutdown, type CloseableServer } from '../shutdown.js';

describe('Database Connection and Graceful Shutdown', () => {
  it('retries connection when connection fails initially and succeeds', async () => {
    let attempts = 0;
    const fakeConnect = vi.fn().mockImplementation(async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('Connection refused');
      }
      return { connection: { readyState: 1 } };
    });

    const result = await connectWithRetry({
      connectFn: fakeConnect,
      maxRetries: 3,
      retryDelayMs: 5,
    });

    expect(attempts).toBe(3);
    expect(result).toBeDefined();
  });

  it('throws error when connection fails after reaching maxRetries', async () => {
    const fakeConnect = vi.fn().mockRejectedValue(new Error('Network error'));

    await expect(
      connectWithRetry({
        connectFn: fakeConnect,
        maxRetries: 2,
        retryDelayMs: 5,
      }),
    ).rejects.toThrow('Failed to connect to MongoDB after 2 retries');
  });

  it('gracefulShutdown cleanly closes server, mongo, and redis', async () => {
    const fakeServer: CloseableServer = {
      close: vi.fn((cb?: (err?: Error) => void) => {
        if (cb) cb();
      }),
    };
    const fakeMongoDisconnect = vi.fn().mockResolvedValue(undefined);
    const fakeRedisQuit = vi.fn().mockResolvedValue('OK');

    await gracefulShutdown({
      server: fakeServer,
      disconnectMongo: fakeMongoDisconnect,
      disconnectRedis: fakeRedisQuit,
      timeoutMs: 1000,
    });

    expect(fakeServer.close).toHaveBeenCalled();
    expect(fakeMongoDisconnect).toHaveBeenCalled();
    expect(fakeRedisQuit).toHaveBeenCalled();
  });
});
