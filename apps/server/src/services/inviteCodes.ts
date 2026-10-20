import { createHash, randomInt } from 'node:crypto';
import type { InviteCodeStatus } from '@rel/shared';

// No 0/O, 1/I/L: codes are read aloud and typed by hand.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LENGTH = 10;
const HINT_LENGTH = 4;

/** "K7MQX-4TRB9": 31^10 ≈ 8·10^14 possibilities – guessing is hopeless at a few tries per hour. */
export function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < LENGTH; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

/** What the user typed, in the stored form: upper case, no spaces or dashes. */
export function normalizeInviteCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Codes are stored only as a hash, like passwords (no salt needed: they are random). */
export function hashInviteCode(code: string): string {
  return createHash('sha256').update(normalizeInviteCode(code)).digest('hex');
}

export function inviteCodeHint(code: string): string {
  return normalizeInviteCode(code).slice(-HINT_LENGTH);
}

export function inviteCodeStatus(
  row: { maxUses: number; usedCount: number; expiresAt: Date | null; disabledAt: Date | null },
  now: Date,
): InviteCodeStatus {
  if (row.disabledAt !== null) {
    return 'disabled';
  }
  if (row.expiresAt !== null && row.expiresAt <= now) {
    return 'expired';
  }
  return row.usedCount >= row.maxUses ? 'used-up' : 'active';
}
