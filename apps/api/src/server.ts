import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { connectWithRetry, disconnectMongo, isMongoConnected } from './db.js';
import { createRedisClient, disconnectRedis, isRedisConnected } from './redis.js';
import { createApp } from './app.js';
import { registerProcessShutdownHandlers } from './shutdown.js';

export const startServer = async () => {
  try {
    const config = loadConfig();

    logger.info(`Starting API server in ${config.NODE_ENV} mode...`);

    // Connect to database with retry
    await connectWithRetry({
      uri: config.MONGODB_URI,
      logger,
    });

    // Initialize Redis
    const redis = createRedisClient(config.REDIS_URL, undefined, logger);

    // Create Express application
    const app = createApp({
      config,
      logger,
      checkMongo: isMongoConnected,
      checkRedis: () => isRedisConnected(redis),
    });

    // Start HTTP listener
    const server = app.listen(config.PORT, () => {
      logger.info(`API server started and listening on port ${config.PORT}`);
    });

    // Setup graceful shutdown on SIGTERM / SIGINT
    registerProcessShutdownHandlers({
      server,
      disconnectMongo,
      disconnectRedis: () => disconnectRedis(redis),
      logger,
    });

    return server;
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start API server');
    process.exit(1);
  }
};

if (process.env.NODE_ENV !== 'test') {
  void startServer();
}
