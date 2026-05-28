import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import Login from './login';
import * as api from './api';
import CustomSplash from './components/branding/CustomSplash';
import { logPerf, perfNow } from '../utils/perf';
import {
  getCachedSession,
  hasCompletedOnboarding,
  hasSeenStartupSplash,
  hasValidCachedSession,
  markStartupSplashSeen,
  updateCachedUser,
} from '../services/offlineStorage';
import { captureAuthSessionContext, handleAuthFailureIfCurrent, isAuthSessionContextCurrent } from '../services/authSession';

type StartupState = 'hydrating' | 'guestSplash' | 'redirecting';

export default function Index() {
  const router = useRouter();
  const [startupState, setStartupState] = useState<StartupState>('hydrating');

  useEffect(() => {
    let mounted = true;

    async function checkStartupState() {
      const startedAt = perfNow();
      let outcome = 'unknown';
      let cachedSessionFound = false;
      let checkedRemoteUser = false;
      try {
        const seenStartupSplash = await hasSeenStartupSplash();
        const cached = await getCachedSession();
        const cachedSession = hasValidCachedSession(cached) ? cached : null;
        cachedSessionFound = Boolean(cachedSession);
        if (!mounted) return;

        if (cachedSession) {
          const context = await captureAuthSessionContext(cachedSession.token, cachedSession.user);
          let user = cachedSession.user;
          let completed = await hasCompletedOnboarding(user);

          if (!completed) {
            try {
              checkedRemoteUser = true;
              const remoteUser: any = await api.get('/me', cachedSession.token, 3500);
              if (!mounted || !(await isAuthSessionContextCurrent(context))) return;
              user = { ...(user || {}), ...(remoteUser || {}) };
              await updateCachedUser(user, cachedSession.token);
              completed = await hasCompletedOnboarding(user);
            } catch (err: any) {
              if (api.isAuthError(err)) {
                const cleared = await handleAuthFailureIfCurrent({ context });
                if (!mounted) return;
                if (!cleared) return;
                if (seenStartupSplash) {
                  outcome = 'auth_failed_login';
                  setStartupState('redirecting');
                  router.replace({ pathname: '/login' } as any);
                } else {
                  outcome = 'auth_failed_guest_splash';
                  setStartupState('guestSplash');
                }
                return;
              }
            }
          }

          if (!mounted || !(await isAuthSessionContextCurrent(context))) return;

          if (completed) {
            outcome = 'home';
            setStartupState('redirecting');
            router.replace({ pathname: '/home', params: { token: cachedSession.token, offline: '1' } } as any);
            return;
          }

          outcome = 'onboarding';
          setStartupState('redirecting');
          router.replace({
            pathname: '/onboarding',
            params: { token: cachedSession.token, name: user?.name || '' },
          } as any);
          return;
        }

        if (seenStartupSplash) {
          outcome = 'login';
          setStartupState('redirecting');
          router.replace({ pathname: '/login' } as any);
          return;
        }

        outcome = 'guest_splash';
        setStartupState('guestSplash');
      } catch {
        if (mounted) {
          outcome = 'error_login';
          setStartupState('redirecting');
          router.replace({ pathname: '/login' } as any);
        }
      } finally {
        logPerf('Startup auth/session hydration', startedAt, {
          outcome,
          cachedSessionFound,
          checkedRemoteUser,
        });
      }
    }

    void checkStartupState();

    return () => {
      mounted = false;
    };
  }, [router]);

  if (startupState === 'hydrating' || startupState === 'redirecting') {
    return <CustomSplash mode="logo" minimumMs={900} />;
  }

  if (startupState === 'guestSplash') {
    return (
      <CustomSplash
        mode="full"
        onFinish={async () => {
          await markStartupSplashSeen().catch(() => undefined);
          setStartupState('redirecting');
          router.replace({ pathname: '/login' } as any);
        }}
      />
    );
  }

  return <Login />;
}
