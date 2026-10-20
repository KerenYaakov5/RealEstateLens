import { Router } from 'express';
import type { AdminController } from '../controllers/admin.controller.js';
import { AppError } from '../errors/AppError.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import type { CompromiseRecommendationService } from '../services/recommendation/recommendation.service.js';

export function createUserRouter(
  recommendations: CompromiseRecommendationService,
  admin: AdminController,
): Router {
  const router = Router();

  // GET /users/me – the logged-in user and how many personal recommendations are left today.
  router.get('/me', async (req, res) => {
    if (req.user === undefined) {
      throw AppError.unauthorized();
    }
    res.json({
      email: req.user.email,
      isAdmin: req.user.isAdmin,
      aiQuotaLeft: await recommendations.quotaLeft(req.user.id),
    });
  });

  // Administrators only.
  router.get('/', requireAdmin, admin.listUsers);
  router.patch('/:id', requireAdmin, admin.updateUser);

  return router;
}

export function createInviteCodeRouter(admin: AdminController): Router {
  const router = Router();
  router.use(requireAdmin);
  router.get('/', admin.listInviteCodes);
  router.post('/', admin.createInviteCode);
  router.patch('/:id', admin.updateInviteCode);
  return router;
}
