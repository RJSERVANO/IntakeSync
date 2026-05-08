import React, { useEffect, useState } from 'react';
import { View, Text, Modal, SafeAreaView, ScrollView, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as api from '../../../api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { calculatePersonalizedHydrationGoal } from '../../../../utils/hydrationHelpers';
import ThemedNoticeModal, { ThemedNoticeType } from '../../common/ThemedNoticeModal';
import { writeProfileCache } from '../../../../services/offlineStorage';
import {
  capitalizeWords,
  formatBackendBirthDateForInput,
  formatBirthDateInput,
  normalizePhilippineMobile,
  parseBirthDate,
} from '../../../../utils/profileValidation';

interface Props {
  visible: boolean;
  onClose: () => void;
  token?: string;
  user: any;
  onSaved: (updated: any) => void;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function buildEditableUser(user: any) {
  return {
    ...(user || {}),
    date_of_birth: user?.date_of_birth ? formatBackendBirthDateForInput(String(user.date_of_birth)) : '',
  };
}

export default function EditProfileModal({ visible, onClose, token, user, onSaved }: Props) {
  const [editData, setEditData] = useState<any>(buildEditableUser(user));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: ThemedNoticeType; title: string; message: string } | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    setEditData(buildEditableUser(user));
  }, [visible, user]);

  const updateField = (field: string, value: string) => {
    setEditData((prev: any) => ({ ...prev, [field]: value }));
  };

  const validateWeight = () => {
    if (editData.weight === undefined || editData.weight === null || editData.weight === '') return null;

    const weight = Number(editData.weight);
    if (!Number.isFinite(weight)) {
      return 'Weight must be a number.';
    }

    const unit = editData.weight_unit === 'lbs' ? 'lbs' : 'kg';
    if (unit === 'kg' && (weight < 20 || weight > 250)) {
      return 'Weight in kg must be between 20 and 250.';
    }
    if (unit === 'lbs' && (weight < 44 || weight > 550)) {
      return 'Weight in lbs must be between 44 and 550.';
    }

    return null;
  };

  const saveChanges = async () => {
    try {
      if (!editData.name?.trim()) {
        setNotice({ type: 'warning', title: 'Validation Error', message: 'Full name is required.' });
        return;
      }
      if (!editData.email?.trim()) {
        setNotice({ type: 'warning', title: 'Validation Error', message: 'Email is required.' });
        return;
      }
      if (!emailPattern.test(editData.email.trim())) {
        setNotice({ type: 'warning', title: 'Validation Error', message: 'Enter a valid email address.' });
        return;
      }

      const weightError = validateWeight();
      if (weightError) {
        setNotice({ type: 'warning', title: 'Validation Error', message: weightError });
        return;
      }

      const normalizedPhone = editData.phone?.trim() ? normalizePhilippineMobile(editData.phone) : null;
      if (editData.phone?.trim() && !normalizedPhone) {
        setNotice({ type: 'warning', title: 'Validation Error', message: 'Enter a valid Philippine mobile number.' });
        return;
      }

      const birthDateForBackend = editData.date_of_birth?.trim() ? parseBirthDate(editData.date_of_birth) : null;
      if (editData.date_of_birth?.trim() && !birthDateForBackend) {
        setNotice({
          type: 'warning',
          title: 'Validation Error',
          message: 'Use mm/dd/yyyy with a real date. You must be between 13 and 120 years old.',
        });
        return;
      }

      setSaving(true);

      if (!token) {
        setNotice({ type: 'warning', title: 'Internet Required', message: 'You need to connect to the internet to update your profile.' });
        setSaving(false);
        return;
      }

      const weightValue =
        editData.weight === undefined || editData.weight === null || editData.weight === ''
          ? null
          : Number(editData.weight);

      const weightForGoal = Number.isFinite(weightValue) ? Number(weightValue) : undefined;
      const hydrationProfile = {
        weight: weightForGoal,
        weight_unit: editData.weight_unit || undefined,
        climate: editData.climate || undefined,
        exercise_frequency: editData.exercise_frequency || undefined,
      };
      const hydrationGoal = calculatePersonalizedHydrationGoal(hydrationProfile);

      const payload = {
        name: editData.name.trim(),
        nickname: editData.nickname?.trim() || null,
        email: editData.email.trim(),
        phone: normalizedPhone,
        date_of_birth: birthDateForBackend,
        address: editData.address?.trim() || null,
        climate: editData.climate || null,
        exercise_frequency: editData.exercise_frequency || null,
        weight: Number.isFinite(weightValue) ? weightValue : null,
        weight_unit: editData.weight_unit || null,
        daily_hydration_goal: hydrationGoal,
        hydration_goal: hydrationGoal,
      };

      let updated = { ...(user || {}), ...payload };
      try {
        const resp = await api.put('/me', payload, token as string);
        updated = resp?.user ? { ...(user || {}), ...(resp.user || {}) } : updated;
      } catch (err: any) {
        if (api.isNetworkError(err)) {
          setNotice({ type: 'warning', title: 'Internet Required', message: 'You need to connect to the internet to update your profile.' });
          return;
        }
        throw err;
      }
      await writeProfileCache(updated);
      onSaved(updated);
      onClose();
      if (!notice) setNotice({ type: 'success', title: 'Profile Updated', message: 'Your profile changes have been saved successfully.' });
    } catch (err: any) {
      console.error('EditProfileModal saveChanges', err);
      setNotice({ type: 'error', title: 'Update Failed', message: err.data?.message || err.message || 'We could not save your changes. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
        <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalSheet}>
          <View style={styles.handle} />
          <View style={styles.modalHeader}>
            <TouchableOpacity style={styles.headerButton} onPress={onClose} disabled={saving}>
              <Ionicons name="close" size={22} color="#475569" />
            </TouchableOpacity>
            <View style={styles.headerTextWrap}>
              <Text style={styles.modalTitle}>Edit Profile</Text>
              <Text style={styles.modalSubtitle}>Update account details and hydration preferences.</Text>
            </View>
            <TouchableOpacity style={[styles.headerButton, styles.saveIconButton, saving && styles.disabled]} onPress={saveChanges} disabled={saving}>
              <Ionicons name="checkmark" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.modalContent}
            contentContainerStyle={[styles.formContent, { paddingBottom: Math.max(insets.bottom + 28, 48) }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.sectionHeader}>Account</Text>
            <View style={styles.card}>
              <Field label="Full Name *" value={editData.name || ''} onChangeText={(value) => updateField('name', value)} placeholder="Enter full name" />
              <Field label="Nickname" value={editData.nickname || ''} onChangeText={(value) => updateField('nickname', value)} placeholder="What should we call you?" />
              <Field label="Email *" value={editData.email || ''} onChangeText={(value) => updateField('email', value)} placeholder="Enter email" keyboardType="email-address" />
              <Field label="Phone" value={editData.phone || ''} onChangeText={(value) => updateField('phone', value)} placeholder="09123456789" keyboardType="phone-pad" />
              <Field
                label="Date of Birth"
                value={editData.date_of_birth || ''}
                onChangeText={(value) => updateField('date_of_birth', formatBirthDateInput(value))}
                placeholder="mm/dd/yyyy"
                keyboardType="number-pad"
                maxLength={10}
              />
              <Field
                label="Address"
                value={editData.address || ''}
                onChangeText={(value) => updateField('address', capitalizeWords(value))}
                placeholder="Enter address"
                multiline
              />
            </View>

            <Text style={styles.sectionHeader}>Hydration Profile</Text>
            <View style={styles.card}>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Weight</Text>
                <View style={styles.weightRow}>
                  <TextInput
                    style={[styles.input, styles.weightInput]}
                    value={editData.weight !== undefined && editData.weight !== null ? String(editData.weight) : ''}
                    onChangeText={(value) => updateField('weight', value)}
                    placeholder="e.g., 70"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                  />
                  <Segmented
                    options={['kg', 'lbs']}
                    value={editData.weight_unit || 'kg'}
                    onChange={(value) => updateField('weight_unit', value)}
                  />
                </View>
              </View>

              <ChoiceGroup
                label="Climate"
                options={['hot', 'temperate', 'cold']}
                value={editData.climate || ''}
                onChange={(value) => updateField('climate', value)}
              />
              <ChoiceGroup
                label="Exercise Frequency"
                options={['rarely', 'sometimes', 'regularly', 'often']}
                value={editData.exercise_frequency || ''}
                onChange={(value) => updateField('exercise_frequency', value)}
              />
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.cancelButton} onPress={onClose} disabled={saving}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveButton, saving && styles.disabled]} onPress={saveChanges} disabled={saving}>
                <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
        </SafeAreaView>
      </Modal>
      <ThemedNoticeModal
        visible={!!notice}
        type={notice?.type || 'info'}
        title={notice?.title || ''}
        message={notice?.message || ''}
        primaryText="OK"
        onPrimary={() => setNotice(null)}
        onClose={() => setNotice(null)}
      />
    </>
  );
}

function Field(props: {
  label: string;
  value: string;
  placeholder: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'number-pad';
  maxLength?: number;
  multiline?: boolean;
}) {
  return (
    <View style={styles.formGroup}>
      <Text style={styles.formLabel}>{props.label}</Text>
      <TextInput
        style={[styles.input, props.multiline && styles.textArea]}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor="#94A3B8"
        keyboardType={props.keyboardType || 'default'}
        maxLength={props.maxLength}
        multiline={props.multiline}
        numberOfLines={props.multiline ? 3 : 1}
      />
    </View>
  );
}

function Segmented({ options, value, onChange }: { options: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => (
        <TouchableOpacity key={option} style={[styles.segment, value === option && styles.segmentActive]} onPress={() => onChange(option)}>
          <Text style={[styles.segmentText, value === option && styles.segmentTextActive]}>{option.toUpperCase()}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function ChoiceGroup({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <View style={styles.formGroup}>
      <Text style={styles.formLabel}>{label}</Text>
      <View style={styles.choiceRow}>
        {options.map((option) => (
          <TouchableOpacity key={option} style={[styles.choicePill, value === option && styles.choicePillActive]} onPress={() => onChange(option)}>
            <Text style={[styles.choiceText, value === option && styles.choiceTextActive]}>{option}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    height: '88%',
    maxHeight: '94%',
    minHeight: 560,
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
  },
  handle: {
    width: 42,
    height: 4,
    borderRadius: 4,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 10,
    gap: 10,
  },
  headerButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  saveIconButton: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '700',
    marginTop: 2,
  },
  modalContent: {
    flex: 1,
  },
  formContent: {
    paddingHorizontal: 20,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 10,
    marginTop: 8,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  formGroup: {
    marginBottom: 15,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: '#0F172A',
  },
  textArea: {
    minHeight: 86,
    textAlignVertical: 'top',
  },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  weightInput: {
    flex: 1,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 14,
    padding: 3,
  },
  segment: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 11,
  },
  segmentActive: {
    backgroundColor: '#2563EB',
  },
  segmentText: {
    color: '#475569',
    fontWeight: '900',
    fontSize: 12,
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choicePill: {
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  choicePillActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },
  choiceText: {
    color: '#475569',
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  choiceTextActive: {
    color: '#2563EB',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  cancelButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  saveButton: {
    flex: 1.3,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: '#2563EB',
  },
  cancelText: {
    color: '#475569',
    fontWeight: '900',
    fontSize: 15,
  },
  saveText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 15,
  },
  disabled: {
    opacity: 0.55,
  },
});
