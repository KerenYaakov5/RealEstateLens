import { Router } from 'express';
import { AppError } from '../errors/AppError.js';

export function createUserRouter(): Router {
  const router = Router();

  // GET /users/me – the logged-in user (AI quota is added with the LLM milestone).
  router.get('/me', (req, res) => {
    if (req.user === undefined) {
      throw AppError.unauthorized();
    }
    res.json({ email: req.user.email });
  });

  return router;
}
