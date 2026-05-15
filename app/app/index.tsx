import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import Login from './login';
import * as api from './api';
import CustomSplash from './components/branding/CustomSplash';
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
      try {
        const seenStartupSplash = await hasSeenStartupSplash();
        const cached = await getCachedSession();
        if (!mounted) return;

        if (hasValidCachedSession(cached)) {
          const context = await captureAuthSessionContext(cached.token, cached.user);
          let user = cached.user;
          let completed = await hasCompletedOnboarding(user);

          if (!completed) {
            try {
              const remoteUser: any = await api.get('/me', cached.token, 3500);
              if (!mounted || !(await isAuthSessionContextCurrent(context))) return;
              user = { ...(user || {}), ...(remoteUser || {}) };
              await updateCachedUser(user, cached.token);
              completed = await hasCompletedOnboarding(user);
            } catch (err: any) {
              if (api.isAuthError(err)) {
                const cleared = await handleAuthFailureIfCurrent({ context });
                if (!mounted) return;
                if (!cleared) return;
                if (seenStartupSplash) {
                  setStartupState('redirecting');
                  router.replace({ pathname: '/login' } as any);
                } else {
                  setStartupState('guestSplash');
                }
                return;
              }
            }
          }

          if (!mounted || !(await isAuthSessionContextCurrent(context))) return;

          if (completed) {
            setStartupState('redirecting');
            router.replace({ pathname: '/home', params: { token: cached.token, offline: '1' } } as any);
            return;
          }

          setStartupState('redirecting');
          router.replace({
            pathname: '/onboarding',
            params: { token: cached.token, name: user?.name || '' },
          } as any);
          return;
        }

        if (seenStartupSplash) {
          setStartupState('redirecting');
          router.replace({ pathname: '/login' } as any);
          return;
        }

        setStartupState('guestSplash');
      } catch {
        if (mounted) {
          setStartupState('redirecting');
          router.replace({ pathname: '/login' } as any);
        }
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
