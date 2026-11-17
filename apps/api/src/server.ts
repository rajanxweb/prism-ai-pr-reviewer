import { app, logger } from './app.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

app.listen(PORT, () => {
  logger.info(`API server started on port ${PORT}`);
});
