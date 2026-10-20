import {
  logQuerySchema,
  updateUserSchema,
  type AdminUserDto,
  type LogCategory,
  type LogPageDto,
  type RegistrationCodeDto,
} from '@rel/shared';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../errors/AppError.js';
import type {
  RegistrationCodeRecord,
  RegistrationCodeRepository,
} from '../repositories/registrationCode.repository.js';
import { israelDay } from '../lib/time.js';
import type { AppLogRepository } from '../repositories/appLog.repository.js';
import type { UserRepository } from '../repositories/user.repository.js';
import type { AuthService } from '../services/auth.service.js';
import {
  generateRegistrationCode,
  hashRegistrationCode,
  registrationCodeHint,
  type RegistrationCodeVault,
} from '../services/registrationCode.js';

const idParamsSchema = z.object({ id: z.coerce.number().int().positive() });

/** The registration code and users – for administrators only (see requireAdmin). */
export class AdminController {
  constructor(
    private readonly registrationCodes: RegistrationCodeRepository,
    private readonly vault: RegistrationCodeVault,
    private readonly users: UserRepository,
    private readonly auth: AuthService,
    private readonly logs: AppLogRepository,
  ) {}

  private toDto(row: RegistrationCodeRecord): RegistrationCodeDto | null {
    const code = this.vault.decrypt(row.codeEncrypted);
    return code === null
      ? null
      : { code, createdAt: row.createdAt.toISOString(), usedCount: row.usedCount };
  }

  /** GET /registration-code – 204 when registration is closed (no active code). */
  getRegistrationCode: RequestHandler = async (_req, res) => {
    const row = await this.registrationCodes.active();
    const dto = row === undefined ? null : this.toDto(row);
    if (dto === null) {
      // No code, or one encrypted with an old server secret – either way it must be replaced.
      res.status(204).end();
      return;
    }
    res.json(dto);
  };

  /** POST /registration-code – a new code; the previous one stops working at once. */
  replaceRegistrationCode: RequestHandler = async (req, res) => {
    if (req.user === undefined) {
      throw AppError.unauthorized();
    }
    const code = generateRegistrationCode();
    const row = await this.registrationCodes.replace({
      codeHash: hashRegistrationCode(code),
      codeEncrypted: this.vault.encrypt(code),
      hint: registrationCodeHint(code),
      createdByUserId: req.user.id,
    });
    req.log.info({ registrationCodeId: row.id }, 'Registration code replaced');
    res.status(201).json({
      code,
      createdAt: row.createdAt.toISOString(),
      usedCount: row.usedCount,
    } satisfies RegistrationCodeDto);
  };

  /** DELETE /registration-code – nobody can register until a new code is created. */
  closeRegistration: RequestHandler = async (req, res) => {
    await this.registrationCodes.disable();
    req.log.info('Registration closed');
    res.status(204).end();
  };

  /** GET /logs – newest first, filtered; `nextBefore` pages to older entries. */
  listLogs: RequestHandler = async (req, res) => {
    const query = logQuerySchema.parse(req.query);
    const rows = await this.logs.find({
      ...(query.level === 'all'
        ? {}
        : { levels: query.level === 'warn' ? ['warn', 'error', 'fatal'] : ['error', 'fatal'] }),
      ...(query.category === undefined ? {} : { category: query.category }),
      ...(query.q === undefined ? {} : { text: query.q }),
      ...(query.hours === undefined
        ? {}
        : { since: new Date(Date.now() - query.hours * 3_600_000) }),
      ...(query.before === undefined ? {} : { beforeId: query.before }),
      limit: query.pageSize,
    });
    const page: LogPageDto = {
      data: rows.map((row) => {
        return {
          id: row.id,
          time: row.createdAt.toISOString(),
          level: row.level,
          category: row.category as LogCategory,
          message: row.message,
          requestId: row.requestId,
          userEmail: row.userEmail,
          method: row.method,
          path: row.path,
          status: row.status,
          durationMs: row.durationMs,
          details: row.details,
        };
      }),
      nextBefore: rows.length === query.pageSize ? (rows.at(-1)?.id ?? null) : null,
    };
    res.json(page);
  };

  /** GET /users */
  listUsers: RequestHandler = async (_req, res) => {
    const rows = await this.users.listForAdmin(israelDay(Date.now()));
    res.json({
      data: rows.map((row): AdminUserDto => {
        return {
          id: row.id,
          email: row.email,
          isActive: row.isActive,
          isAdmin: this.auth.toAuthUser(row).isAdmin,
          createdAt: row.createdAt.toISOString(),
          lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
          registeredWithCode: row.registeredWithCode,
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
