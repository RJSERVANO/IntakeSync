import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Switch, Alert, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomNavigation from '../../navigation/BottomNavigation';

type SettingPrefs = {
  useMetricUnits: boolean;
  timeFormat24h: boolean;
  smartHydrationGoals: boolean;
  flexibleSchedule: boolean;
};

const STORAGE_KEY = 'intakesync_settings_preferences_v1';

const DEFAULT_PREFS: SettingPrefs = {
  useMetricUnits: true,
  timeFormat24h: false,
  smartHydrationGoals: true,
  flexibleSchedule: true,
};

export default function Settings() {
  const router = useRouter();
  const { token } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState<SettingPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(raw) });
      })
      .catch((err) => console.log('Settings preference load error:', err));
  }, []);

  const updatePref = async (key: keyof SettingPrefs, value: boolean) => {
    const previous = prefs;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      console.log('Settings preference save error:', error);
      setPrefs(previous);
      Alert.alert('Could Not Save', 'This setting was not saved. Please try again.');
    }
  };

  const showAbout = () => {
    Alert.alert(
      'IntakeSync',
      'Version 1.0.0\nBuild 2024.12.10\n\nBeverage tracking and medication adherence support.'
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 8, 16) }]}>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Settings</Text>
          <Text style={styles.headerSubtitle}>Customize app behavior, units, and display preferences.</Text>
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.identityCard}>
          <View style={styles.logoFrame}>
            <Image source={require('../../../../assets/images/mainlogo.png')} style={styles.appLogo} resizeMode="contain" />
          </View>
          <View style={styles.versionInfo}>
            <Text style={styles.appName}>IntakeSync</Text>
            <Text style={styles.versionText}>Beverage tracking and medication adherence support</Text>
          </View>
        </View>

        <SettingGroup title="App Behavior">
          <InfoRow
            icon="sync-outline"
            title="Account Sync"
            subtitle="Profile and tracked data use the app's existing save behavior when available."
          />
          <View style={styles.separator} />
          <DisabledRow
            icon="cloud-offline-outline"
            title="Offline Mode"
            subtitle="Not available yet."
          />
        </SettingGroup>

        <SettingGroup title="Units & Format">
          <SwitchRow
            icon="speedometer-outline"
            title="Metric Units"
            subtitle="Save local preference for mL and kg display."
            value={prefs.useMetricUnits}
            onValueChange={(value) => updatePref('useMetricUnits', value)}
          />
          <View style={styles.separator} />
          <SwitchRow
            icon="time-outline"
            title="24-Hour Time Format"
            subtitle="Save local time display preference."
            value={prefs.timeFormat24h}
            onValueChange={(value) => updatePref('timeFormat24h', value)}
          />
        </SettingGroup>

        <SettingGroup title="Hydration">
          <SwitchRow
            icon="water-outline"
            title="Smart Hydration Goals"
            subtitle="Use the existing profile-based hydration goal estimate."
            value={prefs.smartHydrationGoals}
            onValueChange={(value) => updatePref('smartHydrationGoals', value)}
          />
          <View style={styles.separator} />
          <DisabledRow
            icon="sunny-outline"
            title="Weather-Based Reminders"
            subtitle="Not available yet."
          />
        </SettingGroup>

        <SettingGroup title="Medication">
          <SwitchRow
            icon="medical-outline"
            title="Flexible Schedule"
            subtitle="Save local preference for schedule display behavior."
            value={prefs.flexibleSchedule}
            onValueChange={(value) => updatePref('flexibleSchedule', value)}
          />
          <View style={styles.separator} />
          <TouchableOpacity style={styles.settingItem} onPress={() => router.push({ pathname: '/components/pages/profile/ProfileDetails', params: { token } } as any)}>
            <View style={styles.settingIcon}>
              <Ionicons name="calendar-outline" size={21} color="#2563EB" />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingTitle}>Medication Schedule</Text>
              <Text style={styles.settingSubtitle}>Review related profile preferences.</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
          </TouchableOpacity>
        </SettingGroup>

        <SettingGroup title="About">
          <TouchableOpacity style={styles.settingItem} onPress={showAbout}>
            <View style={styles.settingIcon}>
              <Ionicons name="information-circle-outline" size={21} color="#2563EB" />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingTitle}>App Version</Text>
              <Text style={styles.settingSubtitle}>1.0.0</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
          </TouchableOpacity>
          <View style={styles.separator} />
          <DisabledRow
            icon="refresh-outline"
            title="Check for Updates"
            subtitle="Handled by your installed app package."
          />
        </SettingGroup>
      </ScrollView>

      <BottomNavigation currentRoute="settings" />
    </SafeAreaView>
  );
}

function SettingGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.settingsGroup}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.groupContainer}>{children}</View>
    </View>
  );
}

function SwitchRow({
  icon,
  title,
  subtitle,
  value,
  onValueChange,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.settingItem}>
      <View style={styles.settingIcon}>
        <Ionicons name={icon} size={21} color="#2563EB" />
      </View>
      <View style={styles.settingContent}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingSubtitle}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#CBD5E1', true: '#93C5FD' }}
        thumbColor={value ? '#2563EB' : '#FFFFFF'}
      />
    </View>
  );
}

function InfoRow({ icon, title, subtitle }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string }) {
  return (
    <View style={styles.settingItem}>
      <View style={styles.settingIcon}>
        <Ionicons name={icon} size={21} color="#2563EB" />
      </View>
      <View style={styles.settingContent}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

function DisabledRow({ icon, title, subtitle }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string }) {
  return (
    <View style={[styles.settingItem, styles.disabledItem]}>
      <View style={[styles.settingIcon, styles.disabledIcon]}>
        <Ionicons name={icon} size={21} color="#94A3B8" />
      </View>
      <View style={styles.settingContent}>
        <Text style={styles.disabledTitle}>{title}</Text>
        <Text style={styles.settingSubtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.badge}>Unavailable</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
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
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
  },
  headerSubtitle: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 128,
  },
  identityCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  logoFrame: {
    width: 74,
    height: 74,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  appLogo: {
    width: 64,
    height: 64,
  },
  versionInfo: {
    flex: 1,
    minWidth: 0,
  },
  appName: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 5,
  },
  versionText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#64748B',
    fontWeight: '600',
  },
  settingsGroup: {
    marginBottom: 22,
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 10,
  },
  groupContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 15,
    gap: 12,
  },
  disabledItem: {
    opacity: 0.86,
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
  settingSubtitle: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    fontWeight: '600',
  },
  separator: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginLeft: 70,
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
});
