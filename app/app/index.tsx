import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Login from './login';
import CustomSplash from './components/branding/CustomSplash';
import { getCachedSession, hasCompletedOnboarding, hasValidCachedSession } from '../services/offlineStorage';

type StartupState = 'checking' | 'guestSplash' | 'guestLogin' | 'cachedNeedsOnboarding' | 'redirecting';

export default function Index() {
  const router = useRouter();
  const [startupState, setStartupState] = useState<StartupState>('checking');

  useEffect(() => {
    let mounted = true;

    async function checkStartupState() {
      try {
        const cached = await getCachedSession();
        if (!mounted) return;

        if (hasValidCachedSession(cached)) {
          const completed = await hasCompletedOnboarding(cached.user);
          if (!mounted) return;

          if (completed) {
            setStartupState('redirecting');
            router.replace({ pathname: '/home', params: { token: cached.token, offline: '1' } } as any);
            return;
          }

          setStartupState('cachedNeedsOnboarding');
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

  const handleFinish = useCallback(async () => {
    try {
      const cached = await getCachedSession();
      if (hasValidCachedSession(cached)) {
        router.replace({
          pathname: '/onboarding',
          params: { token: cached.token, name: cached.user?.name || '' },
        } as any);
        return;
      }
    } catch {
      // Fall through to login if local startup state cannot be read.
    }
    setStartupState('guestLogin');
  }, [router]);

  if (startupState === 'checking' || startupState === 'redirecting') {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#2563EB" />
      </View>
    );
  }

  if (startupState === 'guestSplash' || startupState === 'cachedNeedsOnboarding') {
    return <CustomSplash onFinish={handleFinish} minimumMs={5000} />;
  }

  return <Login />;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
});
