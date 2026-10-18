/**
 * An expected, client-facing error. `code` is a stable English identifier for code;
 * `message` is shown to the user and is therefore in Hebrew.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }

  static unauthorized(message = 'נדרשת התחברות'): AppError {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static notFound(message = 'המשאב המבוקש לא נמצא'): AppError {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static tooManyRequests(message = 'יותר מדי בקשות, נסו שוב מאוחר יותר'): AppError {
    return new AppError(429, 'TOO_MANY_REQUESTS', message);
  }
}
