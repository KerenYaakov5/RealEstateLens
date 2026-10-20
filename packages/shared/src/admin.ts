import { z } from 'zod';

export const MIN_PASSWORD_LENGTH = 10;

/** POST /users – registration with an invite code. */
export const registrationSchema = z.object({
  email: z.string().trim().pipe(z.email().max(254)),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(128),
  inviteCode: z.string().trim().min(1).max(40),
});

export type RegistrationRequest = z.infer<typeof registrationSchema>;

/** POST /invite-codes (admin). */
export const createInviteCodeSchema = z.object({
  /** Who it is for, e.g. "דנה – משפחה". */
  label: z.string().trim().min(1).max(80),
  maxUses: z.number().int().min(1).max(1000),
  /** Omitted = never expires. */
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

export type CreateInviteCodeRequest = z.infer<typeof createInviteCodeSchema>;

/** PATCH /invite-codes/:id (admin). */
export const updateInviteCodeSchema = z.object({ disabled: z.boolean() });

/** PATCH /users/:id (admin). */
export const updateUserSchema = z.object({ isActive: z.boolean() });

export type InviteCodeStatus = 'active' | 'used-up' | 'expired' | 'disabled';

export interface InviteCodeDto {
  id: number;
  label: string;
  /** The last characters of the code – the code itself is stored only as a hash. */
  hint: string;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  createdAt: string;
  status: InviteCodeStatus;
}

/** Returned once, when the code is created: the only time the full code is visible. */
export interface CreatedInviteCodeDto extends InviteCodeDto {
  code: string;
}

export interface AdminUserDto {
  id: number;
  email: string;
  isActive: boolean;
  isAdmin: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  /** Label of the invite code the user registered with (null: added by the administrator). */
  invitedWith: string | null;
  /** Personal recommendations used today. */
  aiRecommendationsToday: number;
}
