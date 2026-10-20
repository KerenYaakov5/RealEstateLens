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

export const LOG_CATEGORIES = ['request', 'ai', 'auth', 'admin', 'system'] as const;
export type LogCategory = (typeof LOG_CATEGORIES)[number];

/** GET /logs (admin): newest first; page with `before` = the last id of the previous page. */
export const logQuerySchema = z.object({
  /** warn = warnings and errors; error = errors only. */
  level: z.enum(['all', 'warn', 'error']).default('all'),
  category: z.enum(LOG_CATEGORIES).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  /** Only the last N hours. */
  hours: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 90)
    .optional(),
  before: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export interface LogEntryDto {
  id: number;
  time: string;
  level: string;
  category: LogCategory;
  message: string;
  requestId: string | null;
  userEmail: string | null;
  method: string | null;
  path: string | null;
  status: number | null;
  durationMs: number | null;
  details: Record<string, unknown> | null;
}

export interface LogPageDto {
  data: LogEntryDto[];
  /** Pass as `before` for the next (older) page; null when there is nothing older. */
  nextBefore: number | null;
}
