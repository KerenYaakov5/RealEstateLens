import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline';

const MIN_PASSWORD_LENGTH = 10;

/** Reads a line without echoing it, so a password never shows on screen or in shell history. */
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

/** The email from the command line, or exits with the usage line. */
export function emailArgument(usage: string): string {
  const email = process.argv[2];
  if (email === undefined || !email.includes('@')) {
    stdout.write(`Usage: ${usage}\n`);
    process.exit(1);
  }
  return email;
}

/** Asks for a new password twice (hidden); exits on a short or mismatched password. */
export async function promptNewPassword(): Promise<string> {
  const password = await promptHidden('Password: ');
  if (password.length < MIN_PASSWORD_LENGTH) {
    stdout.write(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.\n`);
    process.exit(1);
  }
  const confirmation = await promptHidden('Repeat password: ');
  if (confirmation !== password) {
    stdout.write('Passwords do not match.\n');
    process.exit(1);
  }
  return password;
}
