import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// `KEY=` in a .env file yields an empty string; treat it as "not set".
const optionalString = <T extends z.ZodType>(schema: T) => {
  return z.preprocess((value) => {
    return value === '' ? undefined : value;
  }, schema.optional());
};

// Used only outside production so local development works without configuration.
const DEV_ONLY_JWT_SECRET = 'dev-only-secret-not-for-production-use-0123456789';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    // When DATABASE_URL is missing, the server uses an embedded PGlite database (development/tests).
    DATABASE_URL: optionalString(z.url()),
    PGLITE_DATA_DIR: z.string().default(path.join(serverRoot, '.pglite')),
    SEED_FILE_PATH: z.string().default(path.join(serverRoot, 'data', 'madlan-sample.xlsx')),
    // Built web client served by this server (skipped when the folder has no index.html).
    WEB_DIST_PATH: z.string().default(path.join(serverRoot, '..', 'web', 'dist')),

    // Sessions
    JWT_SECRET: optionalString(z.string().min(32)),
    SESSION_TTL_HOURS: z.coerce.number().int().positive().default(168),

    // Rate limits (tunable without a deploy)
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
    LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    LOGIN_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),

    // Static reference data: minimum months between checks for a newer published file
    LOCALITIES_CHECK_MONTHS: z.coerce.number().int().positive().default(6),

    // Personal recommendations (LLM). LLM_ENABLED=false is the kill switch; a provider without
    // an API key is skipped. Model ids are configurable because providers retire them.
    LLM_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => {
        return value === 'true';
      }),
    GEMINI_API_KEY: optionalString(z.string().min(1)),
    GEMINI_MODEL: z.string().min(1).default('gemini-3.1-flash-lite'),
    OPENAI_API_KEY: optionalString(z.string().min(1)),
    OPENAI_MODEL: z.string().min(1).default('gpt-5.4-nano'),
    LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
    LLM_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(300),
    AI_DAILY_QUOTA: z.coerce.number().int().nonnegative().default(20),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === 'production' && value.JWT_SECRET === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message: 'required in production (at least 32 characters)',
      });
    }
  })
  .transform((value) => {
    return { ...value, JWT_SECRET: value.JWT_SECRET ?? DEV_ONLY_JWT_SECRET };
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => {
        return `${issue.path.join('.')}: ${issue.message}`;
      })
      .join('; ');
    throw new Error(`Invalid environment configuration – ${issues}`);
  }
  return result.data;
}

export const env = parseEnv(process.env);
