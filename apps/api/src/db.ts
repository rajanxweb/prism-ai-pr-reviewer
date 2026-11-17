import mongoose, { type ConnectOptions } from 'mongoose';
import type { Logger } from 'pino';
import { logger as defaultLogger } from './logger.js';

export interface ConnectWithRetryOptions {
  uri?: string;
  mongooseOptions?: ConnectOptions;
  maxRetries?: number;
  retryDelayMs?: number;
  connectFn?: (uri: string, options?: ConnectOptions) => Promise<unknown>;
  logger?: Logger;
}

export const connectWithRetry = async (options: ConnectWithRetryOptions = {}): Promise<unknown> => {
  const uri = options.uri ?? process.env.MONGODB_URI ?? 'mongodb://localhost:27017/prism';
  const maxRetries = options.maxRetries ?? 5;
  const baseDelay = options.retryDelayMs ?? 1000;
  const log = options.logger ?? defaultLogger;
  const connect = options.connectFn ?? ((u, opts) => mongoose.connect(u, opts));

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log.info(`Attempting MongoDB connection (attempt ${attempt}/${maxRetries})...`);
      const connection = await connect(uri, options.mongooseOptions);
      log.info('Successfully connected to MongoDB');
      return connection;
    } catch (error) {
      lastError = error;
      log.warn(
        { err: error, attempt, maxRetries },
        `MongoDB connection attempt ${attempt} failed.`,
      );

      if (attempt < maxRetries) {
        const delay = baseDelay * attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  const failureMessage = `Failed to connect to MongoDB after ${maxRetries} retries`;
  log.error({ err: lastError }, failureMessage);
  throw new Error(failureMessage);
};

export const disconnectMongo = async (): Promise<void> => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
};

export const isMongoConnected = async (): Promise<boolean> => {
  return mongoose.connection.readyState === 1;
};
