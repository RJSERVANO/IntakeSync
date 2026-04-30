import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Dimensions, TextInput, BackHandler } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as api from './api';
import { calculatePersonalizedHydrationGoal } from '../utils/hydrationHelpers';
import { notificationService } from '../services/notificationService';
import ThemedNoticeModal, { ThemedNoticeType } from './components/common/ThemedNoticeModal';

const { height } = Dimensions.get('window');

interface OnboardingData {
  nickname?: string;
  climate?: 'hot' | 'temperate' | 'cold';
  exercise_frequency?: 'rarely' | 'sometimes' | 'regularly' | 'often';
  weight?: number;
  weight_unit?: 'kg' | 'lbs';
  notification_permissions_accepted?: boolean;
  daily_hydration_goal?: number;
  hydration_goal?: number;
}

export default function Onboarding() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const token = params.token as string;

  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<OnboardingData>({});
  const [weightInput, setWeightInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [noticeModal, setNoticeModal] = useState<{
    type: ThemedNoticeType;
    title: string;
    message: string;
  } | null>(null);

  const steps = [
    'nickname',
    'welcome',
    'weight',
    'climate',
    'exercise',
    'notifications',
    'medication-setup-prompt',
    'complete'
  ];

  const selectedWeightUnit = data.weight_unit === 'lbs' ? 'lbs' : 'kg';
  const estimatedHydrationGoal = calculatePersonalizedHydrationGoal(data);

  // Load saved data on mount
  useEffect(() => {
    const loadSavedData = async () => {
      try {
        if (token) {
          const saved = await api.get('/onboarding', token);
          if (saved && typeof saved === 'object') {
            // Extract the data object if nested
            const dataToLoad = saved.data || saved;
            const normalizedData: any = { ...dataToLoad };

            setData(prev => ({ ...prev, ...normalizedData }));
            if (normalizedData.weight !== undefined && normalizedData.weight !== null) {
              setWeightInput(String(normalizedData.weight));
            }
          }
        }
      } catch (err) {
        // Endpoint might not exist yet, which is fine
        console.log('Note: Could not load saved onboarding data (this is normal if starting fresh):', err);
      }
    };
    loadSavedData();
  }, [token]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (currentStep > 0) {
        setCurrentStep(prev => Math.max(0, prev - 1));
        return true;
      }

      return true;
    });

    return () => subscription.remove();
  }, [currentStep]);

  const updateData = (key: keyof OnboardingData, value: any) => {
    setData(prev => ({ ...prev, [key]: value }));
  };

  const showNotice = (type: ThemedNoticeType, title: string, message: unknown) => {
    setNoticeModal({
      type,
      title,
      message: typeof message === 'string' ? message : JSON.stringify(message),
    });
  };

  const normalizeWeightText = (value: string) => {
    const cleaned = value.replace(/[^0-9.]/g, '');
    const [whole, ...decimalParts] = cleaned.split('.');
    const decimal = decimalParts.join('');
    return decimalParts.length > 0 ? `${whole}.${decimal}` : whole;
  };

  const updateWeightInput = (value: string) => {
    const normalized = normalizeWeightText(value);
    setWeightInput(normalized);

    if (!normalized || normalized === '.') {
      updateData('weight', undefined);
      return;
    }

    const numericWeight = Number(normalized);
    updateData('weight', Number.isFinite(numericWeight) ? numericWeight : undefined);
  };

  const updateWeightUnit = (unit: 'kg' | 'lbs') => {
    updateData('weight_unit', unit);
  };

  const getWeightRange = (unit = selectedWeightUnit) => {
    return unit === 'lbs'
      ? { min: 44, max: 550, label: '44 and 550 lbs' }
      : { min: 20, max: 250, label: '20 and 250 kg' };
  };

  const isValidWeight = () => {
    if (!weightInput.trim() || weightInput === '.') return false;
    const numericWeight = Number(weightInput);
    const range = getWeightRange();
    return Number.isFinite(numericWeight) && numericWeight >= range.min && numericWeight <= range.max;
  };

  const getPayloadData = () => {
    const typedWeight = Number(weightInput);
    const range = getWeightRange();
    const hasTypedWeight = Number.isFinite(typedWeight) && typedWeight >= range.min && typedWeight <= range.max;
    return hasTypedWeight
      ? { ...data, weight: typedWeight, weight_unit: selectedWeightUnit }
      : data;
  };

  const buildOnboardingPayload = () => {
    const payloadData = getPayloadData();
    const calculatedGoal = calculatePersonalizedHydrationGoal(payloadData);
    return {
      nickname: payloadData.nickname,
      weight: payloadData.weight,
      weight_unit: payloadData.weight_unit || 'kg',
      climate: payloadData.climate,
      exercise_frequency: payloadData.exercise_frequency,
      notification_permissions_accepted: payloadData.notification_permissions_accepted,
      daily_hydration_goal: calculatedGoal,
    };
  };

  const nextStep = async () => {
    if (currentStep < steps.length - 1) {
      if (steps[currentStep] === 'weight') {
        if (!isValidWeight()) {
          showNotice('warning', 'Invalid Weight', `Please enter a valid weight between ${getWeightRange().label}.`);
          return;
        }
        updateData('weight', Number(weightInput));
        updateData('weight_unit', selectedWeightUnit);
      }

      const saveSteps = ['nickname', 'weight', 'climate', 'exercise', 'notifications'];
      if (saveSteps.includes(steps[currentStep])) {
        try {
          await api.put('/onboarding/update', buildOnboardingPayload(), token);
        } catch (err) {
          console.log('Error saving onboarding data:', err);
        }
      }
      setCurrentStep(currentStep + 1);
    } else {
      await completeOnboarding();
    }
  };

  const skipStep = () => {
    if (steps[currentStep] === 'notifications') {
      updateData('notification_permissions_accepted', false);
    }
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeOnboarding();
    }
  };

  const requestNotificationPermission = async () => {
    try {
      const granted = await notificationService.requestPermissions();
      const nextData = { ...data, notification_permissions_accepted: granted };
      setData(nextData);
      await api.put('/onboarding/update', {
        ...buildOnboardingPayload(),
        notification_permissions_accepted: granted,
      }, token);
      if (granted) {
        showNotice('success', 'Reminders enabled', 'Hydration and medication reminders can now appear on this device.');
      } else {
        showNotice('warning', 'Notifications Disabled', 'You can still use IntakeSync, but reminders may not appear until notifications are enabled.');
      }
      setCurrentStep(currentStep + 1);
    } catch (err) {
      console.log('Notification permission request failed:', err);
      showNotice('warning', 'Notifications Disabled', 'You can still use IntakeSync, but reminders may not appear until notifications are enabled.');
      updateData('notification_permissions_accepted', false);
      setCurrentStep(currentStep + 1);
    }
  };

  const skipNotifications = async () => {
    try {
      updateData('notification_permissions_accepted', false);
      await api.put('/onboarding/update', {
        ...buildOnboardingPayload(),
        notification_permissions_accepted: false,
      }, token);
    } catch (err) {
      console.log('Error saving reminder preference:', err);
    } finally {
      setCurrentStep(currentStep + 1);
    }
  };

  const openMedicationSetup = async () => {
    try {
      setLoading(true);
      await api.put('/onboarding/update', buildOnboardingPayload(), token);
      setCurrentStep(steps.length - 1);
      router.push({
        pathname: '/components/pages/medication/Medication',
        params: { token, fromOnboarding: '1' },
      } as any);
    } catch (err: any) {
      console.log('Error opening medication setup:', err);
      const message = err?.data?.message || err?.message || 'Could not open medication setup right now.';
      showNotice('error', 'Medication Setup', message);
    } finally {
      setLoading(false);
    }
  };

  const completeOnboarding = async () => {
    try {
      setLoading(true);
      // Save any remaining data first
      if (Object.keys(data).length > 0) {
        try {
          await api.put('/onboarding/update', buildOnboardingPayload(), token);
        } catch (updateErr) {
          console.log('Error updating onboarding data:', updateErr);
          // Continue even if update fails
        }
      }
      // Mark onboarding as complete
      await api.post(
        '/onboarding/complete',
        { daily_hydration_goal: calculatePersonalizedHydrationGoal(getPayloadData()) },
        token
      );
      router.replace({ pathname: '/home', params: { token } } as any);
    } catch (err: any) {
      console.log('Error completing onboarding:', err);
      const message = err?.data?.message || err?.data || err?.message || 'Failed to complete onboarding';
      showNotice('error', 'Onboarding Failed', message);
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (steps[currentStep]) {
      case 'nickname':
        return (
          <View style={styles.stepContainer}>
            <View style={[styles.iconContainer, styles.heroIconWarm]}>
              <Ionicons name="sunny" size={64} color="#F5A623" />
            </View>
            <Text style={styles.title}>To start with, what should we call you?</Text>
            <Text style={styles.description}>This keeps your Home greeting personal without adding extra setup.</Text>
            <View style={styles.inputShell}>
              <Ionicons name="person-outline" size={20} color="#2563EB" />
              <TextInput
                style={styles.input}
                placeholder="Nickname"
                placeholderTextColor="#94A3B8"
                value={data.nickname || ''}
                onChangeText={(text) => updateData('nickname', text)}
                autoFocus
              />
            </View>
            <View style={styles.buttonRow}>
              <TouchableOpacity onPress={skipStep} style={styles.skipButton}>
                <Text style={styles.skipButtonText}>Skip for now</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={nextStep} style={styles.nextButton}>
                <Text style={styles.nextButtonText}>Next</Text>
              </TouchableOpacity>
            </View>
          </View>
        );

      case 'welcome':
        return (
          <View style={styles.stepContainer}>
            <View style={[styles.iconContainer, styles.heroIconBlue]}>
              <Ionicons name="sparkles-outline" size={58} color="#2563EB" />
            </View>
            <Text style={styles.title}>Nice to meet you, {data.nickname || 'there'}!</Text>
            <Text style={styles.description}>
              IntakeSync will personalize hydration and reminders from a few quick choices.
            </Text>
            <TouchableOpacity onPress={nextStep} style={styles.primaryButton}>
              <View style={styles.buttonWithIcon}>
                <Text style={styles.primaryButtonText}>Let&apos;s go</Text>
                <Ionicons name="hand-right-outline" size={20} color="#fff" style={{ marginLeft: 8 }} />
              </View>
            </TouchableOpacity>
          </View>
        );

      case 'climate':
        return (
          <View style={styles.stepContainer}>
            <View style={styles.infoBox}>
              <View style={styles.infoIcon}>
                <Ionicons name="water-outline" size={18} color="#2563EB" />
              </View>
              <Text style={styles.infoText}>
                We&apos;ll estimate your daily water goal from your weight, climate, and activity level. You can adjust it later.
              </Text>
            </View>
            <Text style={styles.title}>What climate are you usually in?</Text>
            <View style={styles.optionsContainer}>
              {[
                { value: 'hot', label: 'Hot', icon: 'sunny-outline', color: '#F97316', hint: 'Adds more to your goal' },
                { value: 'temperate', label: 'Temperate', icon: 'leaf-outline', color: '#10B981', hint: 'Balanced baseline' },
                { value: 'cold', label: 'Cold', icon: 'snow-outline', color: '#2563EB', hint: 'Slightly lower estimate' },
              ].map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.climateOption, data.climate === option.value && styles.climateOptionSelected]}
                  onPress={() => updateData('climate', option.value as any)}
                >
                  <View style={[styles.optionIconBubble, { backgroundColor: `${option.color}18` }]}>
                    <Ionicons name={option.icon as any} size={22} color={option.color} />
                  </View>
                  <View style={styles.optionCopy}>
                    <Text style={[styles.climateText, data.climate === option.value && styles.climateTextSelected]}>
                      {option.label}
                    </Text>
                    <Text style={styles.optionHint}>{option.hint}</Text>
                  </View>
                  {data.climate === option.value && <Ionicons name="checkmark-circle" size={22} color="#2563EB" />}
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.buttonRow}>
              <TouchableOpacity onPress={skipStep} style={styles.skipButton}>
                <Text style={styles.skipButtonText}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={nextStep} style={styles.nextButton}>
                <Text style={styles.nextButtonText}>Next</Text>
              </TouchableOpacity>
            </View>
          </View>
        );

      case 'exercise':
        return (
          <View style={styles.stepContainer}>
            <View style={styles.infoBox}>
              <View style={styles.infoIcon}>
                <Ionicons name="fitness-outline" size={18} color="#2563EB" />
              </View>
              <Text style={styles.infoText}>
                We’ll estimate your daily water goal from your weight, climate, and activity level. You can adjust it later.
              </Text>
            </View>
            <Text style={styles.title}>How active are you most weeks?</Text>
            {[
              { value: 'rarely', label: 'Rarely exercise', icon: 'walk-outline' },
              { value: 'sometimes', label: 'Sometimes exercise', icon: 'bicycle-outline' },
              { value: 'regularly', label: 'Regularly exercise', icon: 'fitness-outline' },
              { value: 'often', label: 'Often exercise', icon: 'flash-outline' },
            ].map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[styles.exerciseOption, data.exercise_frequency === option.value && styles.exerciseOptionSelected]}
                onPress={() => updateData('exercise_frequency', option.value as any)}
              >
                <View style={[styles.optionIconBubble, data.exercise_frequency === option.value && styles.optionIconBubbleSelected]}>
                  <Ionicons name={option.icon as any} size={21} color={data.exercise_frequency === option.value ? '#2563EB' : '#64748B'} />
                </View>
                <Text style={[styles.exerciseText, data.exercise_frequency === option.value && styles.exerciseTextSelected]}>
                  {option.label}
                </Text>
                {data.exercise_frequency === option.value && <Ionicons name="checkmark-circle" size={22} color="#2563EB" />}
              </TouchableOpacity>
            ))}
            <View style={styles.goalPreviewCard}>
              <View style={styles.goalPreviewIcon}>
                <Ionicons name="water-outline" size={22} color="#2563EB" />
              </View>
              <View style={styles.goalPreviewCopy}>
                <Text style={styles.goalPreviewTitle}>Estimated daily water goal</Text>
                {data.weight ? (
                  <>
                    <Text style={styles.goalPreviewValue}>Estimated goal: {estimatedHydrationGoal} ml/day</Text>
                    <Text style={styles.goalPreviewText}>You can adjust this later in Beverage settings.</Text>
                  </>
                ) : (
                  <Text style={styles.goalPreviewText}>
                    We’ll use a standard 2,000 ml goal for now. You can adjust it later.
                  </Text>
                )}
              </View>
            </View>
            <View style={styles.buttonRow}>
              <TouchableOpacity onPress={skipStep} style={styles.skipButton}>
                <Text style={styles.skipButtonText}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={nextStep} style={styles.nextButton}>
                <Text style={styles.nextButtonText}>Next</Text>
              </TouchableOpacity>
            </View>
          </View>
        );

      case 'weight':
        return (
          <View style={styles.stepContainer}>
            <View style={styles.infoBox}>
              <View style={styles.infoIcon}>
                <Ionicons name="analytics-outline" size={18} color="#2563EB" />
              </View>
              <Text style={styles.infoText}>
                We’ll estimate your daily water goal from your weight, climate, and activity level. You can adjust it later.
              </Text>
            </View>
            <Text style={styles.title}>How much do you weigh?</Text>
            <Text style={styles.description}>Enter your weight so IntakeSync can estimate a hydration goal.</Text>
            <View style={styles.weightInputShell}>
              <Ionicons name="scale-outline" size={20} color="#2563EB" />
              <TextInput
                style={styles.weightInput}
                placeholder={`Enter weight in ${selectedWeightUnit}`}
                placeholderTextColor="#94A3B8"
                value={weightInput}
                onChangeText={updateWeightInput}
                keyboardType="numeric"
                returnKeyType="done"
                maxLength={6}
              />
              <View style={styles.weightUnitBadge}>
                <Text style={styles.weightUnitBadgeText}>{selectedWeightUnit}</Text>
              </View>
            </View>
            <View style={styles.unitSelector}>
              {(['kg', 'lbs'] as const).map((unit) => (
                <TouchableOpacity
                  key={unit}
                  style={[styles.unitButton, selectedWeightUnit === unit && styles.unitButtonSelected]}
                  onPress={() => updateWeightUnit(unit)}
                >
                  <Text style={[styles.unitText, selectedWeightUnit === unit && styles.unitTextSelected]}>{unit}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.buttonRow}>
              <TouchableOpacity onPress={nextStep} style={[styles.nextButton, styles.fullWidthButton]}>
                <Text style={styles.nextButtonText}>Next</Text>
              </TouchableOpacity>
            </View>
          </View>
        );

      case 'notifications':
        return (
          <View style={styles.stepContainer}>
            <View style={[styles.iconContainer, styles.heroIconBlue]}>
              <Ionicons name="notifications-outline" size={58} color="#2563EB" />
            </View>
            <Text style={styles.title}>Enable Reminders</Text>
            <Text style={styles.description}>IntakeSync uses notifications to remind you about hydration and medication schedules.</Text>
            <View style={styles.notificationSupportBox}>
              <Ionicons name="settings-outline" size={18} color="#2563EB" />
              <Text style={styles.notificationSupportText}>You can update this later in Notification Settings.</Text>
            </View>
            {data.notification_permissions_accepted === true && (
              <View style={styles.notificationSuccessBox}>
                <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                <Text style={styles.notificationSuccessText}>Reminders enabled</Text>
              </View>
            )}
            <TouchableOpacity 
              onPress={requestNotificationPermission}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>Enable reminders</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={skipNotifications} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Not now</Text>
            </TouchableOpacity>
          </View>
        );

      case 'medication-setup-prompt':
        return (
          <View style={styles.stepContainer}>
            <View style={[styles.iconContainer, styles.heroIconRed]}>
              <Ionicons name="medkit-outline" size={58} color="#DC2626" />
            </View>
            <Text style={styles.title}>Set up medication reminders?</Text>
            <Text style={styles.description}>You can add your medicines and reminder times now, or set them up later from the Medication tab.</Text>
            <TouchableOpacity onPress={openMedicationSetup} style={styles.primaryButton} disabled={loading}>
              <Text style={styles.primaryButtonText}>{loading ? 'Opening...' : 'Set up now'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={nextStep} style={styles.secondaryButton} disabled={loading}>
              <Text style={styles.secondaryButtonText}>I&apos;ll do it later</Text>
            </TouchableOpacity>
          </View>
        );

      case 'complete':
        return (
          <View style={styles.stepContainer}>
            <View style={styles.iconContainer}>
              <View style={styles.completeIcon}>
                <Ionicons name="checkmark" size={42} color="#FFFFFF" />
              </View>
            </View>
            <Text style={styles.title}>Your profile is created!</Text>
            <Text style={styles.description}>Your hydration goal is ready, and you can update reminders anytime.</Text>
            <TouchableOpacity onPress={() => completeOnboarding()} style={styles.primaryButton} disabled={loading}>
              <Text style={styles.primaryButtonText}>{loading ? 'Loading...' : 'Continue'}</Text>
            </TouchableOpacity>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.progressWrapper}>
        <View style={styles.progressContainer}>
          <View style={styles.progressBarBackground}>
            <View style={[styles.progressBarFill, { width: `${((currentStep + 1) / steps.length) * 100}%` }]} />
          </View>
          <Text style={styles.progressText}>{currentStep + 1} of {steps.length}</Text>
        </View>
      </View>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {renderStep()}
      </ScrollView>

      <ThemedNoticeModal
        visible={Boolean(noticeModal)}
        type={noticeModal?.type || 'info'}
        title={noticeModal?.title || ''}
        message={noticeModal?.message || ''}
        onPrimary={() => setNoticeModal(null)}
        onClose={() => setNoticeModal(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F8FC',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 28,
  },
  progressWrapper: {
    paddingTop: 54,
    paddingHorizontal: 18,
  },
  progressContainer: {
    alignItems: 'stretch',
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    padding: 12,
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  progressBarBackground: {
    width: '100%',
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#2563EB',
    borderRadius: 999,
  },
  progressText: {
    fontSize: 12,
    color: '#1E3A8A',
    fontWeight: '900',
    textAlign: 'right',
  },
  stepContainer: {
    justifyContent: 'center',
    minHeight: height * 0.64,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: 4,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    width: 86,
    height: 86,
    borderRadius: 43,
    marginBottom: 22,
  },
  heroIconBlue: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  heroIconOrange: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    shadowColor: '#F97316',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  heroIconRed: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  heroIconWarm: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  emoji: {
    fontSize: 80,
  },
  completeIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 6,
  },
  title: {
    fontSize: 25,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 31,
  },
  description: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 22,
    lineHeight: 22,
    fontWeight: '600',
  },
  inputShell: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 10,
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '700',
  },
  weightInputShell: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  weightInput: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 10,
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '800',
  },
  weightUnitBadge: {
    minWidth: 44,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignItems: 'center',
  },
  weightUnitBadgeText: {
    color: '#1E3A8A',
    fontSize: 14,
    fontWeight: '900',
  },
  nicknameInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  nicknameIcon: {
    marginRight: 12,
  },
  buttonWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    fontSize: 22,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 20,
    marginBottom: 16,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 24,
  },
  scrollContentInner: {
    padding: 20,
    paddingTop: 20,
  },
  timeInputButton: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeInputText: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '800',
  },
  timeInputPlaceholder: {
    color: '#8E8E93',
  },
  timeInputDefault: {
    color: '#A3A3A7',
  },
  pickerButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 17,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  pickerButtonText: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '800',
  },
  pickerPlaceholder: {
    color: '#8E8E93',
  },
  fieldRow: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 13,
    color: '#475569',
    marginBottom: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginTop: 24,
  },
  contactPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  contactPickerText: {
    color: '#1E3A8A',
    fontSize: 15,
    fontWeight: '600',
  },
  skipButton: {
    flex: 1,
    paddingVertical: 15,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  skipButtonText: {
    color: '#6B7280',
    fontSize: 16,
  },
  nextButton: {
    flex: 1,
    backgroundColor: '#2563EB',
    paddingVertical: 16,
    paddingHorizontal: 22,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  fullWidthButton: {
    flex: 1,
  },
  primaryButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 17,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 20,
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  secondaryButtonText: {
    color: '#1E3A8A',
    fontSize: 16,
    fontWeight: '900',
  },
  infoBox: {
    backgroundColor: '#EFF6FF',
    padding: 16,
    borderRadius: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  infoIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: {
    flex: 1,
    color: '#334155',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  notificationSupportBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#F8FBFF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginBottom: 12,
  },
  notificationSupportText: {
    flex: 1,
    color: '#334155',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  notificationSuccessBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginBottom: 4,
  },
  notificationSuccessText: {
    color: '#047857',
    fontSize: 14,
    fontWeight: '900',
  },
  highlight: {
    color: '#2563EB',
    fontWeight: '600',
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  optionButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  optionButtonSelected: {
    backgroundColor: '#1E3A8A',
    borderColor: '#1E3A8A',
  },
  optionText: {
    color: '#6B7280',
    fontSize: 14,
  },
  optionTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  optionsContainer: {
    gap: 12,
    marginBottom: 20,
  },
  climateOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4,
    borderLeftColor: '#DBEAFE',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  climateOptionSelected: {
    borderColor: '#93C5FD',
    borderLeftColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  optionIconBubble: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  optionIconBubbleSelected: {
    backgroundColor: '#DBEAFE',
  },
  optionCopy: {
    flex: 1,
  },
  optionHint: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  climateText: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '500',
  },
  climateTextSelected: {
    color: '#2563EB',
    fontWeight: '600',
  },
  exerciseOption: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#DBEAFE',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  exerciseOptionSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#93C5FD',
    borderLeftColor: '#2563EB',
  },
  exerciseText: {
    flex: 1,
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '700',
  },
  exerciseTextSelected: {
    color: '#2563EB',
    fontWeight: '900',
  },
  unitSelector: {
    flexDirection: 'row',
    alignSelf: 'center',
    marginTop: 12,
    backgroundColor: '#E0ECFF',
    borderRadius: 12,
    padding: 4,
  },
  unitButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  unitButtonSelected: {
    backgroundColor: '#2563EB',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 5,
    elevation: 2,
  },
  unitText: {
    color: '#6B7280',
    fontSize: 14,
  },
  unitTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  hintText: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  optionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 12,
  },
  optionIconWrapSelected: {
    backgroundColor: '#DBEAFE',
    borderColor: '#BFDBFE',
  },
  goalPreviewCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 18,
    borderRadius: 18,
    backgroundColor: '#F8FBFF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderLeftWidth: 4,
    borderLeftColor: '#2563EB',
    marginTop: 8,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  goalPreviewIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
  },
  goalPreviewCopy: {
    flex: 1,
  },
  goalPreviewTitle: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '900',
  },
  goalPreviewValue: {
    color: '#2563EB',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 4,
  },
  goalPreviewText: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  // Tone selection styles
  toneOptionsContainer: {
    gap: 12,
    marginBottom: 20,
  },
  toneOption: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toneOptionSelected: {
    borderColor: '#1E3A8A',
    backgroundColor: '#EBF8FF',
  },
  toneOptionPlaying: {
    borderColor: '#3B82F6',
    backgroundColor: '#DBEAFE',
  },
  toneOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toneOptionText: {
    color: '#1F2937',
    fontSize: 16,
    fontWeight: '500',
  },
  toneOptionTextSelected: {
    color: '#1E3A8A',
    fontWeight: '600',
  },
  stopButton: {
    backgroundColor: '#EF4444',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  stopButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Modal styles for iOS time picker
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 34,
    maxHeight: height * 0.62,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#DBEAFE',
  },
  modalCancel: {
    color: '#64748B',
    fontSize: 15,
    fontWeight: '800',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  modalConfirm: {
    color: '#2563EB',
    fontSize: 15,
    fontWeight: '900',
  },
  dateTimePicker: {
    height: 200,
  },
  // Picker modal styles
  pickerScrollView: {
    maxHeight: 320,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  pickerItem: {
    paddingVertical: 14,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  pickerItemSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#93C5FD',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  pickerItemText: {
    fontSize: 18,
    color: '#334155',
    fontWeight: '800',
  },
  pickerItemTextSelected: {
    color: '#2563EB',
    fontWeight: '900',
  },
});
