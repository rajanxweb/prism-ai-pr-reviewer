import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

export class ConfigError extends Error {
  readonly missingVariables: string[];

  constructor(message: string, missingVariables: string[] = []) {
    super(message);
    this.name = 'ConfigError';
    this.missingVariables = missingVariables;
  }
}

export const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MONGODB_URI: z
    .string({ required_error: 'MONGODB_URI is required' })
    .min(1, 'MONGODB_URI is required'),
  REDIS_URL: z.string({ required_error: 'REDIS_URL is required' }).min(1, 'REDIS_URL is required'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  BODY_LIMIT: z.string().default('1mb'),
  RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .positive()
    .default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().positive().default(100),
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_PRIVATE_KEY_PATH: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  JWT_SECRET: z.string().optional(),
});

export type Config = z.infer<typeof envSchema>;

export const validateConfig = (rawEnv: Record<string, unknown> = process.env): Config => {
  const result = envSchema.safeParse(rawEnv);

  if (!result.success) {
    const missingVars: string[] = [];
    const formattedIssues = result.error.issues.map((issue) => {
      const field = issue.path.join('.') || 'root';
      if (issue.code === 'invalid_type' && issue.received === 'undefined') {
        missingVars.push(field);
      } else if (issue.message.toLowerCase().includes('required')) {
        missingVars.push(field);
      }
      return `  - ${field}: ${issue.message}`;
    });

    const uniqueMissing = Array.from(new Set(missingVars));
    const errorMessage = `Config validation failed:\n${formattedIssues.join('\n')}`;
    throw new ConfigError(errorMessage, uniqueMissing);
  }

  return result.data;
};

let cachedConfig: Config | null = null;

export const loadConfig = (rawEnv?: Record<string, unknown>): Config => {
  if (rawEnv) {
    return validateConfig(rawEnv);
  }

  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const rootEnvPath = path.resolve(currentDir, '../../../.env');
    if (fs.existsSync(rootEnvPath)) {
      dotenv.config({ path: rootEnvPath });
    }
  } catch {
    // ignore if path cannot be resolved
  }

  dotenv.config();
  cachedConfig = validateConfig(process.env);
  return cachedConfig;
};
