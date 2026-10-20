import {
  createInviteCodeSchema,
  updateInviteCodeSchema,
  updateUserSchema,
  type AdminUserDto,
  type CreatedInviteCodeDto,
  type InviteCodeDto,
} from '@rel/shared';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../errors/AppError.js';
import type {
  InviteCodeRecord,
  InviteCodeRepository,
} from '../repositories/inviteCode.repository.js';
import type { UserRepository } from '../repositories/user.repository.js';
import type { AuthService } from '../services/auth.service.js';
import {
  generateInviteCode,
  hashInviteCode,
  inviteCodeHint,
  inviteCodeStatus,
} from '../services/inviteCodes.js';
import { israelDay } from '../services/recommendation/recommendation.service.js';

const idParamsSchema = z.object({ id: z.coerce.number().int().positive() });

function toInviteCodeDto(row: InviteCodeRecord, now: Date): InviteCodeDto {
  return {
    id: row.id,
    label: row.label,
    hint: row.hint,
    maxUses: row.maxUses,
    usedCount: row.usedCount,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    status: inviteCodeStatus(row, now),
  };
}

/** Invite codes and users – for administrators only (see requireAdmin). */
export class AdminController {
  constructor(
    private readonly inviteCodes: InviteCodeRepository,
    private readonly users: UserRepository,
    private readonly auth: AuthService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** GET /invite-codes */
  listInviteCodes: RequestHandler = async (_req, res) => {
    const now = this.now();
    const rows = await this.inviteCodes.list();
    res.json({
      data: rows.map((row) => {
        return toInviteCodeDto(row, now);
      }),
    });
  };

  /** POST /invite-codes – the response is the only place the full code ever appears. */
  createInviteCode: RequestHandler = async (req, res) => {
    const body = createInviteCodeSchema.parse(req.body);
    const now = this.now();
    const code = generateInviteCode();
    const row = await this.inviteCodes.create({
      codeHash: hashInviteCode(code),
      hint: inviteCodeHint(code),
      label: body.label,
      maxUses: body.maxUses,
      expiresAt:
        body.expiresInDays === undefined
          ? null
          : new Date(now.getTime() + body.expiresInDays * 86_400_000),
      createdByUserId: req.user?.id ?? 0,
    });
    req.log.info({ inviteCodeId: row.id, maxUses: row.maxUses }, 'Invite code created');
    const created: CreatedInviteCodeDto = { ...toInviteCodeDto(row, now), code };
    res.status(201).json(created);
  };

  /** PATCH /invite-codes/:id – disable or re-enable. */
  updateInviteCode: RequestHandler = async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const body = updateInviteCodeSchema.parse(req.body);
    const row = await this.inviteCodes.setDisabled(id, body.disabled);
    if (row === undefined) {
      throw AppError.notFound('קוד ההזמנה לא נמצא');
    }
    res.json(toInviteCodeDto(row, this.now()));
  };

  /** GET /users */
  listUsers: RequestHandler = async (_req, res) => {
    const rows = await this.users.listForAdmin(israelDay(this.now().getTime()));
    res.json({
      data: rows.map((row): AdminUserDto => {
        return {
          id: row.id,
          email: row.email,
          isActive: row.isActive,
          isAdmin: this.auth.toAuthUser(row).isAdmin,
          createdAt: row.createdAt.toISOString(),
          lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
          invitedWith: row.invitedWith,
          aiRecommendationsToday: row.aiRecommendationsToday,
        };
      }),
    });
  };

  /** PATCH /users/:id – block or unblock (takes effect on the user's next request). */
  updateUser: RequestHandler = async (req, res) => {
    const { id } = idParamsSchema.parse(req.params);
    const body = updateUserSchema.parse(req.body);
    if (id === req.user?.id && !body.isActive) {
      throw AppError.badRequest('אי אפשר לחסום את עצמך');
    }
    const row = await this.users.setActive(id, body.isActive);
    if (row === undefined) {
      throw AppError.notFound('המשתמש לא נמצא');
    }
    this.auth.forget(id);
    req.log.info({ userId: id, isActive: body.isActive }, 'User access changed');
    res.json({ id: row.id, email: row.email, isActive: row.isActive });
  };
}
