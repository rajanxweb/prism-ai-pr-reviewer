import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { Writable } from 'node:stream';
import { createLogger, requestIdMiddleware } from '../logger.js';
import express, { type Request, type Response } from 'express';

describe('Pino Logger and Request-ID Middleware', () => {
  it('automatically redacts authorization headers, tokens, and keys in logs', () => {
    const logChunks: string[] = [];
    const destination = new Writable({
      write(chunk: Buffer | string, _encoding, callback) {
        logChunks.push(chunk.toString());
        callback();
      },
    });

    const testLogger = createLogger({
      level: 'info',
      stream: destination,
    });

    testLogger.info(
      {
        authorization: 'Bearer super-secret-token',
        token: 'secret-token-value',
        key: 'secret-api-key',
        apiKey: 'another-key',
        password: 'password123',
        nested: {
          token: 'nested-token',
          key: 'nested-key',
          authorization: 'Bearer nested',
        },
      },
      'User authenticated',
    );

    const logOutput = logChunks.join('\n');
    expect(logOutput).not.toContain('super-secret-token');
    expect(logOutput).not.toContain('secret-token-value');
    expect(logOutput).not.toContain('secret-api-key');
    expect(logOutput).not.toContain('another-key');
    expect(logOutput).not.toContain('password123');
    expect(logOutput).not.toContain('nested-token');
    expect(logOutput).not.toContain('nested-key');
    expect(logOutput).toContain('[REDACTED]');
  });

  it('assigns and propagates request-id header and req.id', async () => {
    const app = express();
    app.use(requestIdMiddleware);
    app.get('/test-req-id', (req: Request, res: Response) => {
      res.json({ id: req.id });
    });

    const resGenerated = await request(app).get('/test-req-id');
    expect(resGenerated.status).toBe(200);
    expect(resGenerated.headers['x-request-id']).toBeDefined();
    expect(resGenerated.body.id).toBe(resGenerated.headers['x-request-id']);

    const customId = 'client-provided-request-id-999';
    const resProvided = await request(app).get('/test-req-id').set('x-request-id', customId);

    expect(resProvided.status).toBe(200);
    expect(resProvided.headers['x-request-id']).toBe(customId);
    expect(resProvided.body.id).toBe(customId);
  });
});
