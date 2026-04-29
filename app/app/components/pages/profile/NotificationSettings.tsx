import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { notificationService } from '../../../../services/notificationService';
import { get, post } from '../../../api';
import ThemedNoticeModal, { ThemedNoticeType } from '../../common/ThemedNoticeModal';

type SettingKey = 'allowNotifications' | 'medicationReminders' | 'hydrationReminders' | 'sound' | 'vibration';

type NotificationPrefs = Record<SettingKey, boolean>;

const STORAGE_KEY = 'intakesync_notification_preferences_v1';

const DEFAULT_PREFS: NotificationPrefs = {
  allowNotifications: false,
  medicationReminders: true,
  hydrationReminders: true,
  sound: true,
  vibration: true,
};

export default function NotificationSettings() {
  const insets = useSafeAreaInsets();
  const { token } = useLocalSearchParams();
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [notificationRecordCount, setNotificationRecordCount] = useState<number | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [clearModalVisible, setClearModalVisible] = useState(false);
  const [noticeModal, setNoticeModal] = useState<{ type: ThemedNoticeType; title: string; message: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(raw) });
      }
    } catch (error) {
      console.log('Notification settings load error:', error);
      setNoticeModal({ type: 'warning', title: 'Notice', message: 'Could not load saved notification preferences.' });
    } finally {
      setLoading(false);
    }
  };

  const loadNotificationStats = useCallback(async () => {
    if (!token) return;
    try {
      const stats = await get('/notifications/stats', token as string, 3000);
      const byType = stats?.by_type ?? {};
      const total = Number(byType.hydration ?? 0) + Number(byType.medication ?? 0) + Number(byType.general ?? 0);
      setNotificationRecordCount(Number.isFinite(total) ? total : null);
    } catch (error) {
      console.log('Notification record stats load error:', error);
      setNotificationRecordCount(null);
    }
  }, [token]);

  useEffect(() => {
    loadNotificationStats();
  }, [loadNotificationStats]);

  const persist = async (next: NotificationPrefs) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const updateSetting = async (key: SettingKey, value: boolean) => {
    const previous = prefs;
    let next = { ...prefs, [key]: value };

    if (key === 'allowNotifications' && value) {
      const granted = await notificationService.requestPermissions();
      if (!granted) {
        setNoticeModal({ type: 'warning', title: 'Notifications Are Off', message: 'Notification permission was not granted. You can enable it later in your device settings.' });
        next = { ...prefs, allowNotifications: false };
      }
    }

    if (key === 'allowNotifications' && !next.allowNotifications) {
      next = { ...next, allowNotifications: false };
    }

    setPrefs(next);
    try {
      await persist(next);
    } catch (error) {
      console.log('Notification settings save error:', error);
      setPrefs(previous);
      setNoticeModal({ type: 'error', title: 'Could Not Save', message: 'Your notification preference was not saved. Please try again.' });
    }
  };

  const reminderDisabled = !prefs.allowNotifications;

  const markAllAsRead = async () => {
    if (!token || actionBusy) return;
    setActionBusy(true);
    try {
      await post('/notifications/mark-all-read', {}, token as string);
      await loadNotificationStats();
      setNoticeModal({
        type: 'success',
        title: 'All caught up',
        message: 'Unread notification records were marked as read.',
      });
    } catch (error) {
      console.log('Mark all notifications read error:', error);
      setNoticeModal({
        type: 'error',
        title: 'Could not update',
        message: 'Notification records could not be marked read. Please try again.',
      });
    } finally {
      setActionBusy(false);
    }
  };

  const clearNotifications = async () => {
    if (!token || actionBusy) return;
    setActionBusy(true);
    try {
      await post('/notifications/clear', {}, token as string);
      setClearModalVisible(false);
      await loadNotificationStats();
      setNoticeModal({
        type: 'success',
        title: 'Notifications cleared',
        message: 'Only notification records were cleared. Beverage logs and medication history remain.',
      });
    } catch (error) {
      console.log('Clear notifications error:', error);
      setNoticeModal({
        type: 'error',
        title: 'Could not clear',
        message: 'Notification records could not be cleared. Please try again.',
      });
    } finally {
      setActionBusy(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Loading preferences...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Notifications</Text>
          <Text style={styles.subtitle}>Manage reminders for hydration and medication schedules.</Text>
        </View>
      </View>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <SettingRow
            icon="notifications-outline"
            title="Allow Notifications"
            description="Request device permission and allow reminder alerts."
            value={prefs.allowNotifications}
            onValueChange={(value) => updateSetting('allowNotifications', value)}
          />
        </View>

        <Text style={styles.sectionTitle}>Reminder Types</Text>
        <View style={styles.card}>
          <SettingRow
            icon="medical-outline"
            title="Medication Reminders"
            description="Use reminders created from medication schedules."
            value={prefs.allowNotifications && prefs.medicationReminders}
            disabled={reminderDisabled}
            onValueChange={(value) => updateSetting('medicationReminders', value)}
          />
          <View style={styles.divider} />
          <SettingRow
            icon="water-outline"
            title="Hydration Reminders"
            description="Use reminders created by the existing hydration system."
            value={prefs.allowNotifications && prefs.hydrationReminders}
            disabled={reminderDisabled}
            onValueChange={(value) => updateSetting('hydrationReminders', value)}
          />
        </View>

        <Text style={styles.sectionTitle}>Alert Style</Text>
        <View style={styles.card}>
          <SettingRow
            icon="volume-high-outline"
            title="Sound"
            description="Use the default notification sound when supported."
            value={prefs.allowNotifications && prefs.sound}
            disabled={reminderDisabled}
            onValueChange={(value) => updateSetting('sound', value)}
          />
          <View style={styles.divider} />
          <SettingRow
            icon="phone-portrait-outline"
            title="Vibration"
            description="Use vibration when supported by the device."
            value={prefs.allowNotifications && prefs.vibration}
            disabled={reminderDisabled}
            onValueChange={(value) => updateSetting('vibration', value)}
          />
        </View>

        <View style={styles.infoBanner}>
          <Ionicons name="information-circle-outline" size={20} color="#2563EB" />
          <Text style={styles.infoText}>
            Preferences are saved on this device. Actual reminder scheduling depends on the existing reminder system.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Notification Records</Text>
        <View style={styles.card}>
          {notificationRecordCount === 0 ? (
            <View style={styles.recordEmptyRow}>
              <Ionicons name="notifications-off-outline" size={20} color="#94A3B8" />
              <Text style={styles.recordEmptyText}>No notification records to manage.</Text>
            </View>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.recordActionRow, actionBusy && styles.disabledRow]}
                onPress={markAllAsRead}
                disabled={actionBusy || !token}
                activeOpacity={0.82}
              >
                <View style={styles.recordActionIcon}>
                  <Ionicons name="checkmark-done" size={20} color="#059669" />
                </View>
                <View style={styles.settingContent}>
                  <Text style={styles.settingTitle}>Mark all read</Text>
                  <Text style={styles.settingDescription}>Clear unread state on notification records.</Text>
                </View>
              </TouchableOpacity>
              <View style={styles.divider} />
              <TouchableOpacity
                style={[styles.recordActionRow, actionBusy && styles.disabledRow]}
                onPress={() => setClearModalVisible(true)}
                disabled={actionBusy || !token}
                activeOpacity={0.82}
              >
                <View style={[styles.recordActionIcon, styles.dangerActionIcon]}>
                  <Ionicons name="trash-outline" size={20} color="#DC2626" />
                </View>
                <View style={styles.settingContent}>
                  <Text style={styles.settingTitle}>Clear notifications</Text>
                  <Text style={styles.settingDescription}>Hide notification records from the Notifications list.</Text>
                </View>
              </TouchableOpacity>
            </>
          )}
        </View>
        <Text style={styles.recordHelper}>Only notification records are affected. Beverage logs and medication history remain.</Text>
      </ScrollView>

      <ThemedNoticeModal
        visible={clearModalVisible}
        type="destructive"
        title="Clear Notifications?"
        message="This removes notification records from this list. Beverage logs and medication history will remain."
        primaryText="Clear"
        secondaryText="Cancel"
        loading={actionBusy}
        onPrimary={clearNotifications}
        onSecondary={() => setClearModalVisible(false)}
        onClose={() => setClearModalVisible(false)}
      />

      <ThemedNoticeModal
        visible={Boolean(noticeModal)}
        type={noticeModal?.type || 'info'}
        title={noticeModal?.title || ''}
        message={noticeModal?.message || ''}
        primaryText="Done"
        onPrimary={() => setNoticeModal(null)}
        onClose={() => setNoticeModal(null)}
      />
    </SafeAreaView>
  );
}

function SettingRow({
  icon,
  title,
  description,
  value,
  disabled,
  onValueChange,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={[styles.settingRow, disabled && styles.disabledRow]}>
      <View style={styles.settingIcon}>
        <Ionicons name={icon} size={20} color={disabled ? '#94A3B8' : '#2563EB'} />
      </View>
      <View style={styles.settingContent}>
        <Text style={[styles.settingTitle, disabled && styles.disabledText]}>{title}</Text>
        <Text style={[styles.settingDescription, disabled && styles.disabledText]}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
        thumbColor={value ? '#2563EB' : '#FFFFFF'}
      />
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
    paddingTop: 14,
    paddingBottom: 56,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#64748B',
    fontWeight: '700',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 10,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    color: '#64748B',
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 18,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
  },
  disabledRow: {
    opacity: 0.72,
  },
  settingIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
  },
  settingContent: {
    flex: 1,
    minWidth: 0,
  },
  settingTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 3,
  },
  settingDescription: {
    fontSize: 12,
    lineHeight: 17,
    color: '#64748B',
    fontWeight: '600',
  },
  disabledText: {
    color: '#94A3B8',
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginLeft: 62,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    padding: 12,
    marginTop: 18,
  },
  infoText: {
    flex: 1,
    color: '#1E40AF',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  recordActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
  },
  recordActionIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
  },
  dangerActionIcon: {
    backgroundColor: '#FEF2F2',
  },
  recordEmptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  recordEmptyText: {
    flex: 1,
    color: '#64748B',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  recordHelper: {
    color: '#64748B',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    marginTop: 7,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  detailModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
  },
  modalTitle: {
    color: '#0F172A',
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '900',
  },
  modalMessage: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },
  confirmActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 18,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
  },
  cancelText: {
    color: '#334155',
    fontWeight: '900',
  },
  clearButton: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: '#DC2626',
  },
  clearButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  primaryModalButton: {
    alignSelf: 'flex-end',
    marginTop: 18,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  primaryModalText: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
});
