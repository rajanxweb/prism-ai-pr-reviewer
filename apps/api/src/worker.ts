import { logger } from './app.js';

export const startWorker = (): void => {
  logger.info('Queue worker initialized');
};

if (process.env.NODE_ENV !== 'test') {
  startWorker();
}
