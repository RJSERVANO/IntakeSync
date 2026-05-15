import { useCallback } from 'react';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import * as api from '../app/api';

const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
const googleAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '';
const isExpoGo =
  (Constants as any).appOwnership === 'expo' ||
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const useNativeGoogleSignIn = Platform.OS === 'android' && !isExpoGo;
let nativeGoogleSignInConfigured = false;
let googleSignInInFlight = false;

export const googleRedirectUri = 'native-google-signin';

type GoogleAuthErrorType =
  | 'google_cancelled'
  | 'google_no_id_token'
  | 'google_in_progress'
  | 'google_backend_rejected'
  | 'google_backend_request_failed'
  | 'google_server_error';

function logGoogleAuth(stage: string, details: Record<string, unknown> = {}) {
  console.log('[GoogleAuth]', stage, details);
}

function makeGoogleAuthError(type: GoogleAuthErrorType, message: string, source?: any) {
  return Object.assign(new Error(message), {
    type,
    googleAuth: true,
    status: source?.status,
    data: source?.data,
    originalType: source?.type,
  });
}

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
  console.log('[GoogleAuth] Android client ID configured:', Boolean(googleAndroidClientId));
  console.log('[GoogleAuth] backend endpoint:', '/oauth/google');
}

export function useGoogleAuth() {
  const signInWithGoogle = useCallback(async () => {
    if (googleSignInInFlight) {
      throw makeGoogleAuthError('google_in_progress', 'Google sign-in is already in progress.');
    }

    if (!useNativeGoogleSignIn) {
      throw new Error('Google Sign-In for this build requires the Android APK or a development build.');
    }

    if (!googleWebClientId) {
      throw new Error('Google web client ID is missing.');
    }

    googleSignInInFlight = true;
    try {
      configureNativeGoogleSignIn();
      logGoogleAuth('configured', {
        mode: useNativeGoogleSignIn ? 'native' : 'unsupported',
        webClientIdConfigured: Boolean(googleWebClientId),
        androidClientIdConfigured: Boolean(googleAndroidClientId),
        backendRoute: '/oauth/google',
      });

      logGoogleAuth('hasPlayServices-started');
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      logGoogleAuth('hasPlayServices-ok');

      try {
        if (GoogleSignin.hasPreviousSignIn()) {
          await GoogleSignin.signOut();
          logGoogleAuth('cached-google-session-reset');
        }
      } catch (resetError: any) {
        logGoogleAuth('cached-google-session-reset-failed', {
          message: resetError?.message,
          code: resetError?.code,
        });
      }

      logGoogleAuth('signIn-started');
      const result = await GoogleSignin.signIn();
      logGoogleAuth('signIn-finished', { type: result.type });

      if (result.type === 'cancelled') {
        logGoogleAuth('cancelled');
        throw makeGoogleAuthError('google_cancelled', 'Google sign-in was cancelled.');
      }

      let idToken = result.data.idToken;
      if (!idToken) {
        try {
          const tokens = await GoogleSignin.getTokens();
          idToken = tokens.idToken;
          logGoogleAuth('getTokens-finished', { idTokenReturned: Boolean(idToken) });
        } catch (tokenError: any) {
          logGoogleAuth('getTokens-failed', {
            message: tokenError?.message,
            code: tokenError?.code,
          });
        }
      }

      logGoogleAuth('idToken-received', {
        idTokenReturned: Boolean(idToken),
        hasUser: Boolean(result.data.user),
        backendRoute: '/oauth/google',
      });

      if (!idToken) {
        throw makeGoogleAuthError('google_no_id_token', 'Google did not return an ID token. Please try again.');
      }

      try {
        logGoogleAuth('backend-request-started');
        const response = await api.post('/oauth/google', { id_token: idToken });
        logGoogleAuth('backend-success', {
          tokenReturned: Boolean(response?.token),
          userReturned: Boolean(response?.user),
          onboardingCompleted: Boolean(response?.onboarding_completed ?? response?.user?.onboarding_completed),
        });
        return response;
      } catch (error: any) {
        logGoogleAuth('backend-failed', {
          status: error?.status,
          type: error?.type,
          message: error?.message,
        });

        if (api.isNetworkError(error)) {
          try {
            await api.get('/ping', undefined, 3000);
            logGoogleAuth('ping-after-backend-failure-ok');
            throw makeGoogleAuthError(
              'google_backend_request_failed',
              'Google login request failed. Please try again.',
              error
            );
          } catch (pingError: any) {
            if (pingError?.googleAuth) throw pingError;
            logGoogleAuth('ping-after-backend-failure-failed', {
              status: pingError?.status,
              type: pingError?.type,
            });
            throw error;
          }
        }

        if (error?.status === 401) {
          throw makeGoogleAuthError('google_backend_rejected', 'Google login was rejected by the server.', error);
        }
        if (error?.status === 422) {
          throw makeGoogleAuthError('google_backend_rejected', api.getErrorMessage(error, 'Google login was rejected by the server.'), error);
        }
        if (error?.status && error.status >= 500) {
          throw makeGoogleAuthError('google_server_error', 'Server error during Google login.', error);
        }

        throw error;
      }
    } catch (error: any) {
      if (error?.code === statusCodes.SIGN_IN_CANCELLED) {
        logGoogleAuth('cancelled-code');
        throw makeGoogleAuthError('google_cancelled', 'Google sign-in was cancelled.');
      }
      throw error;
    } finally {
      googleSignInInFlight = false;
    }
  }, []);

  return { signInWithGoogle, googleRedirectUri };
}
