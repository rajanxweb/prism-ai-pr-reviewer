import type { Server } from 'node:http';
import type { Logger } from 'pino';
import { disconnectMongo } from './db.js';
import { disconnectRedis } from './redis.js';
import { logger as defaultLogger } from './logger.js';

export interface CloseableServer {
  close: (callback?: (err?: Error) => void) => unknown;
}

export interface GracefulShutdownOptions {
  server?: CloseableServer | Server;
  disconnectMongo?: () => Promise<void>;
  disconnectRedis?: () => Promise<unknown>;
  timeoutMs?: number;
  logger?: Logger;
  onExit?: (code: number) => void;
}

export const gracefulShutdown = async (options: GracefulShutdownOptions = {}): Promise<void> => {
  const log = options.logger ?? defaultLogger;
  const timeoutMs = options.timeoutMs ?? 10000;
  const closeMongo = options.disconnectMongo ?? disconnectMongo;
  const closeRedis = options.disconnectRedis ?? disconnectRedis;

  log.info('Graceful shutdown initiated. Closing services...');

  const timeoutPromise = new Promise<void>((_, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Graceful shutdown timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    timer.unref?.();
  });

  const shutdownTasks = async () => {
    // 1. Close HTTP server
    if (options.server) {
      await new Promise<void>((resolve, reject) => {
        options.server!.close((err) => {
          if (err) {
            log.error({ err }, 'Error closing HTTP server');
            reject(err);
          } else {
            log.info('HTTP server closed');
            resolve();
          }
        });
      });
    }

    // 2. Disconnect Mongo
    try {
      await closeMongo();
      log.info('MongoDB disconnected cleanly');
    } catch (err) {
      log.error({ err }, 'Error disconnecting MongoDB');
    }

    // 3. Disconnect Redis
    try {
      await closeRedis();
      log.info('Redis disconnected cleanly');
    } catch (err) {
      log.error({ err }, 'Error disconnecting Redis');
    }
  };

  try {
    await Promise.race([shutdownTasks(), timeoutPromise]);
    log.info('Graceful shutdown completed successfully');
  } catch (err) {
    log.error({ err }, 'Error during graceful shutdown');
  }
};

export const registerProcessShutdownHandlers = (options: GracefulShutdownOptions): void => {
  const handleSignal = async (signal: string) => {
    (options.logger ?? defaultLogger).info(`Received ${signal}. Initiating graceful shutdown...`);
    await gracefulShutdown(options);
    if (options.onExit) {
      options.onExit(0);
    } else if (process.env.NODE_ENV !== 'test') {
      process.exit(0);
    }
  };

  process.once('SIGTERM', () => void handleSignal('SIGTERM'));
  process.once('SIGINT', () => void handleSignal('SIGINT'));
};
