import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  bootstrapNotificationSchedules,
  cancelAllMedicationNotifications,
  cancelHydrationNotifications,
  notificationService,
  validateScheduledNotificationRefs,
} from '../../../../services/notificationService';
import { notificationSettings } from '../../../../services/notificationSettings';
import { getCachedSession, readSettingsCache, writeSettingsCache } from '../../../../services/offlineStorage';
import ThemedNoticeModal, { ThemedNoticeType } from '../../common/ThemedNoticeModal';
import ScreenHeader from '../../common/ScreenHeader';
import { FONT_SCALE } from '../../../../utils/fontScaling';
import { useFontScaleVersion } from '../../../accessibility/FontScaleProvider';

type SettingKey = 'allowNotifications' | 'medicationReminders' | 'hydrationReminders' | 'sound';

type NotificationPrefs = Record<SettingKey, boolean>;
type PermissionState = { granted: boolean; status?: string; canAskAgain?: boolean };

const DEFAULT_PREFS: NotificationPrefs = {
  allowNotifications: false,
  medicationReminders: true,
  hydrationReminders: true,
  sound: true,
};

export default function NotificationSettings() {
  useFontScaleVersion();
  const { token } = useLocalSearchParams();
  void token;
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const [permissionState, setPermissionState] = useState<PermissionState>({ granted: false, status: 'unknown', canAskAgain: true });
  const [noticeModal, setNoticeModal] = useState<{ type: ThemedNoticeType; title: string; message: string; primaryText?: string; secondaryText?: string; onPrimary?: () => void } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const persist = useCallback(async (next: NotificationPrefs) => {
    const existing = currentUser ? await readSettingsCache<any>(currentUser) : null;
    await writeSettingsCache({ ...(existing || {}), notificationPreferences: next }, currentUser);
  }, [currentUser]);

  const refreshPermissionState = useCallback(async () => {
    const permission = await notificationService.getPermissionStatus();
    setPermissionState(permission);
    if (!permission.granted) {
      if (prefs.allowNotifications) {
        const next = { ...prefs, allowNotifications: false };
        setPrefs(next);
        await persist(next);
        await notificationSettings.initialize();
        await notificationSettings.setMasterToggle(false);
      }
      setPermissionBlocked(permission.status === 'denied' || permission.canAskAgain === false);
      return;
    }

    if (permissionBlocked) {
      const next = { ...prefs, allowNotifications: true };
      setPrefs(next);
      setPermissionBlocked(false);
      await persist(next);
      await notificationSettings.initialize();
      await notificationSettings.setMasterToggle(true);
    } else {
      setPermissionBlocked(false);
    }
  }, [permissionBlocked, persist, prefs]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshPermissionState().catch(() => {});
    });
    return () => subscription.remove();
  }, [refreshPermissionState]);

  const loadSettings = async () => {
    try {
      const session = await getCachedSession();
      setCurrentUser(session?.user ?? null);
      const cached = session?.user ? await readSettingsCache<any>(session.user) : null;
      const next = { ...DEFAULT_PREFS, ...(cached?.notificationPreferences || cached || {}) };
      const permission = await notificationService.getPermissionStatus();
      setPermissionState(permission);
      const normalized = permission.granted ? next : { ...next, allowNotifications: false };
      setPrefs(normalized);
      setPermissionBlocked(!permission.granted && (permission.status === 'denied' || permission.canAskAgain === false));
      if (permission.granted) await validateScheduledNotificationRefs();
      if (normalized.allowNotifications !== next.allowNotifications) {
        await writeSettingsCache({ ...(cached || {}), notificationPreferences: normalized }, session?.user ?? null);
        await notificationSettings.initialize();
        await notificationSettings.setMasterToggle(false);
      }
    } catch (error) {
      console.log('Notification settings load error:', error);
      setNoticeModal({ type: 'warning', title: 'Notice', message: 'Could not load saved notification preferences.' });
    } finally {
      setLoading(false);
    }
  };

  const openAppSettings = () => {
    setNoticeModal(null);
    Linking.openSettings().catch(() => {
      setNoticeModal({
        type: 'warning',
        title: 'Open Settings',
        message: 'Open Android Settings, choose Apps, then IntakeSync, and enable notifications.',
      });
    });
  };

  const updateSetting = async (key: SettingKey, value: boolean) => {
    const previous = prefs;
    let next = { ...prefs, [key]: value };

    if (key === 'allowNotifications' && value) {
      const granted = await notificationService.requestPermissions();
      const permission = await notificationService.getPermissionStatus();
      setPermissionState(permission);
      if (!granted) {
        setPermissionBlocked(true);
        setNoticeModal({
          type: 'warning',
          title: 'Notifications Are Off',
          message: 'Notifications are disabled for IntakeSync. Please enable them in Android app settings.',
          primaryText: 'Open App Settings',
          secondaryText: 'Done',
          onPrimary: openAppSettings,
        });
        next = { ...prefs, allowNotifications: false };
      } else {
        setPermissionBlocked(false);
        setNoticeModal({ type: 'success', title: 'Notifications Enabled', message: 'Hydration and medication reminders can now appear on this device.' });
      }
    }

    if ((key === 'hydrationReminders' || key === 'medicationReminders') && value) {
      const granted = await notificationService.requestPermissions();
      const permission = await notificationService.getPermissionStatus();
      setPermissionState(permission);
      if (!granted) {
        setPermissionBlocked(true);
        setNoticeModal({
          type: 'warning',
          title: 'Notifications Are Off',
          message: 'Notifications are disabled for IntakeSync. Please enable them in Android app settings.',
          primaryText: 'Open App Settings',
          secondaryText: 'Done',
          onPrimary: openAppSettings,
        });
        next = { ...prefs, [key]: false };
      } else {
        setPermissionBlocked(false);
      }
    }

    if (key === 'allowNotifications' && !next.allowNotifications) {
      next = { ...next, allowNotifications: false };
    }

    setPrefs(next);
    try {
      await persist(next);
      await notificationSettings.initialize();
      if (key === 'allowNotifications') await notificationSettings.setMasterToggle(next.allowNotifications);
      if (key === 'sound') await notificationSettings.setSoundEnabled(next.sound);
      if (key === 'hydrationReminders') await notificationSettings.updateCategoryWithBackend('hydration', next.hydrationReminders);
      if (key === 'medicationReminders') await notificationSettings.updateCategoryWithBackend('medications', next.medicationReminders);
      if (key === 'hydrationReminders' && !value) await cancelHydrationNotifications();
      if (key === 'medicationReminders' && !value) await cancelAllMedicationNotifications();
      if (key === 'allowNotifications' && !next.allowNotifications) await notificationService.cancelAllNotifications();
      if (key === 'sound' && next.allowNotifications) {
        await notificationService.cancelAllNotifications();
        await bootstrapNotificationSchedules();
      }
      if (next.allowNotifications && (key === 'allowNotifications' || key === 'hydrationReminders' || key === 'medicationReminders')) {
        await bootstrapNotificationSchedules();
      }
    } catch (error) {
      console.log('Notification settings save error:', error);
      setPrefs(previous);
      setNoticeModal({ type: 'error', title: 'Could Not Save', message: 'Your notification preference was not saved. Please try again.' });
    }
  };

  const reminderDisabled = !prefs.allowNotifications;

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScreenHeader title="Notifications" subtitle="Manage reminders for hydration and medication schedules." showBackButton />
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.permissionBanner}>
          <Ionicons
            name={permissionState.granted ? 'checkmark-circle-outline' : 'alert-circle-outline'}
            size={20}
            color={permissionState.granted ? '#059669' : '#B45309'}
          />
          <Text style={styles.permissionText} maxFontSizeMultiplier={FONT_SCALE.description}>
            Device permission: {permissionState.granted ? 'Granted' : permissionState.status === 'denied' ? 'Denied' : 'Not granted'}
          </Text>
        </View>
        <View style={styles.card}>
          <SettingRow
            icon="notifications-outline"
            title="Allow Notifications"
            description={permissionState.granted ? 'Device permission is granted and reminders can be scheduled.' : 'Request Android notification permission before scheduling reminders.'}
            value={prefs.allowNotifications}
            onValueChange={(value) => updateSetting('allowNotifications', value)}
          />
        </View>

        <Text style={styles.sectionTitle} maxFontSizeMultiplier={FONT_SCALE.title}>Reminder Types</Text>
        <View style={styles.card}>
          <SettingRow
            icon="medical-outline"
            title="Medication Reminders"
            description="Schedule Android medication notifications from saved dose times."
            value={prefs.allowNotifications && prefs.medicationReminders}
            disabled={reminderDisabled}
            onValueChange={(value) => updateSetting('medicationReminders', value)}
          />
          <View style={styles.divider} />
          <SettingRow
            icon="water-outline"
            title="Hydration Reminders"
            description="Schedule Android hydration notifications while you are below your daily goal."
            value={prefs.allowNotifications && prefs.hydrationReminders}
            disabled={reminderDisabled}
            onValueChange={(value) => updateSetting('hydrationReminders', value)}
          />
        </View>

        <Text style={styles.sectionTitle} maxFontSizeMultiplier={FONT_SCALE.title}>Alert Style</Text>
        <View style={styles.card}>
          <SettingRow
            icon="volume-high-outline"
            title="Sound"
            description="Use the custom hydration and medication reminder sounds for newly scheduled reminders."
            value={prefs.allowNotifications && prefs.sound}
            disabled={reminderDisabled}
            onValueChange={(value) => updateSetting('sound', value)}
          />
        </View>

        <TouchableOpacity style={styles.settingsLink} onPress={openAppSettings} activeOpacity={0.82}>
          <Ionicons name="open-outline" size={18} color="#2563EB" />
          <Text style={styles.settingsLinkText} maxFontSizeMultiplier={FONT_SCALE.button}>
            Open App Notification Settings
          </Text>
        </TouchableOpacity>

        <View style={styles.infoBanner}>
          <Ionicons name="information-circle-outline" size={20} color="#2563EB" />
          <Text style={styles.infoText} maxFontSizeMultiplier={FONT_SCALE.description}>
            Preferences are saved on this device. Android notifications also depend on app, channel, lock screen, battery, and Do Not Disturb settings.
          </Text>
        </View>
        {permissionBlocked ? (
          <Text style={styles.blockedText} maxFontSizeMultiplier={FONT_SCALE.description}>
            Notifications are currently off at the device level. Open app settings to enable them.
          </Text>
        ) : null}
      </ScrollView>

      <ThemedNoticeModal
        visible={Boolean(noticeModal)}
        type={noticeModal?.type || 'info'}
        title={noticeModal?.title || ''}
        message={noticeModal?.message || ''}
        primaryText={noticeModal?.primaryText || 'Done'}
        secondaryText={noticeModal?.secondaryText}
        onPrimary={noticeModal?.onPrimary || (() => setNoticeModal(null))}
        onSecondary={() => setNoticeModal(null)}
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
        <Text style={[styles.settingTitle, disabled && styles.disabledText]} maxFontSizeMultiplier={FONT_SCALE.title}>{title}</Text>
        <Text style={[styles.settingDescription, disabled && styles.disabledText]} maxFontSizeMultiplier={FONT_SCALE.description}>{description}</Text>
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
  sectionTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 18,
    marginBottom: 8,
  },
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 12,
  },
  permissionText: {
    flex: 1,
    color: '#334155',
    fontSize: 12,
    fontWeight: '800',
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
    flexWrap: 'wrap',
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
    flexShrink: 1,
  },
  settingTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 3,
  },
  settingDescription: {
    fontSize: 12,
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
    flexWrap: 'wrap',
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
    fontWeight: '700',
  },
  settingsLink: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingVertical: 11,
  },
  settingsLinkText: {
    color: '#2563EB',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  blockedText: {
    color: '#B45309',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    marginTop: 10,
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
