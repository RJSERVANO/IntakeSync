import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useRef } from 'react';
import Toast from 'react-native-toast-message';
import {
  bootstrapNotificationSchedules,
  clearLastNotificationResponseIfSupported,
  getLastNotificationResponse,
  getNotificationResponseKey,
  hasConsumedNotificationResponse,
  markNotificationResponseConsumed,
  notificationService,
  recordNotificationResponse,
} from '../services/notificationService';
import { initializeOfflineSync } from '../services/offlineSyncManager';
import { LogBox, Text, TextInput } from 'react-native';
import { FONT_SCALE } from '../utils/fontScaling';
import { FontScaleProvider } from './accessibility/FontScaleProvider';
import { getCachedSession } from '../services/offlineStorage';
import { processSyncQueue } from '../services/syncQueue';

const ScalableText = Text as typeof Text & { defaultProps?: { maxFontSizeMultiplier?: number } };
const ScalableTextInput = TextInput as typeof TextInput & { defaultProps?: { maxFontSizeMultiplier?: number } };

ScalableText.defaultProps = {
  ...ScalableText.defaultProps,
  maxFontSizeMultiplier: FONT_SCALE.body,
};

ScalableTextInput.defaultProps = {
  ...ScalableTextInput.defaultProps,
  maxFontSizeMultiplier: FONT_SCALE.input,
};

// Suppress Expo Go push notification warning in UI
LogBox.ignoreLogs([
  /expo-notifications: android push notifications.*removed from expo go/i,
  /expo go.*push notifications.*sdk 5\d/i,
  /expo go.*remote notifications/i,
]);

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const router = useRouter();
  const handledNotificationResponses = useRef<Set<string>>(new Set());
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
      void bootstrapNotificationSchedules();
    } catch (error) {
      console.log('Notification setup error:', error);
    }
  }, []);

  const handleNotificationNavigation = useCallback(async (response: any) => {
    const handledKey = getNotificationResponseKey(response);
    if (!handledKey) return;
    if (handledNotificationResponses.current.has(handledKey)) return;
    if (await hasConsumedNotificationResponse(handledKey)) return;
    handledNotificationResponses.current.add(handledKey);
    await markNotificationResponseConsumed(handledKey);
    void clearLastNotificationResponseIfSupported();

    const data: any = await recordNotificationResponse(response);
    const session = await getCachedSession();
    if (session?.token) {
      void bootstrapNotificationSchedules();
      void processSyncQueue(session.token);
    } else {
      router.push('/login' as any);
      return;
    }

    if (data?.type === 'medication') {
      router.push({ pathname: '/components/pages/medication/Medication', params: { token: session.token } } as any);
    } else if (data?.type === 'hydration') {
      router.push({ pathname: '/components/pages/hydration/Hydration', params: { token: session.token } } as any);
    } else {
      router.push({ pathname: '/components/pages/notification/Activity', params: { token: session.token } } as any);
    }
  }, [router]);

  useEffect(() => {
    return notificationService.setupNotificationHandlers(undefined, (response) => {
      void handleNotificationNavigation(response);
    });
  }, [handleNotificationNavigation]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const response = await getLastNotificationResponse();
      if (!cancelled && response) await handleNotificationNavigation(response);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [handleNotificationNavigation]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <>
      <FontScaleProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </FontScaleProvider>
      <Toast />
    </>
  );
}
