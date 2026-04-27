import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as api from './api';
import { AuthField } from '../components/auth/AuthField';
import { AuthLayout } from '../components/auth/AuthLayout';
import { authColors, authStyles } from '../components/auth/authStyles';

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

  useEffect(() => {
    if (params.email) {
      setEmail(params.email as string);
    }
  }, [params]);

  async function onResetPassword() {
    if (!email || !code || !password || !confirmPassword) {
      Alert.alert('Validation', 'Please fill all fields');
      return;
    }

    if (code.length !== 6) {
      Alert.alert('Validation', 'Verification code must be 6 digits');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Validation', 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Validation', 'Password must be at least 6 characters');
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

      Alert.alert(
        'Success',
        'Your password has been reset successfully. You can now login with your new password.',
        [
          {
            text: 'OK',
            onPress: () => router.replace({ pathname: '/login' } as any),
          },
        ]
      );
    } catch (err: any) {
      console.log('reset password error', err);
      const message =
        err?.data?.message || err?.data || err?.message || 'Failed to reset password';
      Alert.alert('Error', typeof message === 'string' ? message : JSON.stringify(message));
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
