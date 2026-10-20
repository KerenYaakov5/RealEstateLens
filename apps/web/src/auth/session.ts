import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, deleteResource, getJson, postJson } from '../api/client';

export interface SessionUser {
  email: string;
  /** May manage invite codes and users. */
  isAdmin?: boolean;
  /** Personal recommendations left today (missing right after login until /users/me). */
  aiQuotaLeft?: number;
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

export interface Registration extends Credentials {
  inviteCode: string;
}

/** Registration with an invite code; the new user is logged in right away. */
export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (registration: Registration) => {
      return postJson<{ user: SessionUser }>('/users', registration);
    },
    onSuccess: (result) => {
      queryClient.setQueryData(SESSION_KEY, result.user);
      void queryClient.invalidateQueries({ queryKey: SESSION_KEY });
    },
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentials: Credentials) => {
      return postJson<{ user: SessionUser }>('/sessions', credentials);
    },
    onSuccess: (result) => {
      queryClient.setQueryData(SESSION_KEY, result.user);
      // The login answer has no AI quota; /users/me does.
      void queryClient.invalidateQueries({ queryKey: SESSION_KEY });
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
      // The session query itself must stay in the cache – the app is subscribed to it, and
      // clearing it would hide the null from the screen (it kept showing the data).
      queryClient.setQueryData(SESSION_KEY, null);
      queryClient.removeQueries({
        predicate: (query) => {
          return query.queryKey[0] !== SESSION_KEY[0];
        },
      });
    },
  });
}
