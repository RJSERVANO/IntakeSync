import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import Login from './login';
import * as api from './api';
import CustomSplash from './components/branding/CustomSplash';
import {
  clearCachedSession,
  getCachedSession,
  hasCompletedOnboarding,
  hasValidCachedSession,
  updateCachedUser,
} from '../services/offlineStorage';

type StartupState = 'hydrating' | 'guestSplash' | 'guestLogin' | 'redirecting';

export default function Index() {
  const router = useRouter();
  const [startupState, setStartupState] = useState<StartupState>('hydrating');

  useEffect(() => {
    let mounted = true;

    async function checkStartupState() {
      try {
        const cached = await getCachedSession();
        if (!mounted) return;

        if (hasValidCachedSession(cached)) {
          let user = cached.user;
          let completed = await hasCompletedOnboarding(user);

          if (!completed) {
            try {
              const remoteUser: any = await api.get('/me', cached.token, 3500);
              if (!mounted) return;
              user = { ...(user || {}), ...(remoteUser || {}) };
              await updateCachedUser(user, cached.token);
              completed = await hasCompletedOnboarding(user);
            } catch (err: any) {
              if (api.isAuthError(err)) {
                await clearCachedSession();
                if (mounted) setStartupState('guestSplash');
                return;
              }
            }
          }

          if (!mounted) return;

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

        setStartupState('guestSplash');
      } catch {
        if (mounted) setStartupState('guestSplash');
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
    return <CustomSplash mode="full" onFinish={() => setStartupState('guestLogin')} />;
  }

  return <Login />;
}
