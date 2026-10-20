import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
  randomInt,
} from 'node:crypto';

// No 0/O, 1/I/L: the code is read aloud and typed by hand.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LENGTH = 12;
const HINT_LENGTH = 4;

/** "K7MQ-X4TR-B9PZ": 31^12 ≈ 8·10^17 possibilities – hopeless to guess at 10 tries an hour. */
export function generateRegistrationCode(): string {
  let code = '';
  for (let i = 0; i < LENGTH; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code.match(/.{4}/g)?.join('-') ?? code;
}

/** What the user typed, in the stored form: upper case, no spaces or dashes. */
export function normalizeRegistrationCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** For lookup. No salt needed: the code itself is random. */
export function hashRegistrationCode(code: string): string {
  return createHash('sha256').update(normalizeRegistrationCode(code)).digest('hex');
}

export function registrationCodeHint(code: string): string {
  return normalizeRegistrationCode(code).slice(-HINT_LENGTH);
}

/**
 * Keeps the code encrypted at rest (AES-256-GCM) so the administrator can see it again, with a
 * key derived from the server secret: a database copy alone does not reveal the code.
 */
export class RegistrationCodeVault {
  private readonly key: Buffer;

  constructor(serverSecret: string) {
    this.key = Buffer.from(hkdfSync('sha256', serverSecret, 'rel', 'registration-code', 32));
  }

  encrypt(code: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const body = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
  }

  /** null when the payload was made with another secret (the code must then be replaced). */
  decrypt(payload: string): string | null {
    try {
      const data = Buffer.from(payload, 'base64');
      const decipher = createDecipheriv('aes-256-gcm', this.key, data.subarray(0, 12));
      decipher.setAuthTag(data.subarray(12, 28));
      return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
    } catch {
      return null;
    }
  }
}
