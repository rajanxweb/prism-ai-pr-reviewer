import { Redis, type RedisOptions } from 'ioredis';
import type { Logger } from 'pino';
import { logger as defaultLogger } from './logger.js';

let defaultRedisClient: Redis | null = null;

export const createRedisClient = (
  url?: string,
  options?: RedisOptions,
  logger: Logger = defaultLogger,
): Redis => {
  const redisUrl = url ?? process.env.REDIS_URL ?? 'redis://localhost:6379';
  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
    ...options,
  });

  client.on('error', (err) => {
    logger.error({ err }, 'Redis connection error');
  });

  return client;
};

export const getRedisClient = (): Redis => {
  if (!defaultRedisClient) {
    defaultRedisClient = createRedisClient();
  }
  return defaultRedisClient;
};

export const isRedisConnected = async (client?: Redis): Promise<boolean> => {
  const redis = client ?? defaultRedisClient;
  if (!redis) {
    return false;
  }

  try {
    const pingResponse = await redis.ping();
    return pingResponse === 'PONG';
  } catch {
    return false;
  }
};

export const disconnectRedis = async (client?: Redis): Promise<void> => {
  const redis = client ?? defaultRedisClient;
  if (redis && redis.status !== 'end') {
    await redis.quit();
  }
};
