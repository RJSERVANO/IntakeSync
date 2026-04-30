import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect } from 'react';
import Toast from 'react-native-toast-message';
import { notificationManager } from '../services/notificationManager';
import { notificationService } from '../services/notificationService';
import { initializeOfflineSync } from '../services/offlineSyncManager';
import { LogBox } from 'react-native';

// Suppress Expo Go push notification warning in UI
LogBox.ignoreLogs([
  /expo-notifications: android push notifications.*removed from expo go/i,
  /expo go.*push notifications.*sdk 53/i,
  /expo go.*remote notifications/i,
]);

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const router = useRouter();
  const ioniconFontName = Object.keys(Ionicons.font)[0] || 'Ionicons';

  const [fontsLoaded, fontError] = useFonts({
    [ioniconFontName]: require('../assets/fonts/Ionicons.ttf'),
  });

  useEffect(() => {
    if (__DEV__) {
      console.log('RootLayout fonts:', {
        ioniconFontName,
        fontsLoaded,
        fontError: fontError?.message,
      });
    }

    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError, ioniconFontName]);

  useEffect(() => {
    try {
      initializeOfflineSync();
      notificationManager.initialize();
      notificationService.ensureAndroidChannels();
      notificationService.requestPermissions();
      initializeOfflineSync();
    } catch (error) {
      console.log('Notification setup error:', error);
    }

    // Cleanup on unmount
    return () => {
      try {
        notificationManager.cleanup();
      } catch (error) {
        console.log('Notification cleanup error:', error);
      }
    };
  }, []);

  useEffect(() => {
    return notificationService.setupNotificationHandlers(undefined, (response) => {
      const data: any = response.notification.request.content.data || {};
      if (data.type === 'medication') {
        router.push('/components/pages/medication/Medication' as any);
      } else if (data.type === 'hydration') {
        router.push('/components/pages/hydration/Hydration' as any);
      } else {
        router.push('/components/pages/notification/Activity' as any);
      }
    });
  }, [router]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <Toast />
    </>
  );
}
