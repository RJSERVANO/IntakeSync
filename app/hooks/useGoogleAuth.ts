import { useCallback } from 'react';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import * as api from '../app/api';
import { captureAuthSessionContext, isAuthSessionContextCurrent, type AuthSessionContext } from '../services/authSession';

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
  | 'google_stale_session'
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
    responseFormat: source?.responseFormat,
    isStaleSessionError: type === 'google_stale_session',
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
  const isGoogleAuthReady = useNativeGoogleSignIn && Boolean(googleWebClientId);

  const signInWithGoogle = useCallback(async (options?: { authContext?: AuthSessionContext | null }) => {
    if (googleSignInInFlight) {
      throw makeGoogleAuthError('google_in_progress', 'Google sign-in is already in progress.');
    }

    if (!useNativeGoogleSignIn) {
      throw new Error('Google Sign-In for this build requires the Android APK or a development build.');
    }

    if (!googleWebClientId) {
      throw new Error('Google web client ID is missing.');
    }

    const authContext = options?.authContext || await captureAuthSessionContext();
    googleSignInInFlight = true;
    try {
      if (!(await isAuthSessionContextCurrent(authContext))) {
        logGoogleAuth('stale-session-ignored', { stage: 'before-prompt' });
        throw makeGoogleAuthError('google_stale_session', 'Stale Google sign-in ignored.');
      }

      configureNativeGoogleSignIn();
      logGoogleAuth('configured', {
        mode: useNativeGoogleSignIn ? 'native' : 'unsupported',
        requestReady: isGoogleAuthReady,
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
      logGoogleAuth('prompt-result', { type: result.type });

      if (result.type === 'cancelled') {
        logGoogleAuth('cancelled');
        throw makeGoogleAuthError('google_cancelled', 'Google sign-in was cancelled.');
      }
      if (result.type !== 'success') {
        logGoogleAuth('non-success-result', { type: (result as any).type });
        throw makeGoogleAuthError('google_cancelled', 'Google sign-in did not complete.');
      }

      if (!(await isAuthSessionContextCurrent(authContext))) {
        logGoogleAuth('stale-session-ignored', { stage: 'after-prompt', promptResultType: result.type });
        throw makeGoogleAuthError('google_stale_session', 'Stale Google sign-in ignored.');
      }

      let idToken = result.data?.idToken || '';
      let accessToken = '';
      if (!idToken || !accessToken) {
        try {
          const tokens = await GoogleSignin.getTokens();
          idToken = idToken || tokens.idToken || '';
          accessToken = tokens.accessToken || '';
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
        accessTokenReturned: Boolean(accessToken),
        hasUser: Boolean(result.data?.user),
        backendRoute: '/oauth/google',
      });

      if (!idToken && !accessToken) {
        throw makeGoogleAuthError('google_no_id_token', 'Google did not return an ID token. Please try again.');
      }

      try {
        if (!(await isAuthSessionContextCurrent(authContext))) {
          logGoogleAuth('stale-session-ignored', { stage: 'before-backend' });
          throw makeGoogleAuthError('google_stale_session', 'Stale Google sign-in ignored.');
        }
        logGoogleAuth('backend-request-started', {
          hasIdToken: Boolean(idToken),
          hasAccessToken: Boolean(accessToken),
          timeoutMs: 12000,
        });
        const responseMeta = await api.postWithMeta(
          '/oauth/google',
          idToken ? { id_token: idToken } : { access_token: accessToken },
          undefined,
          12000
        );
        const response = responseMeta.data;
        logGoogleAuth('backend-status', {
          status: responseMeta.status,
          responseFormat: responseMeta.responseFormat,
        });
        if (!(await isAuthSessionContextCurrent(authContext))) {
          logGoogleAuth('stale-session-ignored', { stage: 'after-backend', status: responseMeta.status });
          throw makeGoogleAuthError('google_stale_session', 'Stale Google sign-in ignored.');
        }
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
          responseFormat: error?.responseFormat || error?.data?.response_format,
        });

        if (error?.isStaleSessionError || error?.type === 'google_stale_session') {
          logGoogleAuth('stale-session-ignored', { stage: 'backend-catch' });
          throw error;
        }

        if (error?.responseFormat === 'html' || error?.data?.response_format === 'html' || error?.data?.response_format === 'text') {
          throw makeGoogleAuthError(
            'google_backend_request_failed',
            'Google sign-in could not connect to the server. Please try again.',
            error
          );
        }

        if (api.isNetworkError(error)) {
          try {
            await api.get('/ping', undefined, 3000);
            logGoogleAuth('ping-after-backend-failure-ok');
            throw makeGoogleAuthError(
              'google_backend_request_failed',
              'Google sign-in could not connect to the server. Please try again.',
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
  }, [isGoogleAuthReady]);

  return { signInWithGoogle, googleRedirectUri, isGoogleAuthReady };
}
