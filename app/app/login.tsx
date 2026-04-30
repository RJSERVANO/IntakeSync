import React, { useEffect, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import * as api from './api';
import { getCachedSession, hasValidCachedSession, saveCachedSession } from '../services/offlineStorage';
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
  const headerOpacity = React.useRef(new Animated.Value(0)).current;
  const cardTranslate = React.useRef(new Animated.Value(30)).current;
  const cardOpacity = React.useRef(new Animated.Value(0)).current;
  const { signInWithGoogle } = useGoogleAuth();
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

  async function onLogin() {
    if (!email || !password) {
      showNotice('warning', 'Validation', 'Please enter email and password');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/login', { email, password });
      await saveCachedSession({ token: res.token, user: res.user });
      if (!res.onboarding_completed) {
        router.replace({
          pathname: '/onboarding',
          params: { token: res.token, name: res.user?.name || '' },
        } as any);
      } else {
        router.replace({ pathname: '/home', params: { token: res.token } } as any);
      }
    } catch (err: any) {
      console.log('login error', err);
      if (api.isNetworkError(err)) {
        const cached = await getCachedSession();
        if (hasValidCachedSession(cached)) {
          router.replace({ pathname: '/home', params: { token: cached.token, offline: '1' } } as any);
          return;
        }
        showNotice('warning', 'Offline', 'Internet connection required for first-time login.');
        return;
      }
      const message = err?.data?.message || err?.data || err?.message || 'Login failed';
      showNotice('error', 'Login Failed', message);
    } finally {
      setLoading(false);
    }
  }

  async function onGoogle() {
    try {
      setLoading(true);
      const res = await signInWithGoogle();
      if (!res) {
        return;
      }
      await saveCachedSession({ token: res.token, user: res.user });
      if (!res.onboarding_completed) {
        router.replace({
          pathname: '/onboarding',
          params: { token: res.token, name: res.user?.name || '' },
        } as any);
      } else {
        router.replace({ pathname: '/home', params: { token: res.token } } as any);
      }
    } catch (err: any) {
      console.log('google signin error', err);
      if (api.isNetworkError(err)) {
        const cached = await getCachedSession();
        if (hasValidCachedSession(cached)) {
          router.replace({ pathname: '/home', params: { token: cached.token, offline: '1' } } as any);
          return;
        }
        showNotice('warning', 'Offline', 'Internet connection required for first-time login.');
        return;
      }
      const message =
        err?.data?.message || err?.data || err?.message || 'Google sign-in failed';
      showNotice('error', 'Login Failed', message);
    } finally {
      setLoading(false);
    }
  }

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

      <TouchableOpacity style={authStyles.socialButton} onPress={onGoogle}>
        <View style={authStyles.socialIconWrap}>
          <Ionicons name="logo-google" size={18} color="#DB4437" />
        </View>
        <Text style={authStyles.socialButtonText}>Continue with Google</Text>
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
});
