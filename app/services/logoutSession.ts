import * as api from '../app/api';
import {
  abortAllPendingRequests,
  captureAuthSessionContext,
  invalidateAuthSession,
  resetAbortController,
} from './authSession';
import { clearCachedSession, getCachedSession } from './offlineStorage';
import { clearPendingSyncActionsForUser } from './syncQueue';

type LogoutOptions = {
  reason?: string;
  router?: any;
  token?: string | null;
  user?: any | null;
  onLocalStateCleared?: () => void;
};

export async function performLocalLogout({
  reason,
  router,
  token,
  user,
  onLocalStateCleared,
}: LogoutOptions = {}) {
  const session = await getCachedSession();
  const logoutToken = token?.trim() || session?.token || null;
  const logoutUser = user ?? session?.user ?? null;
  const context = await captureAuthSessionContext(logoutToken, logoutUser);

  abortAllPendingRequests();
  invalidateAuthSession();
  resetAbortController();
  await clearPendingSyncActionsForUser(logoutUser);
  await clearCachedSession();
  onLocalStateCleared?.();

  if (router) {
    router.replace({ pathname: '/login' } as any);
  }

  if (logoutToken) {
    api.post('/logout', { reason: reason || 'local_logout' }, logoutToken, 4000).catch((err) => {
      if (!api.isNetworkError(err) && !api.isStaleSessionError(err)) {
        console.log('Logout API warning:', err);
      }
    });
  }

  return context;
}
