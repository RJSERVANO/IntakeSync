import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as api from './api';
import { AuthField } from '../components/auth/AuthField';
import { AuthLayout } from '../components/auth/AuthLayout';
import { authColors, authStyles } from '../components/auth/authStyles';
import ThemedNoticeModal, { ThemedNoticeType } from './components/common/ThemedNoticeModal';

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [noticeModal, setNoticeModal] = useState<{
    type: ThemedNoticeType;
    title: string;
    message: string;
    primaryText?: string;
    onPrimary?: () => void;
  } | null>(null);

  const showNotice = (
    type: ThemedNoticeType,
    title: string,
    message: unknown,
    onPrimary?: () => void
  ) => {
    setNoticeModal({
      type,
      title,
      message: typeof message === 'string' ? message : JSON.stringify(message),
      primaryText: onPrimary ? 'Continue' : 'OK',
      onPrimary,
    });
  };

  const closeNotice = () => setNoticeModal(null);

  async function onSendResetLink() {
    if (!email) {
      showNotice('error', 'Email Required', 'Please enter your email address to continue.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showNotice('error', 'Invalid Email', 'Please enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      if (!(await api.checkBackendReachability(undefined, true))) {
        showNotice('warning', 'Internet Required', 'Internet connection is required for this function.');
        return;
      }
      const response = await api.post('/forgot-password', { email });

      if (response.debug_otp) {
        showNotice(
          'info',
          'Dev Mode Reset Code',
          `Your verification code is: ${response.debug_otp}. Copy this code to reset your password.`,
          () => {
            closeNotice();
            router.push({
              pathname: '/reset-password',
              params: { email },
            } as any);
          }
        );
      } else {
        showNotice('success', 'Code sent', 'Check your email.', () => {
          closeNotice();
          router.push({
            pathname: '/reset-password',
            params: { email },
          } as any);
        });
      }
    } catch (err: any) {
      console.log('forgot password error', err);
      const message = api.isNetworkError(err)
        ? 'Internet connection is required for this function.'
        : err?.data?.message || err?.data || 'We could not send a reset code. Please try again.';
      showNotice(api.isNetworkError(err) ? 'warning' : 'error', api.isNetworkError(err) ? 'Internet Required' : 'Reset Failed', message);
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
      <ThemedNoticeModal
        visible={Boolean(noticeModal)}
        type={noticeModal?.type || 'info'}
        title={noticeModal?.title || ''}
        message={noticeModal?.message || ''}
        primaryText={noticeModal?.primaryText}
        onPrimary={noticeModal?.onPrimary || closeNotice}
        onClose={closeNotice}
      />
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
