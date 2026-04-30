import { Stack, SplashScreen } from 'expo-router';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import Toast from 'react-native-toast-message';
import { notificationManager } from '../services/notificationManager';
import { notificationService } from '../services/notificationService';
import { LogBox } from 'react-native';

// Suppress Expo Go push notification warning in UI
LogBox.ignoreLogs([
  /expo-notifications: android push notifications.*removed from expo go/i,
  /expo go.*push notifications.*sdk 53/i,
  /expo go.*remote notifications/i,
]);

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    ...Ionicons.font,
  });
  const [readyTimeout, setReadyTimeout] = useState(false);

  useEffect(() => {
    console.log('RootLayout mounted');

    const timer = setTimeout(() => {
      console.log('RootLayout font timeout fallback triggered');
      setReadyTimeout(true);
    }, 3000);

    // Initialize notification manager
    notificationManager.initialize();
    notificationService.ensureAndroidChannels();

    // Cleanup on unmount
    return () => {
      clearTimeout(timer);
      notificationManager.cleanup();
    };
  }, []);

  useEffect(() => {
    console.log('RootLayout state:', {
      fontsLoaded,
      fontError: fontError?.message,
      readyTimeout,
    });

    if (fontsLoaded || fontError || readyTimeout) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError, readyTimeout]);

  if (!fontsLoaded && !fontError && !readyTimeout) {
    return null;
  }

  console.log('Rendering Stack');

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <Toast />
    </>
  );
}
