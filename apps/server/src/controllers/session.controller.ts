import type { CookieOptions, RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../errors/AppError.js';
import { SESSION_COOKIE } from '../middleware/requireAuth.js';
import type { AuthService } from '../services/auth.service.js';

const loginSchema = z.object({
  email: z.string().trim().pipe(z.email().max(254)),
  password: z.string().min(1).max(200),
});

export interface SessionControllerOptions {
  secureCookies: boolean;
}

export class SessionController {
  constructor(
    private readonly auth: AuthService,
    private readonly options: SessionControllerOptions,
  ) {}

  private cookieOptions(expires?: Date): CookieOptions {
    return {
      httpOnly: true,
      secure: this.options.secureCookies,
      sameSite: 'lax',
      path: '/',
      ...(expires === undefined ? {} : { expires }),
    };
  }

  /** POST /sessions – log in. */
  create: RequestHandler = async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest('יש להזין אימייל וסיסמה תקינים');
    }
    const user = await this.auth.verifyCredentials(parsed.data.email, parsed.data.password);
    if (user === null) {
      // One message for every failure, so it does not reveal whether the email exists.
      throw AppError.unauthorized('אימייל או סיסמה שגויים');
    }
    const session = await this.auth.issueToken(user);
    res.cookie(SESSION_COOKIE, session.token, this.cookieOptions(session.expiresAt));
    req.log.info({ userId: user.id }, 'User logged in');
    res.status(201).json({ user: { email: user.email }, expiresAt: session.expiresAt });
  };

  /** DELETE /sessions/current – log out (idempotent). */
  destroy: RequestHandler = (_req, res) => {
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
    res.status(204).end();
  };
}
