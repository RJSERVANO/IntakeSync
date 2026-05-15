import {
  getSessionUserIdentifier,
  hasCompletedOnboarding,
  markOnboardingComplete,
  saveCachedSession,
} from './offlineStorage';

export type AuthSessionResult = {
  token: string;
  user: any;
  onboardingCompleted: boolean;
};

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
