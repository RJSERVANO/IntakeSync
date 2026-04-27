import { useCallback } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as api from '../app/api';

WebBrowser.maybeCompleteAuthSession();

const googleClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '';
const hasGoogleClientId = Boolean(googleClientId);
const isExpoGo =
  (Constants as any).appOwnership === 'expo' ||
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const expoProjectFullName =
  process.env.EXPO_PUBLIC_EXPO_PROJECT_FULL_NAME ||
  (Constants.expoConfig as any)?.originalFullName ||
  (Constants.expoConfig?.owner && Constants.expoConfig?.slug
    ? `@${Constants.expoConfig.owner}/${Constants.expoConfig.slug}`
    : '');
const nativeRedirectUri = AuthSession.makeRedirectUri({
  scheme: 'intakesync',
});

type ExpoProxyRedirectOptions = {
  useProxy: true;
  native?: string;
  scheme?: string;
  path?: string;
  preferLocalhost?: boolean;
  isTripleSlashed?: boolean;
  queryParams?: Record<string, string | undefined>;
};

function makeExpoGoRedirectUri() {
  if (expoProjectFullName) {
    return `https://auth.expo.io/${expoProjectFullName}`;
  }

  const redirectUri = AuthSession.makeRedirectUri({
    useProxy: true,
  } as ExpoProxyRedirectOptions);

  if (redirectUri.startsWith('https://auth.expo.io/')) {
    return redirectUri;
  }

  return redirectUri;
}

function getRedirectErrorMessage(error?: string | null, description?: string | null) {
  if (error === 'invalid_request') {
    return 'Google sign-in could not start. Check the Google OAuth redirect URI and try again.';
  }

  if (error === 'redirect_uri_mismatch' || description?.includes('redirect_uri_mismatch')) {
    return 'Google sign-in redirect URI does not match Google Cloud. Copy the logged redirect URI into your Web OAuth client.';
  }

  return description || 'Google sign-in was cancelled or could not be completed.';
}

function getFallbackExpoGoRedirectUri() {
  return `https://auth.expo.io/${expoProjectFullName}`;
}

// Expo Go uses the AuthSession proxy redirect with the Web OAuth client.
// APK builds use the configured app scheme redirect and still request only an id_token.
export const googleRedirectUri = isExpoGo ? makeExpoGoRedirectUri() : nativeRedirectUri;

console.log('Google Redirect URI:', googleRedirectUri);
console.log('[GoogleAuth] proxy mode:', isExpoGo ? 'enabled' : 'disabled');
if (isExpoGo && !expoProjectFullName) {
  console.warn(
    '[GoogleAuth] Proxy mode was requested but Expo project full name is missing. ' +
      'Set EXPO_PUBLIC_EXPO_PROJECT_FULL_NAME=@your-expo-username/IntakeSync so the logged redirect URI can be registered in Google Cloud.'
  );
}
if (isExpoGo && expoProjectFullName && googleRedirectUri !== getFallbackExpoGoRedirectUri()) {
  console.log('[GoogleAuth] Expo proxy redirect fallback:', getFallbackExpoGoRedirectUri());
}

export function useGoogleAuth() {
  const [, , promptAsync] = Google.useAuthRequest({
    clientId: googleClientId || 'missing-google-client-id',
    redirectUri: googleRedirectUri,
    responseType: 'id_token',
    usePKCE: false,
    scopes: ['openid', 'profile', 'email'],
    selectAccount: true,
    shouldAutoExchangeCode: false,
  });

  const signInWithGoogle = useCallback(async () => {
    if (!hasGoogleClientId) {
      throw new Error('Google sign-in is not configured yet.');
    }

    const result = await promptAsync();
    if (result.type === 'error') {
      throw new Error(
        getRedirectErrorMessage(
          result.params?.error || result.errorCode,
          result.params?.error_description || result.error?.description
        )
      );
    }

    if (result.type !== 'success') {
      return null;
    }

    if (result.params?.error) {
      throw new Error(
        getRedirectErrorMessage(result.params.error, result.params.error_description)
      );
    }

    const idToken = result.params?.id_token || (result.authentication as any)?.idToken;
    if (!idToken) {
      throw new Error('Google did not return an identity token.');
    }

    return api.post('/oauth/google', { id_token: idToken });
  }, [promptAsync]);

  return { signInWithGoogle, googleRedirectUri };
}
