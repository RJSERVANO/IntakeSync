import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as api from './api';
import { AuthField } from './components/auth/AuthField';
import { AuthLayout } from './components/auth/AuthLayout';
import { authColors, authStyles } from './components/auth/authStyles';

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent] = useState(false);

  async function onSendResetLink() {
    if (!email) {
      Alert.alert('Validation', 'Please enter your email address');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Validation', 'Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/forgot-password', { email });

      if (response.debug_otp) {
        Alert.alert(
          'Dev Mode - Your Reset Code',
          `Your verification code is: ${response.debug_otp}\n\nCopy this code to reset your password.`,
          [
            {
              text: 'OK',
              onPress: () =>
                router.push({
                  pathname: '/reset-password',
                  params: { email },
                } as any),
            },
          ]
        );
      } else {
        Alert.alert('Success', 'Verification code has been sent to your email.', [
          {
            text: 'OK',
            onPress: () =>
              router.push({
                pathname: '/reset-password',
                params: { email },
              } as any),
          },
        ]);
      }
    } catch (err: any) {
      console.log('forgot password error', err);
      const message =
        err?.data?.message || err?.data || err?.message || 'Failed to send reset code';
      Alert.alert('Error', typeof message === 'string' ? message : JSON.stringify(message));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Forgot Password?"
      subtitle="Let’s get you back in."
      helper="Enter your email to continue."
      iconName="lock-closed-outline"
    >
      <View style={authStyles.inlineInfoCard}>
        <Ionicons name="mail-unread-outline" size={20} color={authColors.primary} />
        <View style={authStyles.inlineInfoTextWrap}>
          <Text style={authStyles.inlineInfoTitle}>Check your inbox</Text>
          <Text style={authStyles.inlineInfoBody}>
            We&apos;ll take you to the next step after this.
          </Text>
        </View>
      </View>

      {!emailSent && (
        <>
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
          </View>

          <TouchableOpacity style={authStyles.primaryButton} onPress={onSendResetLink} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={authStyles.primaryButtonText}>Send Reset Link</Text>
            )}
          </TouchableOpacity>
        </>
      )}

      {emailSent && (
        <TouchableOpacity style={authStyles.primaryButton} onPress={() => router.back()}>
          <Text style={authStyles.primaryButtonText}>Back to Login</Text>
        </TouchableOpacity>
      )}

      {!emailSent && (
        <View style={styles.footerWrap}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[authStyles.secondaryAction, styles.backLink]}
          >
            <View style={authStyles.secondaryActionIconWrap}>
              <Ionicons name="arrow-back-outline" size={15} color={authColors.link} />
            </View>
            <Text style={[authStyles.secondaryActionText, styles.backLinkText]}>Back to Login</Text>
          </TouchableOpacity>
        </View>
      )}
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  footerWrap: {
    marginTop: 12,
  },
  backLink: {
    marginTop: 2,
  },
  backLinkText: {
    marginLeft: 8,
  },
});
