import { useCallback } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as api from '../app/api';

WebBrowser.maybeCompleteAuthSession();

const defaultGoogleClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '';
const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || defaultGoogleClientId;
const googleAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '';
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
const hasGoogleClientId = Boolean(googleWebClientId || googleAndroidClientId || googleIosClientId);
const isExpoGo =
  (Constants as any).appOwnership === 'expo' ||
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const expoProjectFullName =
  process.env.EXPO_PUBLIC_EXPO_PROJECT_FULL_NAME ||
  (Constants.expoConfig as any)?.originalFullName ||
  (Constants.expoConfig?.owner && Constants.expoConfig?.slug
    ? `@${Constants.expoConfig.owner}/${Constants.expoConfig.slug}`
    : '');
const requestedProxy = isExpoGo && process.env.EXPO_PUBLIC_GOOGLE_USE_PROXY !== 'false';
const useProxy = requestedProxy && Boolean(expoProjectFullName);

const nativeRedirectUri = AuthSession.makeRedirectUri({
  scheme: 'intakesync',
});

function getProxyRedirectUri() {
  return `https://auth.expo.io/${expoProjectFullName}`;
}

// Expo Go should use the auth.expo.io proxy redirect with the Web OAuth client.
// Development/APK builds should use the app scheme redirect configured in app.json.
export const googleRedirectUri = useProxy ? getProxyRedirectUri() : nativeRedirectUri;

console.log('[GoogleAuth] redirectUri:', googleRedirectUri);
console.log('[GoogleAuth] proxy mode:', useProxy ? 'enabled' : 'disabled');
if (requestedProxy && !expoProjectFullName) {
  console.warn(
    '[GoogleAuth] Proxy mode was requested but Expo project full name is missing. ' +
      'Set EXPO_PUBLIC_EXPO_PROJECT_FULL_NAME=@your-expo-username/IntakeSync or run in a development build with the native redirect.'
  );
}
console.log(
  `[GoogleAuth] Add this redirect URI to Google Cloud Authorized redirect URIs: ${googleRedirectUri}`
);
console.log(
  `[GoogleAuth] OAuth client type: ${
    useProxy ? 'Web OAuth client for Expo Go/AuthSession proxy' : 'native app scheme redirect'
  }`
);

export function useGoogleAuth() {
  const [, , promptAsync] = Google.useAuthRequest({
    clientId: useProxy
      ? googleWebClientId || 'missing-google-web-client-id'
      : defaultGoogleClientId || googleWebClientId || 'missing-google-client-id',
    webClientId: googleWebClientId || undefined,
    androidClientId: googleAndroidClientId || undefined,
    iosClientId: googleIosClientId || undefined,
    redirectUri: googleRedirectUri,
    responseType: AuthSession.ResponseType.IdToken,
    usePKCE: false,
    scopes: ['openid', 'profile', 'email'],
    selectAccount: true,
  });

  const signInWithGoogle = useCallback(async () => {
    if (!hasGoogleClientId) {
      throw new Error('Google sign-in is not configured yet.');
    }

    const result = await promptAsync();
    if (result.type !== 'success') {
      return null;
    }

    const idToken = result.params?.id_token || (result.authentication as any)?.idToken;
    if (!idToken) {
      throw new Error('Google did not return an identity token.');
    }

    return api.post('/oauth/google', { id_token: idToken });
  }, [promptAsync]);

  return { signInWithGoogle, googleRedirectUri };
}
