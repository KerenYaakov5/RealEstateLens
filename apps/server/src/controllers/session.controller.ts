import type { CookieOptions, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../errors/AppError.js';
import { SESSION_COOKIE } from '../middleware/requireAuth.js';
import type { AuthService, AuthUser } from '../services/auth.service.js';

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

  /** Issues a session cookie for the user – after login or registration. */
  async startSession(res: Response, user: AuthUser): Promise<void> {
    const session = await this.auth.issueToken(user);
    res.cookie(SESSION_COOKIE, session.token, this.cookieOptions(session.expiresAt));
  }

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
    await this.startSession(res, user);
    req.log.info({ userId: user.id }, 'User logged in');
    res.status(201).json({ user: { email: user.email, isAdmin: user.isAdmin } });
  };

  /** DELETE /sessions/current – log out (idempotent). */
  destroy: RequestHandler = (req, res) => {
    req.log.info('User logged out');
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
    res.status(204).end();
  };
}
