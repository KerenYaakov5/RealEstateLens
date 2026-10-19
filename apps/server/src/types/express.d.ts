import type { AuthUser } from '../services/auth.service.js';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by requireAuth for authenticated requests. */
    user?: AuthUser;
  }
}
