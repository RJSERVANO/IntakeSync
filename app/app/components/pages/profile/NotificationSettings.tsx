import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { notificationService } from '../../../../services/notificationService';

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
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);

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
      Alert.alert('Notice', 'Could not load saved notification preferences.');
    } finally {
      setLoading(false);
    }
  };

  const persist = async (next: NotificationPrefs) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const updateSetting = async (key: SettingKey, value: boolean) => {
    const previous = prefs;
    let next = { ...prefs, [key]: value };

    if (key === 'allowNotifications' && value) {
      const granted = await notificationService.requestPermissions();
      if (!granted) {
        Alert.alert('Notifications are off', 'Notification permission was not granted. You can enable it later in your device settings.');
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
      Alert.alert('Could Not Save', 'Your notification preference was not saved. Please try again.');
    }
  };

  const reminderDisabled = !prefs.allowNotifications;

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
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 8, 16) }]}>
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
      </ScrollView>
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
    paddingTop: 18,
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
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: '#64748B',
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 22,
    marginBottom: 10,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
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
    paddingHorizontal: 16,
    paddingVertical: 15,
    gap: 12,
  },
  disabledRow: {
    opacity: 0.72,
  },
  settingIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
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
  settingDescription: {
    fontSize: 13,
    lineHeight: 18,
    color: '#64748B',
    fontWeight: '600',
  },
  disabledText: {
    color: '#94A3B8',
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginLeft: 70,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#EFF6FF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    padding: 14,
    marginTop: 22,
  },
  infoText: {
    flex: 1,
    color: '#1E40AF',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },
});
