import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as AuthSession from 'expo-auth-session';
import { Ionicons } from '@expo/vector-icons';
import * as api from './api';
import { AuthField } from './components/auth/AuthField';
import { AuthLayout } from './components/auth/AuthLayout';
import { authStyles } from './components/auth/authStyles';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const headerOpacity = React.useRef(new Animated.Value(0)).current;
  const cardTranslate = React.useRef(new Animated.Value(30)).current;
  const cardOpacity = React.useRef(new Animated.Value(0)).current;

  const generatedRedirect = AuthSession.makeRedirectUri({ useProxy: true });
  const proxyRedirect = 'https://auth.expo.io/@kboydev/app';
  const redirectUri =
    generatedRedirect && generatedRedirect.startsWith('exp://')
      ? proxyRedirect
      : generatedRedirect;
  console.log('AuthSession generated redirect:', generatedRedirect);
  console.log('AuthSession using effective redirectUri:', redirectUri);
  console.log('AuthSession redirectUri:', redirectUri);
  const clientId =
    '237625744653-f08o97b5d90esl7je4pie2hephi1t32e.apps.googleusercontent.com';
  const scopes = ['openid', 'email', 'profile'];
  const discovery = {
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
  } as const;

  const [, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId,
      redirectUri,
      scopes,
      responseType: AuthSession.ResponseType.Code,
      extraParams: { prompt: 'select_account' },
    },
    discovery
  );

  useEffect(() => {
    if (response) {
      // consumed during development for auth flow debugging
    }
  }, [response]);

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
      Alert.alert('Validation', 'Please enter email and password');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/login', { email, password });
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
      const message = err?.data?.message || err?.data || err?.message || 'Login failed';
      Alert.alert('Error', typeof message === 'string' ? message : JSON.stringify(message));
    } finally {
      setLoading(false);
    }
  }

  async function onGoogle() {
    try {
      setLoading(true);
      console.log('Starting Google auth flow (code + PKCE) with:', { clientId, scopes });
      const result = await promptAsync({ useProxy: true });
      console.log('promptAsync result:', result);
      if (result?.type !== 'success') {
        Alert.alert('Google Sign-in', 'Canceled or failed');
        return;
      }

      const code = (result as any).params?.code;
      if (!code) {
        Alert.alert('Google Sign-in', 'No code received');
        return;
      }

      const res = await api.post('/oauth/google', { code, redirect_uri: redirectUri });
      router.replace({ pathname: '/home', params: { token: res.token } } as any);
    } catch (err: any) {
      console.log('google signin error', err);
      const message =
        err?.data?.message || err?.data || err?.message || 'Google sign-in failed';
      Alert.alert('Error', typeof message === 'string' ? message : JSON.stringify(message));
    } finally {
      setLoading(false);
    }
  }

  async function onFacebookLogin() {
    Alert.alert('Coming Soon', 'Facebook login will be available soon');
  }

  return (
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

      <TouchableOpacity style={authStyles.socialButton} onPress={onFacebookLogin}>
        <View style={authStyles.socialIconWrap}>
          <Ionicons name="logo-facebook" size={18} color="#1877F2" />
        </View>
        <Text style={authStyles.socialButtonText}>Continue with Facebook</Text>
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
