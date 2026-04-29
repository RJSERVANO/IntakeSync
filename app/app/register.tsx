import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as api from './api';
import { hasValidCachedSession, saveCachedSession } from '../services/offlineStorage';
import { AuthField, AuthSelectField } from '../components/auth/AuthField';
import { AuthLayout } from '../components/auth/AuthLayout';
import { authColors, authStyles, authShadows } from '../components/auth/authStyles';
import { useGoogleAuth } from '../hooks/useGoogleAuth';

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
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signInWithGoogle } = useGoogleAuth();

  const displayGender = gender
    ? gender.replace(/\b\w/g, (letter) => letter.toUpperCase())
    : '';

  const displayEmail = email ? email.charAt(0).toUpperCase() + email.slice(1) : '';

  async function onRegister() {
    if (!name || !email || !password || !confirmPassword) {
      Alert.alert('Validation', 'Please fill all required fields');
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
    if (!agreeTerms) {
      Alert.alert('Validation', 'Please agree to Terms of Use');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/register', {
        name,
        email,
        password,
        password_confirmation: confirmPassword,
        phone: phone || null,
        date_of_birth: dateOfBirth || null,
        gender: gender || null,
        address: address || null,
      });
      if (!hasValidCachedSession({ token: res?.token })) {
        Alert.alert('Registration Error', 'Registration succeeded but no valid session token was returned. Please sign in.');
        router.replace({ pathname: '/login' } as any);
        return;
      }
      await saveCachedSession({ token: res.token, user: res.user });

      if (!res.onboarding_completed) {
        router.replace({
          pathname: '/onboarding',
          params: { token: res.token, name: res.user?.name || name },
        } as any);
      } else {
        router.replace({ pathname: '/home', params: { token: res.token } } as any);
      }
    } catch (err: any) {
      console.log('register error', err);
      if (api.isNetworkError(err)) {
        Alert.alert('Offline', 'Internet connection required for first-time login.');
        return;
      }
      const message = err?.data?.message || err?.data || err?.message || 'Registration failed';
      Alert.alert('Error', typeof message === 'string' ? message : JSON.stringify(message));
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
        Alert.alert('Registration Error', 'No valid session token was returned. Please sign in.');
        router.replace({ pathname: '/login' } as any);
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
      console.log('google register error', err);
      if (api.isNetworkError(err)) {
        Alert.alert('Offline', 'Internet connection required for first-time login.');
        return;
      }
      const message =
        err?.data?.message || err?.data || err?.message || 'Google sign-in failed';
      Alert.alert('Error', typeof message === 'string' ? message : JSON.stringify(message));
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
              onChangeText={setName}
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
              placeholder="Phone number"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              optional
            />

            <AuthSelectField
              label="Date of Birth"
              iconName="calendar-outline"
              value={dateOfBirth}
              placeholder="Choose your birth date"
              optional
              onPress={() => setShowDatePicker(true)}
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
              onChangeText={setAddress}
              optional
            />
          </View>
        </View>

        <TouchableOpacity style={styles.termsCard} onPress={() => setAgreeTerms(!agreeTerms)}>
          <View style={[styles.checkbox, agreeTerms && styles.checkboxChecked]}>
            {agreeTerms ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
          </View>
          <Text style={styles.termsText}>
            By signing up you agree with our <Text style={styles.termsHighlight}>Terms of Use</Text>
          </Text>
        </TouchableOpacity>

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
            {['male', 'female', 'other'].map((option) => (
              <TouchableOpacity
                key={option}
                style={styles.modalOption}
                onPress={() => {
                  setGender(option);
                  setShowGenderPicker(false);
                }}
              >
                <Text style={styles.modalOptionText}>
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </Text>
                {gender === option ? (
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
        visible={showDatePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Date of Birth</Text>
            <View style={styles.datePickerCard}>
              <View style={styles.datePickerContainer}>
                <View style={styles.dateColumn}>
                  <Text style={styles.dateLabel}>Year</Text>
                  <ScrollView style={styles.dateScroll} showsVerticalScrollIndicator={false}>
                    {Array.from({ length: 100 }, (_, i) => new Date().getFullYear() - i).map((year) => (
                      <TouchableOpacity
                        key={year}
                        style={styles.dateOption}
                        onPress={() => {
                          const newDate = new Date(selectedDate);
                          newDate.setFullYear(year);
                          setSelectedDate(newDate);
                        }}
                      >
                        <Text
                          style={[
                            styles.dateOptionText,
                            selectedDate.getFullYear() === year && styles.dateOptionTextSelected,
                          ]}
                        >
                          {year}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                <View style={styles.dateColumn}>
                  <Text style={styles.dateLabel}>Month</Text>
                  <ScrollView style={styles.dateScroll} showsVerticalScrollIndicator={false}>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                      <TouchableOpacity
                        key={month}
                        style={styles.dateOption}
                        onPress={() => {
                          const newDate = new Date(selectedDate);
                          newDate.setMonth(month - 1);
                          setSelectedDate(newDate);
                        }}
                      >
                        <Text
                          style={[
                            styles.dateOptionText,
                            selectedDate.getMonth() + 1 === month &&
                              styles.dateOptionTextSelected,
                          ]}
                        >
                          {month.toString().padStart(2, '0')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                <View style={styles.dateColumn}>
                  <Text style={styles.dateLabel}>Day</Text>
                  <ScrollView style={styles.dateScroll} showsVerticalScrollIndicator={false}>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                      <TouchableOpacity
                        key={day}
                        style={styles.dateOption}
                        onPress={() => {
                          const newDate = new Date(selectedDate);
                          newDate.setDate(day);
                          setSelectedDate(newDate);
                        }}
                      >
                        <Text
                          style={[
                            styles.dateOptionText,
                            selectedDate.getDate() === day && styles.dateOptionTextSelected,
                          ]}
                        >
                          {day.toString().padStart(2, '0')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={styles.modalConfirm}
              onPress={() => {
                const year = selectedDate.getFullYear();
                const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
                const day = String(selectedDate.getDate()).padStart(2, '0');
                setDateOfBirth(`${year}-${month}-${day}`);
                setShowDatePicker(false);
              }}
            >
              <Text style={styles.modalConfirmText}>Confirm</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowDatePicker(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
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
