import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as api from './api';
import { clearCachedSession, getCachedSession, hasCompletedOnboarding, hasValidCachedSession } from '../services/offlineStorage';
import { captureAuthSessionContext, isAuthSessionContextCurrent, persistAuthResponse, routeAfterAuth } from '../services/authSession';
import { AuthField } from '../components/auth/AuthField';
import { AuthLayout } from '../components/auth/AuthLayout';
import { authStyles } from '../components/auth/authStyles';
import { useGoogleAuth } from '../hooks/useGoogleAuth';
import ThemedNoticeModal, { ThemedNoticeType } from './components/common/ThemedNoticeModal';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [googleLoginInProgress, setGoogleLoginInProgress] = useState(false);
  const googleLoginInFlightRef = useRef(false);
  const headerOpacity = React.useRef(new Animated.Value(0)).current;
  const cardTranslate = React.useRef(new Animated.Value(30)).current;
  const cardOpacity = React.useRef(new Animated.Value(0)).current;
  const { signInWithGoogle, isGoogleAuthReady } = useGoogleAuth();
  const [noticeModal, setNoticeModal] = useState<{
    type: ThemedNoticeType;
    title: string;
    message: string;
  } | null>(null);

  const showNotice = (type: ThemedNoticeType, title: string, message: unknown) => {
    setNoticeModal({
      type,
      title,
      message: typeof message === 'string' ? message : JSON.stringify(message),
    });
  };

  async function showLoginError(err: any, fallbackMessage: string) {
    if (api.isNetworkError(err)) {
      const cached = await getCachedSession();
      if (hasValidCachedSession(cached)) {
        router.replace({ pathname: '/home', params: { token: cached.token, offline: '1' } } as any);
        return;
      }
      showNotice('warning', api.getErrorTitle(err, 'Backend Unreachable'), api.getErrorMessage(err, 'Internet or backend access is required for first-time login.'));
      return;
    }

    if (api.isAuthError(err)) {
      const cached = await getCachedSession();
      if (!hasValidCachedSession(cached)) {
        await clearCachedSession();
      }
      showNotice('error', api.getErrorTitle(err, 'Invalid Credentials'), api.getErrorMessage(err, 'The email or password is incorrect.'));
      return;
    }

    const message = api.getErrorMessage(err, fallbackMessage);
    if (api.isValidationError(err)) {
      showNotice('warning', api.getErrorTitle(err, 'Validation Error'), message);
      return;
    }
    if (err?.type === 'not_found' || err?.status === 404 || err?.type === 'server' || (err?.status && err.status >= 500)) {
      showNotice('error', api.getErrorTitle(err, 'Login Failed'), message);
      return;
    }
    showNotice('error', api.getErrorTitle(err, 'Login Failed'), message);
  }

  async function showGoogleLoginError(err: any) {
    if (api.isStaleSessionError(err) || err?.type === 'google_stale_session') {
      console.log('[GoogleLogin] stale session ignored');
      return;
    }
    if (err?.type === 'google_cancelled') {
      showNotice('info', 'Google Sign-In', 'Google sign-in was cancelled.');
      return;
    }
    if (err?.type === 'google_in_progress') {
      showNotice('info', 'Google Sign-In', 'Google sign-in is already in progress.');
      return;
    }
    if (err?.type === 'google_no_id_token') {
      showNotice('warning', 'Google Sign-In', 'Google did not return an ID token. Please try again.');
      return;
    }
    if (err?.type === 'google_backend_rejected') {
      showNotice('error', 'Google Sign-In', err.message || 'Google login was rejected by the server.');
      return;
    }
    if (err?.type === 'google_server_error') {
      showNotice('error', 'Google Sign-In', 'Server error during Google login.');
      return;
    }
    if (err?.type === 'google_backend_request_failed') {
      showNotice('error', 'Google Sign-In', err.message || 'Google sign-in could not connect to the server. Please try again.');
      return;
    }
    await showLoginError(err, 'Google sign-in failed');
  }

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerOpacity, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.timing(cardTranslate, {
        toValue: 0,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [cardOpacity, cardTranslate, headerOpacity]);

  useEffect(() => {
    console.log('[GoogleLogin] request ready status', {
      isGoogleAuthReady,
      isSessionLoading,
      googleLoginInProgress,
    });
  }, [googleLoginInProgress, isGoogleAuthReady, isSessionLoading]);

  useEffect(() => {
    let mounted = true;

    async function redirectIfAlreadySignedIn() {
      setIsSessionLoading(true);
      try {
        if (googleLoginInFlightRef.current) return;
        const cached = await getCachedSession();
        if (!mounted || googleLoginInFlightRef.current || !hasValidCachedSession(cached)) return;
        const context = await captureAuthSessionContext(cached.token, cached.user);
        if (!mounted || googleLoginInFlightRef.current || !(await isAuthSessionContextCurrent(context))) return;
        routeAfterAuth(router, {
          token: cached.token,
          user: cached.user,
          onboardingCompleted: await hasCompletedOnboarding(cached.user),
          sessionVersion: context.sessionVersion,
        });
      } finally {
        if (mounted) setIsSessionLoading(false);
      }
    }

    void redirectIfAlreadySignedIn();

    return () => {
      mounted = false;
    };
  }, [router]);

  async function onLogin() {
    if (!email || !password) {
      showNotice('warning', 'Validation', 'Please enter email and password');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/login', { email, password });
      const session = await persistAuthResponse(res);
      routeAfterAuth(router, session);
    } catch (err: any) {
      console.log('login error', err);
      await showLoginError(err, 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function onGoogle() {
    if (loading || isSessionLoading || googleLoginInFlightRef.current || googleLoginInProgress) return;
    if (!isGoogleAuthReady) {
      showNotice('warning', 'Google Sign-In', 'Google sign-in is still preparing. Please try again in a moment.');
      return;
    }
    try {
      googleLoginInFlightRef.current = true;
      setGoogleLoginInProgress(true);
      setLoading(true);
      const context = await captureAuthSessionContext();
      const res = await signInWithGoogle({ authContext: context });
      if (!(await isAuthSessionContextCurrent(context))) {
        console.log('[GoogleLogin] stale session ignored after Google response');
        return;
      }
      const session = await persistAuthResponse(res);
      routeAfterAuth(router, session);
    } catch (err: any) {
      console.log('google signin error', err);
      await showGoogleLoginError(err);
    } finally {
      googleLoginInFlightRef.current = false;
      setGoogleLoginInProgress(false);
      setLoading(false);
    }
  }

  const googleButtonDisabled = loading || isSessionLoading || googleLoginInProgress || !isGoogleAuthReady;

  return (
    <>
      <AuthLayout
        title="Sign In"
        subtitle="Welcome back"
        helper="Sign in to continue."
        headerAnimatedStyle={{ opacity: headerOpacity }}
        cardAnimatedStyle={{ opacity: cardOpacity, transform: [{ translateY: cardTranslate }] }}
      >
      <View style={authStyles.formSection}>
        <AuthField
          label="Email"
          iconName="mail-outline"
          placeholder="Email address"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="emailAddress"
        />

        <AuthField
          label="Password"
          iconName="lock-closed-outline"
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          textContentType="password"
          rightAccessory={
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              style={authStyles.trailingIconButton}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              <Ionicons
                name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                size={20}
                color="#8A94A6"
              />
            </TouchableOpacity>
          }
        />
      </View>

      <TouchableOpacity
        style={authStyles.rightLinkWrap}
        onPress={() => router.push({ pathname: '/forgot-password' } as any)}
      >
        <Text style={authStyles.textLink}>Forgot Password?</Text>
      </TouchableOpacity>

      <TouchableOpacity style={authStyles.primaryButton} onPress={onLogin} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={authStyles.primaryButtonText}>Sign In</Text>
        )}
      </TouchableOpacity>

      <View style={authStyles.dividerRow}>
        <View style={authStyles.dividerLine} />
        <View style={authStyles.dividerPill}>
          <Text style={authStyles.dividerText}>OR CONTINUE WITH</Text>
        </View>
        <View style={authStyles.dividerLine} />
      </View>

      <TouchableOpacity style={[authStyles.socialButton, googleButtonDisabled && styles.disabledButton]} onPress={onGoogle} disabled={googleButtonDisabled}>
        <View style={authStyles.socialIconWrap}>
          <Ionicons name="logo-google" size={18} color="#DB4437" />
        </View>
        <Text style={authStyles.socialButtonText}>
          {googleLoginInProgress ? 'Connecting to Google...' : 'Continue with Google'}
        </Text>
      </TouchableOpacity>

      <View style={styles.footerWrap}>
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/register' } as any)}
          style={styles.footerButton}
        >
          <Text style={authStyles.footerText}>
            New member? <Text style={authStyles.footerTextStrong}>Create an account</Text>
          </Text>
        </TouchableOpacity>
      </View>
      </AuthLayout>
      <ThemedNoticeModal
        visible={Boolean(noticeModal)}
        type={noticeModal?.type || 'info'}
        title={noticeModal?.title || ''}
        message={noticeModal?.message || ''}
        onPrimary={() => setNoticeModal(null)}
        onClose={() => setNoticeModal(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  footerWrap: {
    marginTop: 10,
    paddingTop: 10,
  },
  footerButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  disabledButton: {
    opacity: 0.6,
  },
});
