import { stdout } from 'node:process';
import { env } from '../config/env.js';
import { createDatabase } from '../db/client.js';
import { logger } from '../lib/logger.js';
import { UserRepository } from '../repositories/user.repository.js';
import { hashPassword } from '../services/auth.service.js';
import { emailArgument, promptNewPassword } from './passwordPrompt.js';

// `npm run user:add -- user@example.com`
// Adds a user to the configured database: the local PGlite database when DATABASE_URL is not
// set, otherwise that database. With PGlite, stop the server first (one process at a time).

/**
 * PGlite is single-process: a running server keeps its own copy in memory, so it would not see a
 * user added now, and its writes can overwrite ours. Refuse while a local server is up.
 */
async function localServerIsRunning(): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${env.PORT}/api/v1/health`, {
      signal: AbortSignal.timeout(1000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

if (env.DATABASE_URL === undefined && (await localServerIsRunning())) {
  stdout.write(
    `A local server is running on port ${env.PORT}. Stop it first (Ctrl+C), then run this again –\n` +
      'the local database can be used by one process at a time.\n',
  );
  process.exit(1);
}

const email = emailArgument('npm run user:add -- user@example.com');
const password = await promptNewPassword();

const database = createDatabase({
  databaseUrl: env.DATABASE_URL,
  pgliteDataDir: env.PGLITE_DATA_DIR,
  logger,
});
try {
  await database.migrate();
  const users = new UserRepository(database.db);
  if ((await users.findByEmail(email)) !== undefined) {
    stdout.write(`A user with this email already exists (${database.kind}).\n`);
    process.exitCode = 1;
  } else {
    const user = await users.create(email, await hashPassword(password));
    stdout.write(`Added ${user.email} to the ${database.kind} database.\n`);
  }
} finally {
  await database.close();
}
