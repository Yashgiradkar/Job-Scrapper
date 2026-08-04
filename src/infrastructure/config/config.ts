import dotenv from 'dotenv';
import { z } from 'zod';
import { ConfigError } from '../../domain/errors/app-error.js';

dotenv.config();

const configSchema = z.object({
  nodeEnv: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  port: z.coerce.number().int().positive().default(3000),
  database: z.object({
    url: z
      .string()
      .min(1, 'DATABASE_URL is required')
      .startsWith('postgresql://', 'DATABASE_URL must be a PostgreSQL connection string'),
  }),
  playwright: z.object({
    headless: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    timeoutMs: z.coerce.number().int().positive().default(30_000),
  }),
  logging: z.object({
    level: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .default('info'),
  }),
  matching: z.object({
    roleWeight: z.coerce.number().min(0).default(0.35),
    skillsWeight: z.coerce.number().min(0).default(0.35),
    experienceWeight: z.coerce.number().min(0).default(0.15),
    locationWeight: z.coerce.number().min(0).default(0.15),
  }),
});

export type Config = z.infer<typeof configSchema>;

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse({
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    database: {
      url: env.DATABASE_URL,
    },
    playwright: {
      headless: env.PLAYWRIGHT_HEADLESS,
      timeoutMs: env.PLAYWRIGHT_TIMEOUT_MS,
    },
    logging: {
      level: env.LOG_LEVEL,
    },
    matching: {
      roleWeight: env.MATCH_ROLE_WEIGHT,
      skillsWeight: env.MATCH_SKILLS_WEIGHT,
      experienceWeight: env.MATCH_EXPERIENCE_WEIGHT,
      locationWeight: env.MATCH_LOCATION_WEIGHT,
    },
  });

  if (!result.success) {
    throw new ConfigError(
      `Invalid configuration: ${formatZodError(result.error)}`,
      result.error,
    );
  }

  return result.data;
}

let cachedConfig: Config | undefined;

export function getConfig(): Config {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}

export function resetConfig(): void {
  cachedConfig = undefined;
}
