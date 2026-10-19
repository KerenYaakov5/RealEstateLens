/** An error response from our API, with the Hebrew message the server wrote for the user. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const NETWORK_MESSAGE = 'אין חיבור לשרת. בדקו את החיבור לאינטרנט ונסו שוב.';
const UNKNOWN_MESSAGE = 'אירעה שגיאה. נסו שוב בעוד רגע.';

interface ErrorBody {
  error?: { code?: string; message?: string };
}

async function toApiError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => {
    return {};
  })) as ErrorBody;
  return new ApiError(
    response.status,
    body.error?.code ?? 'UNKNOWN',
    body.error?.message ?? UNKNOWN_MESSAGE,
  );
}

async function send(path: string, init: RequestInit = {}): Promise<Response> {
  try {
    // Same origin in development (Vite proxy) and production (Express serves the app), so the
    // httpOnly session cookie is sent automatically.
    return await fetch(`/api/v1${path}`, {
      ...init,
      credentials: 'same-origin',
      headers: { accept: 'application/json', ...init.headers },
    });
  } catch {
    throw new ApiError(0, 'NETWORK', NETWORK_MESSAGE);
  }
}

/** GET a JSON resource. Returns null for 204 No Content (nothing to show). */
export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T | null> {
  const response = await send(path, signal === undefined ? {} : { signal });
  if (response.status === 204) {
    return null;
  }
  if (!response.ok) {
    throw await toApiError(response);
  }
  return (await response.json()) as T;
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await send(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw await toApiError(response);
  }
  return (await response.json()) as T;
}

export async function deleteResource(path: string): Promise<void> {
  const response = await send(path, { method: 'DELETE' });
  if (!response.ok && response.status !== 204) {
    throw await toApiError(response);
  }
}
