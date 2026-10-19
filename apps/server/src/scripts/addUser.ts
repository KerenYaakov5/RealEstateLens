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
