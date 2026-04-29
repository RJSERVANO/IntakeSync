import React, { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import Login from './login';
import CustomSplash from './components/branding/CustomSplash';
import { getCachedSession, hasValidCachedSession } from '../services/offlineStorage';

export default function Index() {
  const router = useRouter();
  const [showSplash, setShowSplash] = useState(true);
  const [checkingSession, setCheckingSession] = useState(false);

  const handleFinish = useCallback(async () => {
    setCheckingSession(true);
    let routedToHome = false;
    try {
      const cached = await getCachedSession();
      if (hasValidCachedSession(cached)) {
        routedToHome = true;
        router.replace({ pathname: '/home', params: { token: cached.token, offline: '1' } } as any);
        return;
      }
    } finally {
      if (!routedToHome) {
        setCheckingSession(false);
        setShowSplash(false);
      }
    }
  }, [router]);

  if (showSplash || checkingSession) {
    return <CustomSplash onFinish={handleFinish} minimumMs={5000} />;
  }

  return <Login />;
}
