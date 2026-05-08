import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as api from './api';
import { hasCompletedOnboarding, hasValidCachedSession, markOnboardingComplete, saveCachedSession } from '../services/offlineStorage';
import { AuthField, AuthSelectField } from '../components/auth/AuthField';
import { AuthLayout } from '../components/auth/AuthLayout';
import { authColors, authStyles, authShadows } from '../components/auth/authStyles';
import { useGoogleAuth } from '../hooks/useGoogleAuth';
import ThemedNoticeModal, { ThemedNoticeType } from './components/common/ThemedNoticeModal';
import { getPasswordRules, isStrongPassword, PASSWORD_POLICY_MESSAGE } from '../utils/passwordPolicy';

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male', icon: 'male-outline' },
  { value: 'female', label: 'Female', icon: 'female-outline' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say', icon: 'person-circle-outline' },
] as const;

function normalizePhilippineMobile(value: string) {
  const compact = value.replace(/[\s()-]/g, '');
  if (/^\+639\d{9}$/.test(compact)) return compact;
  if (/^09\d{9}$/.test(compact)) return `+63${compact.slice(1)}`;
  if (/^9\d{9}$/.test(compact)) return `+63${compact}`;
  return null;
}

function formatBirthDateInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function parseBirthDate(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;

  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  const today = new Date();
  if (date > today) return null;

  let age = today.getFullYear() - year;
  const hadBirthday =
    today.getMonth() > month - 1 ||
    (today.getMonth() === month - 1 && today.getDate() >= day);
  if (!hadBirthday) age -= 1;
  if (age < 13 || age > 120) return null;

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function capitalizeWords(value: string) {
  return value.replace(/\S+/g, (word) =>
    word
      .split(/([-'])/)
      .map((part) => {
        if (part === '-' || part === "'") return part;
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      })
      .join('')
  );
}

export default function Register() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');
  const [address, setAddress] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showGenderPicker, setShowGenderPicker] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [loading, setLoading] = useState(false);
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

  const displayGender = gender
    ? GENDER_OPTIONS.find((option) => option.value === gender)?.label || ''
    : '';

  const displayEmail = email ? email.charAt(0).toUpperCase() + email.slice(1) : '';

  async function onRegister() {
    if (!name || !email || !password || !confirmPassword) {
      showNotice('warning', 'Validation', 'Please fill all required fields');
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
    if (!agreeTerms) {
      showNotice('warning', 'Validation', 'Please agree to Terms of Use');
      return;
    }
    const normalizedPhone = phone.trim() ? normalizePhilippineMobile(phone) : null;
    if (phone.trim() && !normalizedPhone) {
      showNotice('warning', 'Invalid Phone Number', 'Enter a valid Philippine mobile number.');
      return;
    }
    const birthDateForBackend = dateOfBirth.trim() ? parseBirthDate(dateOfBirth) : null;
    if (dateOfBirth.trim() && !birthDateForBackend) {
      showNotice('warning', 'Invalid Date of Birth', 'Use mm/dd/yyyy with a real date. You must be between 13 and 120 years old.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/register', {
        name,
        email,
        password,
        password_confirmation: confirmPassword,
        phone: normalizedPhone,
        date_of_birth: birthDateForBackend,
        gender: gender || null,
        address: address || null,
      });
      if (!hasValidCachedSession({ token: res?.token })) {
        showNotice('error', 'Registration Error', 'Registration succeeded but no valid session token was returned. Please sign in.');
        router.replace({ pathname: '/login' } as any);
        return;
      }
      const sessionUser = { ...(res.user || {}), onboarding_completed: res.onboarding_completed === true };
      await saveCachedSession({ token: res.token, user: sessionUser });
      const onboardingCompleted = res.onboarding_completed === true || await hasCompletedOnboarding(sessionUser);

      if (!onboardingCompleted) {
        router.replace({
          pathname: '/onboarding',
          params: { token: res.token, name: sessionUser?.name || name },
        } as any);
      } else {
        await markOnboardingComplete(sessionUser);
        router.replace({ pathname: '/home', params: { token: res.token } } as any);
      }
    } catch (err: any) {
      console.log('register error', err);
      if (api.isNetworkError(err)) {
        showNotice('warning', 'Offline', 'Internet connection required for first-time login.');
        return;
      }
      const message = err?.data?.message || err?.data || err?.message || 'Registration failed';
      showNotice('error', 'Registration Failed', message);
    } finally {
      setLoading(false);
    }
  }

  async function onGoogleLogin() {
    try {
      setLoading(true);
      const res = await signInWithGoogle();
      if (!res) {
        return;
      }
      if (!hasValidCachedSession({ token: res?.token })) {
        showNotice('error', 'Registration Error', 'No valid session token was returned. Please sign in.');
        router.replace({ pathname: '/login' } as any);
        return;
      }
      const sessionUser = { ...(res.user || {}), onboarding_completed: res.onboarding_completed === true };
      await saveCachedSession({ token: res.token, user: sessionUser });
      const onboardingCompleted = res.onboarding_completed === true || await hasCompletedOnboarding(sessionUser);

      if (!onboardingCompleted) {
        router.replace({
          pathname: '/onboarding',
          params: { token: res.token, name: sessionUser?.name || '' },
        } as any);
      } else {
        await markOnboardingComplete(sessionUser);
        router.replace({ pathname: '/home', params: { token: res.token } } as any);
      }
    } catch (err: any) {
      console.log('google register error', err);
      if (api.isNetworkError(err)) {
        showNotice('warning', 'Offline', 'Internet connection required for first-time login.');
        return;
      }
      const message =
        err?.data?.message || err?.data || err?.message || 'Google sign-in failed';
      showNotice('error', 'Registration Failed', message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <AuthLayout
        title="Create Account"
        subtitle="Create your IntakeSync account."
        helper="Start with the essentials."
      >
        <View style={authStyles.formSection}>
          <Text style={authStyles.sectionEyebrow}>Required Details</Text>
          <View style={authStyles.subCard}>
            <AuthField
              label="Full Name"
              iconName="person-outline"
              placeholder="Enter your full name"
              value={name}
              onChangeText={(value) => setName(capitalizeWords(value))}
              autoCapitalize="words"
              autoCorrect={false}
              textContentType="name"
            />

            <AuthField
              label="Email"
              iconName="mail-outline"
              placeholder="Email address"
              value={displayEmail}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
            />

            <AuthField
              label="Password"
              iconName="lock-closed-outline"
              placeholder="Create a password"
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
            <PasswordChecklist password={password} />

            <AuthField
              label="Confirm Password"
              iconName="lock-closed-outline"
              placeholder="Confirm your password"
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
        </View>

        <View style={authStyles.formSection}>
          <Text style={authStyles.sectionEyebrow}>More About You</Text>
          <View style={authStyles.optionalCard}>
            <AuthField
              label="Phone Number"
              iconName="call-outline"
              placeholder="09123456789"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              optional
            />

            <AuthField
              label="Date of Birth"
              iconName="calendar-outline"
              value={dateOfBirth}
              placeholder="mm/dd/yyyy"
              optional
              onChangeText={(value) => setDateOfBirth(formatBirthDateInput(value))}
              keyboardType="number-pad"
              maxLength={10}
            />

            <AuthSelectField
              label="Gender"
              iconName="person-outline"
              value={displayGender}
              placeholder="Select your gender"
              optional
              onPress={() => setShowGenderPicker(true)}
            />

            <AuthField
              label="Address"
              iconName="location-outline"
              placeholder="Address"
              value={address}
              onChangeText={(value) => setAddress(capitalizeWords(value))}
              autoCapitalize="words"
              optional
            />
          </View>
        </View>

        <View style={styles.termsCard}>
          <TouchableOpacity
            style={[styles.checkbox, agreeTerms && styles.checkboxChecked]}
            onPress={() => setAgreeTerms(!agreeTerms)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreeTerms }}
          >
            {agreeTerms ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
          </TouchableOpacity>
          <Text style={styles.termsText}>
            By signing up you agree with our{' '}
            <Text style={styles.termsHighlight} onPress={() => setShowTermsModal(true)}>
              Terms of Use
            </Text>
          </Text>
        </View>

        <TouchableOpacity style={authStyles.primaryButton} onPress={onRegister} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={authStyles.primaryButtonText}>Create Account</Text>
          )}
        </TouchableOpacity>

        <View style={authStyles.dividerRow}>
          <View style={authStyles.dividerLine} />
          <View style={authStyles.dividerPill}>
            <Text style={authStyles.dividerText}>OR CONTINUE WITH</Text>
          </View>
          <View style={authStyles.dividerLine} />
        </View>

        <TouchableOpacity style={authStyles.socialButton} onPress={onGoogleLogin}>
          <View style={authStyles.socialIconWrap}>
            <Ionicons name="logo-google" size={18} color="#DB4437" />
          </View>
          <Text style={authStyles.socialButtonText}>Continue with Google</Text>
        </TouchableOpacity>

        <View style={styles.footerWrap}>
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/login' } as any)}
            style={styles.footerButton}
          >
            <Text style={authStyles.footerText}>
              Already have an account? <Text style={authStyles.footerTextStrong}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </AuthLayout>

      <Modal
        visible={showGenderPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowGenderPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Gender</Text>
            {GENDER_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={styles.modalOption}
                onPress={() => {
                  setGender(option.value);
                  setShowGenderPicker(false);
                }}
              >
                <View style={styles.genderOptionCopy}>
                  <Ionicons name={option.icon as any} size={20} color={authColors.primary} />
                  <Text style={styles.modalOptionText}>{option.label}</Text>
                </View>
                {gender === option.value ? (
                  <Ionicons name="checkmark-circle" size={20} color={authColors.primary} />
                ) : null}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowGenderPicker(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showTermsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTermsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Terms of Use</Text>
            <Text style={styles.termsModalText}>
              IntakeSync helps you track wellness routines and reminders. It is not medical advice and does not replace care from a qualified professional. Keep your account information accurate and use the app responsibly.
            </Text>
            <TouchableOpacity
              style={styles.modalConfirm}
              onPress={() => setShowTermsModal(false)}
            >
              <Text style={styles.modalConfirmText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  termsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DFE7F3',
    borderRadius: 18,
    backgroundColor: '#F9FBFF',
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 18,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#C9D4E6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    backgroundColor: '#FFFFFF',
  },
  checkboxChecked: {
    backgroundColor: authColors.primary,
    borderColor: authColors.primary,
  },
  termsText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: authColors.textMuted,
  },
  termsHighlight: {
    color: authColors.link,
    fontWeight: '700',
  },
  footerWrap: {
    marginTop: 10,
  },
  footerButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.34)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    maxWidth: 460,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E3EAF5',
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 20,
    ...authShadows.card,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: authColors.text,
    textAlign: 'center',
    marginBottom: 18,
  },
  modalOption: {
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E3EAF5',
    backgroundColor: '#FAFCFF',
    paddingHorizontal: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: authColors.text,
  },
  genderOptionCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalCancel: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E3EAF5',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: authColors.text,
  },
  termsModalText: {
    color: authColors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 18,
    textAlign: 'center',
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
  datePickerCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E3EAF5',
    backgroundColor: '#F9FBFF',
    padding: 12,
    marginBottom: 14,
  },
  datePickerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    height: 208,
  },
  dateColumn: {
    flex: 1,
    marginHorizontal: 4,
  },
  dateLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: authColors.textSoft,
    textAlign: 'center',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  dateScroll: {
    maxHeight: 184,
  },
  dateOption: {
    minHeight: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  dateOptionText: {
    fontSize: 16,
    color: authColors.textMuted,
  },
  dateOptionTextSelected: {
    color: authColors.primary,
    fontWeight: '800',
    fontSize: 17,
  },
  modalConfirm: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: authColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    ...authShadows.button,
  },
  modalConfirmText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
