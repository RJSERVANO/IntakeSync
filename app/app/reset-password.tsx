import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as api from './api';
import { AuthField } from '../components/auth/AuthField';
import { AuthLayout } from '../components/auth/AuthLayout';
import { authColors, authStyles } from '../components/auth/authStyles';
import ThemedNoticeModal, { ThemedNoticeType } from './components/common/ThemedNoticeModal';
import { getPasswordRules, isStrongPassword, PASSWORD_POLICY_MESSAGE } from '../utils/passwordPolicy';

export default function ResetPassword() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [noticeModal, setNoticeModal] = useState<{
    type: ThemedNoticeType;
    title: string;
    message: string;
    onPrimary?: () => void;
  } | null>(null);

  const closeNotice = () => setNoticeModal(null);
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
      onPrimary,
    });
  };

  useEffect(() => {
    if (params.email) {
      setEmail(params.email as string);
    }
  }, [params]);

  async function onResetPassword() {
    if (!email || !code || !password || !confirmPassword) {
      showNotice('warning', 'Validation', 'Please fill all fields');
      return;
    }

    if (code.length !== 6) {
      showNotice('warning', 'Validation', 'Verification code must be 6 digits');
      return;
    }

    if (password !== confirmPassword) {
      showNotice('warning', 'Validation', 'Passwords do not match');
      return;
    }

    if (!isStrongPassword(password)) {
      showNotice('warning', 'Weak Password', PASSWORD_POLICY_MESSAGE);
      return;
    }

    setLoading(true);
    try {
      await api.post('/reset-password', {
        code,
        email,
        password,
        password_confirmation: confirmPassword,
      });
      showNotice(
        'success',
        'Success',
        'Your password has been reset successfully. You can now login with your new password.',
        () => {
          closeNotice();
          router.replace({ pathname: '/login' } as any);
        }
      );
    } catch (err: any) {
      console.log('reset password error', err);
      const message =
        err?.data?.message || err?.data || err?.message || 'Failed to reset password';
      showNotice('error', 'Reset Failed', message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Reset Password"
      subtitle="Choose a new password."
      helper="Use the code from your email."
      iconName="key-outline"
    >
      <View style={authStyles.inlineInfoCard}>
        <Ionicons name="shield-checkmark-outline" size={20} color={authColors.primary} />
        <View style={authStyles.inlineInfoTextWrap}>
          <Text style={authStyles.inlineInfoTitle}>Almost done</Text>
          <Text style={authStyles.inlineInfoBody}>
            Confirm your code and set your new password.
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
          editable={!params.email}
        />
        <PasswordChecklist password={password} />

        <AuthField
          label="Verification Code"
          iconName="keypad-outline"
          placeholder="6-digit verification code"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          maxLength={6}
        />

        <AuthField
          label="New Password"
          iconName="lock-closed-outline"
          placeholder="New password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          textContentType="newPassword"
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

        <AuthField
          label="Confirm Password"
          iconName="lock-closed-outline"
          placeholder="Confirm new password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry={!showConfirmPassword}
          textContentType="newPassword"
          rightAccessory={
            <TouchableOpacity
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              style={authStyles.trailingIconButton}
              accessibilityRole="button"
              accessibilityLabel={
                showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'
              }
            >
              <Ionicons
                name={showConfirmPassword ? 'eye-outline' : 'eye-off-outline'}
                size={20}
                color="#8A94A6"
              />
            </TouchableOpacity>
          }
        />
      </View>

      <TouchableOpacity style={authStyles.primaryButton} onPress={onResetPassword} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={authStyles.primaryButtonText}>Reset Password</Text>
        )}
      </TouchableOpacity>

      <View style={styles.footerWrap}>
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/login' } as any)}
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
        onPrimary={noticeModal?.onPrimary || closeNotice}
        onClose={closeNotice}
      />
    </AuthLayout>
  );
}

function PasswordChecklist({ password }: { password: string }) {
  return (
    <View style={styles.passwordChecklist}>
      {getPasswordRules(password).map((rule) => (
        <View key={rule.id} style={styles.passwordRuleRow}>
          <Ionicons
            name={rule.valid ? 'checkmark-circle' : 'ellipse-outline'}
            size={15}
            color={rule.valid ? '#10B981' : '#94A3B8'}
          />
          <Text style={[styles.passwordRuleText, rule.valid && styles.passwordRuleTextValid]}>
            {rule.label}
          </Text>
        </View>
      ))}
    </View>
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
  passwordChecklist: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E3EAF5',
    padding: 12,
    gap: 7,
    marginTop: -4,
    marginBottom: 14,
  },
  passwordRuleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  passwordRuleText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  passwordRuleTextValid: {
    color: '#047857',
  },
});
