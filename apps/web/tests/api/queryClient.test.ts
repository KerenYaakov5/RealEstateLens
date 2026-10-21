import { describe, expect, it } from 'vitest';
import { ApiError } from '../../src/api/client';
import { createQueryClient } from '../../src/api/queryClient';
import { SESSION_KEY } from '../../src/auth/session';

async function runFailingMutation(error: ApiError) {
  const queryClient = createQueryClient();
  queryClient.setQueryData(SESSION_KEY, { email: 'dana@example.com' });
  const mutation = queryClient.getMutationCache().build(queryClient, {
    mutationFn: () => Promise.reject(error),
  });
  await mutation.execute(undefined).catch(() => undefined);
  return queryClient.getQueryData(SESSION_KEY);
}

describe('createQueryClient', () => {
  it('returns to the login screen when a mutation finds the session expired', async () => {
    await expect(
      runFailingMutation(new ApiError(401, 'UNAUTHORIZED', 'פג תוקף ההתחברות')),
    ).resolves.toBeNull();
  });

  it('keeps the session on any other failure', async () => {
    await expect(
      runFailingMutation(new ApiError(503, 'SERVICE_UNAVAILABLE', 'השירות אינו זמין')),
    ).resolves.toEqual({ email: 'dana@example.com' });
  });
});
