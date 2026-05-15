import {
  clearCachedSession,
  getCachedSession,
  getSessionUserIdentifier,
  hasCompletedOnboarding,
  markOnboardingComplete,
  saveCachedSession,
} from './offlineStorage';

let authSessionVersion = `${Date.now()}`;
const pendingControllers = new Set<AbortController>();

export type AuthSessionResult = {
  token: string;
  user: any;
  onboardingCompleted: boolean;
  sessionVersion: string;
};

export type AuthSessionContext = {
  sessionVersion: string;
  token?: string | null;
  user?: any | null;
};

export function getCurrentAuthSessionVersion() {
  return authSessionVersion;
}

export function beginNewAuthSession() {
  authSessionVersion = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return authSessionVersion;
}

export function invalidateAuthSession() {
  return beginNewAuthSession();
}

export function createTrackedAbortController() {
  const controller = new AbortController();
  pendingControllers.add(controller);
  return controller;
}

export function releaseTrackedAbortController(controller: AbortController) {
  pendingControllers.delete(controller);
}

export function abortAllPendingRequests() {
  pendingControllers.forEach((controller) => controller.abort());
  pendingControllers.clear();
}

export function resetAbortController() {
  pendingControllers.clear();
}

export function getCurrentAbortSignal() {
  const controller = createTrackedAbortController();
  return controller.signal;
}

export function isCurrentAuthSessionVersion(version?: string | null) {
  return Boolean(version) && version === authSessionVersion;
}

export const bumpAuthSessionVersion = beginNewAuthSession;
export const isAuthSessionCurrent = isCurrentAuthSessionVersion;

export async function getCurrentToken() {
  const session = await getCachedSession();
  return session?.token ?? null;
}

export async function captureAuthSessionContext(token?: string | null, user?: any | null): Promise<AuthSessionContext> {
  const cached = await getCachedSession();
  const capturedToken = token?.trim() || cached?.token || null;
  const capturedUser = user ?? (capturedToken && cached?.token === capturedToken ? cached?.user : null);
  return {
    sessionVersion: getCurrentAuthSessionVersion(),
    token: capturedToken,
    user: capturedUser,
  };
}

export async function isAuthSessionContextCurrent(context?: AuthSessionContext | null) {
  if (!context || !isCurrentAuthSessionVersion(context.sessionVersion)) return false;
  if (!context.token) return true;
  const cached = await getCachedSession();
  return cached?.token === context.token;
}

export async function clearCachedSessionSafely(context?: AuthSessionContext | null): Promise<boolean> {
  if (context && !(await isAuthSessionContextCurrent(context))) return false;
  invalidateAuthSession();
  abortAllPendingRequests();
  resetAbortController();
  await clearCachedSession();
  return true;
}

export async function handleAuthFailureIfCurrent({
  context,
  router,
}: {
  context?: AuthSessionContext | null;
  router?: any;
}) {
  const cleared = await clearCachedSessionSafely(context);
  if (cleared && router) {
    router.replace({ pathname: '/login' } as any);
  }
  return cleared;
}

export function normalizeAuthUser(response: any, fallbackUser: any = {}) {
  const user = { ...(fallbackUser || {}), ...(response?.user || {}) };
  const onboardingCompleted = Boolean(
    response?.onboarding_completed ??
    user?.onboarding_completed ??
    false
  );

  return {
    ...user,
    onboarding_completed: onboardingCompleted,
  };
}

export async function persistAuthResponse(response: any, fallbackUser: any = {}): Promise<AuthSessionResult> {
  const sessionVersion = beginNewAuthSession();
  const token = typeof response?.token === 'string' ? response.token.trim() : '';
  const user = normalizeAuthUser(response, fallbackUser);

  if (!token) {
    throw new Error('Authentication succeeded but no session token was returned.');
  }

  if (!getSessionUserIdentifier(user)) {
    throw new Error('Authentication succeeded but no user profile was returned.');
  }

  const onboardingCompleted = user.onboarding_completed === true || await hasCompletedOnboarding(user);
  const normalizedUser = { ...user, onboarding_completed: onboardingCompleted };

  await saveCachedSession({ token, user: normalizedUser });

  if (onboardingCompleted) {
    await markOnboardingComplete(normalizedUser);
  }

  return {
    token,
    user: normalizedUser,
    onboardingCompleted,
    sessionVersion,
  };
}

export function routeAfterAuth(router: any, session: AuthSessionResult, fallbackName = '') {
  if (session.onboardingCompleted) {
    router.replace({ pathname: '/home', params: { token: session.token } } as any);
    return;
  }

  router.replace({
    pathname: '/onboarding',
    params: { token: session.token, name: session.user?.name || fallbackName },
  } as any);
}
