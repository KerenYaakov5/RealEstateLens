import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, deleteResource, getJson, postJson } from '../api/client';

export interface SessionUser {
  email: string;
}

export const SESSION_KEY = ['session'] as const;

/** The logged-in user, or null when there is no valid session (401 is an answer, not an error). */
async function fetchSession(): Promise<SessionUser | null> {
  try {
    return await getJson<SessionUser>('/users/me');
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      return null;
    }
    throw err;
  }
}

export function useSession() {
  return useQuery({ queryKey: SESSION_KEY, queryFn: fetchSession, staleTime: Infinity });
}

export interface Credentials {
  email: string;
  password: string;
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentials: Credentials) => {
      return postJson<{ user: SessionUser }>('/sessions', credentials);
    },
    onSuccess: (result) => {
      queryClient.setQueryData(SESSION_KEY, result.user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => {
      return deleteResource('/sessions/current');
    },
    onSettled: () => {
      // Whatever the server answered, the user asked to leave: drop the session and cached data.
      queryClient.clear();
      queryClient.setQueryData(SESSION_KEY, null);
    },
  });
}
