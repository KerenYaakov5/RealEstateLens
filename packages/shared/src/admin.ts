import { z } from 'zod';

export const MIN_PASSWORD_LENGTH = 10;

/** POST /users – registration with the registration code. */
export const registrationSchema = z.object({
  email: z.string().trim().pipe(z.email().max(254)),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(128),
  registrationCode: z.string().trim().min(1).max(40),
});

export type RegistrationRequest = z.infer<typeof registrationSchema>;

/** PATCH /users/:id (admin). */
export const updateUserSchema = z.object({ isActive: z.boolean() });

/**
 * GET/POST /registration-code (admin): the one code that lets people register. Replacing it
 * (POST) stops the old one at once; DELETE stops registration until a new code is created.
 */
export interface RegistrationCodeDto {
  code: string;
  createdAt: string;
  /** How many people registered with this code. */
  usedCount: number;
}

export interface AdminUserDto {
  id: number;
  email: string;
  isActive: boolean;
  isAdmin: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  /** Last characters of the registration code used (null: added by the administrator). */
  registeredWithCode: string | null;
  /** Personal recommendations used today. */
  aiRecommendationsToday: number;
}
