import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, TextInput, Modal } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import * as api from '../../../api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ThemedNoticeModal, { ThemedNoticeType } from '../../common/ThemedNoticeModal';
import ScreenHeader from '../../common/ScreenHeader';
import { getPasswordRules, isStrongPassword, PASSWORD_POLICY_MESSAGE } from '../../../../utils/passwordPolicy';
import { getCachedSession } from '../../../../services/offlineStorage';
import { FONT_SCALE } from '../../../../utils/fontScaling';

export default function PrivacySecurity() {
  const { token } = useLocalSearchParams();
  const [cachedToken, setCachedToken] = useState<string | undefined>();
  const authToken = (token as string | undefined) || cachedToken;
  const insets = useSafeAreaInsets();
  const [modalVisible, setModalVisible] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ type: ThemedNoticeType; title: string; message: string } | null>(null);

  useEffect(() => {
    getCachedSession().then((session) => setCachedToken(session?.token)).catch(() => {});
  }, []);

  const closeModal = () => {
    setModalVisible(false);
    setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
  };

  const handleChangePassword = async () => {
    if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      setNotice({ type: 'warning', title: 'Missing Details', message: 'Please fill in all fields.' });
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setNotice({ type: 'warning', title: 'Password Mismatch', message: 'New passwords do not match.' });
      return;
    }

    if (!isStrongPassword(passwordData.newPassword)) {
      setNotice({ type: 'warning', title: 'Weak Password', message: PASSWORD_POLICY_MESSAGE });
      return;
    }

    try {
      setLoading(true);
      if (!authToken) {
        setNotice({ type: 'warning', title: 'Internet Required', message: 'You need to connect to the internet to change your password.' });
        return;
      }
      await api.post(
        '/me/change-password',
        {
          current_password: passwordData.currentPassword,
          new_password: passwordData.newPassword,
        },
        authToken
      );

      closeModal();
      setNotice({ type: 'success', title: 'Password Updated', message: 'Your password has been changed successfully.' });
    } catch (error: any) {
      if (api.isNetworkError(error)) {
        setNotice({ type: 'warning', title: 'Internet Required', message: 'You need to connect to the internet to change your password.' });
      } else {
        setNotice({ type: 'error', title: 'Update Failed', message: error?.data?.message || 'We could not change your password. Please try again.' });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Privacy & Security" subtitle="Manage account security and privacy information." showBackButton />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Account Security</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.settingItem} onPress={() => setModalVisible(true)}>
            <View style={styles.settingIcon}>
              <Ionicons name="key-outline" size={20} color="#2563EB" />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingTitle}>Change Password</Text>
              <Text style={styles.settingDescription}>Update your account password.</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
          </TouchableOpacity>
          <View style={styles.divider} />
          <View style={styles.settingItem}>
            <View style={[styles.settingIcon, styles.disabledIcon]}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#94A3B8" />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.disabledTitle}>Two-Factor Authentication</Text>
              <Text style={styles.settingDescription}>Not available yet.</Text>
            </View>
            <Text style={styles.badge}>Coming soon</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Data & Privacy</Text>
        <InfoCard
          icon="stats-chart-outline"
          title="Self-monitoring data"
          text="IntakeSync stores app data used for beverage tracking, hydration goals, and medication reminders."
        />
        <InfoCard
          icon="medical-outline"
          title="Not medical advice"
          text="IntakeSync supports personal tracking and reminders. It does not diagnose, treat, or replace professional medical advice."
        />
        <InfoCard
          icon="document-text-outline"
          title="Privacy practices"
          text="Review Help & Support for privacy and terms information."
        />

        <Text style={styles.sectionTitle}>App Permissions</Text>
        <View style={styles.card}>
          <InfoRow icon="notifications-outline" title="Notifications" text="Used for reminder alerts when enabled." />
          <View style={styles.divider} />
          <InfoRow icon="image-outline" title="Media Library" text="Used only when you upload a custom profile image." />
        </View>
      </ScrollView>

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={closeModal}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom + 16, 28) }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle} maxFontSizeMultiplier={FONT_SCALE.title}>Change Password</Text>
                <Text style={styles.modalSubtitle} maxFontSizeMultiplier={FONT_SCALE.description}>Use uppercase, lowercase, a number, and a symbol.</Text>
              </View>
              <TouchableOpacity style={styles.closeButton} onPress={closeModal} disabled={loading}>
                <Ionicons name="close" size={22} color="#475569" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalForm} showsVerticalScrollIndicator={false}>
              <PasswordField label="Current Password *" value={passwordData.currentPassword} onChangeText={(text) => setPasswordData({ ...passwordData, currentPassword: text })} />
              <PasswordField label="New Password *" value={passwordData.newPassword} onChangeText={(text) => setPasswordData({ ...passwordData, newPassword: text })} />
              <PasswordChecklist password={passwordData.newPassword} />
              <PasswordField label="Confirm New Password *" value={passwordData.confirmPassword} onChangeText={(text) => setPasswordData({ ...passwordData, confirmPassword: text })} />

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelButton} onPress={closeModal} disabled={loading}>
                  <Text style={styles.cancelText} maxFontSizeMultiplier={FONT_SCALE.button}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.saveButton, loading && styles.saveButtonDisabled]} onPress={handleChangePassword} disabled={loading}>
                  <Text style={styles.saveButtonText} maxFontSizeMultiplier={FONT_SCALE.button}>{loading ? 'Updating...' : 'Update Password'}</Text>
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
    </SafeAreaView>
  );
}

function InfoCard({ icon, title, text }: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }) {
  return (
    <View style={styles.infoCard}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={22} color="#2563EB" />
      </View>
      <View style={styles.infoContent}>
        <Text style={styles.infoTitle} maxFontSizeMultiplier={FONT_SCALE.title}>{title}</Text>
        <Text style={styles.infoText} maxFontSizeMultiplier={FONT_SCALE.description}>{text}</Text>
      </View>
    </View>
  );
}

function InfoRow({ icon, title, text }: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }) {
  return (
    <View style={styles.settingItem}>
      <View style={styles.settingIcon}>
        <Ionicons name={icon} size={20} color="#2563EB" />
      </View>
      <View style={styles.settingContent}>
        <Text style={styles.settingTitle} maxFontSizeMultiplier={FONT_SCALE.title}>{title}</Text>
        <Text style={styles.settingDescription} maxFontSizeMultiplier={FONT_SCALE.description}>{text}</Text>
      </View>
    </View>
  );
}

function PasswordField({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.formGroup}>
      <Text style={styles.label} maxFontSizeMultiplier={FONT_SCALE.description}>{label}</Text>
      <View style={styles.passwordInputRow}>
        <TextInput
          style={styles.passwordInput}
          placeholder="Enter password"
          placeholderTextColor="#94A3B8"
          secureTextEntry={!visible}
          value={value}
          onChangeText={onChangeText}
          autoCapitalize="none"
          autoCorrect={false}
          textAlignVertical="center"
          maxFontSizeMultiplier={FONT_SCALE.input}
        />
        <TouchableOpacity
          style={styles.passwordToggle}
          onPress={() => setVisible((current) => !current)}
          accessibilityLabel={visible ? `Hide ${label}` : `Show ${label}`}
          activeOpacity={0.75}
        >
          <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color="#64748B" />
        </TouchableOpacity>
      </View>
    </View>
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
          <Text style={[styles.passwordRuleText, rule.valid && styles.passwordRuleTextValid]} maxFontSizeMultiplier={FONT_SCALE.description}>
            {rule.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 56,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 10,
    marginTop: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 15,
    gap: 12,
  },
  settingIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledIcon: {
    backgroundColor: '#F1F5F9',
  },
  settingContent: {
    flex: 1,
    minWidth: 0,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 3,
  },
  disabledTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#94A3B8',
    marginBottom: 3,
  },
  settingDescription: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
    lineHeight: 18,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    padding: 16,
    gap: 12,
    marginBottom: 10,
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#1E40AF',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 13,
    color: '#1E40AF',
    lineHeight: 19,
    fontWeight: '600',
  },
  badge: {
    color: '#64748B',
    backgroundColor: '#F1F5F9',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    fontSize: 11,
    fontWeight: '800',
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginLeft: 70,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
  },
  modalHandle: {
    width: 42,
    height: 4,
    borderRadius: 4,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingBottom: 14,
    gap: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
  },
  modalSubtitle: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalForm: {
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  formGroup: {
    marginBottom: 15,
  },
  label: {
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
    paddingVertical: 12,
    fontSize: 15,
    color: '#0F172A',
  },
  passwordInputRow: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
  },
  passwordInput: {
    flex: 1,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0F172A',
    minHeight: 48,
  },
  passwordToggle: {
    width: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passwordChecklist: {
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    gap: 7,
    marginTop: -4,
    marginBottom: 15,
  },
  passwordRuleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  passwordRuleText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
    minWidth: 0,
  },
  passwordRuleTextValid: {
    color: '#047857',
  },
  modalActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
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
  cancelText: {
    color: '#475569',
    fontSize: 15,
    fontWeight: '900',
  },
  saveButton: {
    flex: 1.4,
    backgroundColor: '#2563EB',
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
});
