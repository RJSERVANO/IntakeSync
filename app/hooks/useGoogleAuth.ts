import { useCallback } from 'react';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as api from '../app/api';

const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
const isExpoGo =
  (Constants as any).appOwnership === 'expo' ||
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const useNativeGoogleSignIn = Platform.OS === 'android' && !isExpoGo;
let nativeGoogleSignInConfigured = false;

export const googleRedirectUri = 'native-google-signin';

function configureNativeGoogleSignIn() {
  if (nativeGoogleSignInConfigured) return;

  GoogleSignin.configure({
    webClientId: googleWebClientId,
    scopes: ['profile', 'email'],
    offlineAccess: false,
  });
  nativeGoogleSignInConfigured = true;
}

if (__DEV__) {
  console.log('[GoogleAuth] platform:', Platform.OS);
  console.log('[GoogleAuth] mode:', useNativeGoogleSignIn ? 'native' : 'unsupported-native-only');
  console.log('[GoogleAuth] redirect URI:', 'not used');
  console.log('[GoogleAuth] web client ID configured:', Boolean(googleWebClientId));
  console.log('[GoogleAuth] backend endpoint:', '/oauth/google');
}

export function useGoogleAuth() {
  const signInWithGoogle = useCallback(async () => {
    if (!useNativeGoogleSignIn) {
      throw new Error('Google Sign-In for this build requires the Android APK or a development build.');
    }

    if (!googleWebClientId) {
      throw new Error('Google web client ID is missing.');
    }

    configureNativeGoogleSignIn();
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const result = await GoogleSignin.signIn();

    if (result.type === 'cancelled') {
      return null;
    }

    const idToken = result.data.idToken;
    if (__DEV__) {
      console.log('[GoogleAuth] native idToken exists:', Boolean(idToken));
      console.log('[GoogleAuth] backend endpoint called:', '/oauth/google');
    }

    if (!idToken) {
      throw new Error('Google did not return an ID token. Please try again.');
    }

    return api.post('/oauth/google', { id_token: idToken });
  }, []);

  return { signInWithGoogle, googleRedirectUri };
}
