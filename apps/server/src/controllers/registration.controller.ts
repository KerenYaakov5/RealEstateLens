import { registrationSchema } from '@rel/shared';
import type { RequestHandler } from 'express';
import type { RegistrationService } from '../services/registration.service.js';
import type { SessionController } from './session.controller.js';

export class RegistrationController {
  constructor(
    private readonly registrations: RegistrationService,
    private readonly sessions: SessionController,
  ) {}

  /** POST /users – register with the registration code; the new user is logged in at once. */
  create: RequestHandler = async (req, res) => {
    const body = registrationSchema.parse(req.body);
    const user = await this.registrations.register(body);
    await this.sessions.startSession(res, user);
    req.log.info({ userId: user.id }, 'User registered');
    res.status(201).json({ user: { email: user.email, isAdmin: user.isAdmin } });
  };
}
