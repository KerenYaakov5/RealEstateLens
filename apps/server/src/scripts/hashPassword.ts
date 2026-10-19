import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline';
import { normalizeEmail } from '../repositories/user.repository.js';
import { hashPassword } from '../services/auth.service.js';

// `npm run hash-password -- user@example.com`
// Prompts for the password without echoing it (so it never lands in shell history), then prints
// an INSERT statement to paste into the Supabase SQL editor. It does not touch the database.

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout, terminal: true });
    const output = rl as unknown as { _writeToOutput: (text: string) => void };
    let prompted = false;
    output._writeToOutput = (text: string) => {
      if (!prompted) {
        stdout.write(text);
        prompted = true;
      }
    };
    rl.question(question, (answer) => {
      rl.close();
      stdout.write('\n');
      resolve(answer);
    });
  });
}

const email = process.argv[2];
if (email === undefined || !email.includes('@')) {
  stdout.write('Usage: npm run hash-password -- user@example.com\n');
  process.exit(1);
}

const password = await promptHidden('Password: ');
if (password.length < 10) {
  stdout.write('Password must be at least 10 characters.\n');
  process.exit(1);
}
const confirmation = await promptHidden('Repeat password: ');
if (confirmation !== password) {
  stdout.write('Passwords do not match.\n');
  process.exit(1);
}

const passwordHash = await hashPassword(password);
const sqlEmail = normalizeEmail(email).replace(/'/g, "''");
stdout.write(
  `\n-- Paste into the SQL editor:\nINSERT INTO users (email, password_hash) VALUES ('${sqlEmail}', '${passwordHash}');\n`,
);
