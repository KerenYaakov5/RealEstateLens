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

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // When DATABASE_URL is missing, the server uses an embedded PGlite database (development/tests).
  DATABASE_URL: optionalString(z.url()),
  PGLITE_DATA_DIR: z.string().default(path.join(serverRoot, '.pglite')),
  SEED_FILE_PATH: z.string().default(path.join(serverRoot, 'data', 'madlan-sample.xlsx')),
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
