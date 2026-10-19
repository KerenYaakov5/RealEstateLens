import { stdout } from 'node:process';
import { normalizeEmail } from '../repositories/user.repository.js';
import { hashPassword } from '../services/auth.service.js';
import { emailArgument, promptNewPassword } from './passwordPrompt.js';

// `npm run hash-password -- user@example.com`
// Prints an INSERT statement to paste into the Supabase SQL editor. It does not touch the
// database (use `npm run user:add` to add a user to the configured database directly).

const email = emailArgument('npm run hash-password -- user@example.com');
const passwordHash = await hashPassword(await promptNewPassword());
const sqlEmail = normalizeEmail(email).replace(/'/g, "''");
stdout.write(
  `\n-- Paste into the SQL editor:\nINSERT INTO users (email, password_hash) VALUES ('${sqlEmail}', '${passwordHash}');\n`,
);
