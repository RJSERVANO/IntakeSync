import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Image } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomNavigation from '../../navigation/BottomNavigation';
import ThemedNoticeModal, { ThemedNoticeType } from '../../common/ThemedNoticeModal';
import InlineSyncNotice from '../../common/InlineSyncNotice';
import ScreenHeader from '../../common/ScreenHeader';
import { FONT_SCALE } from '../../../../utils/fontScaling';
import { useFontScaleVersion } from '../../../accessibility/FontScaleProvider';
import { captureAuthSessionContext, isAuthSessionContextCurrent } from '../../../../services/authSession';
import { getCachedSession } from '../../../../services/offlineStorage';
import { getPendingSyncActions, processSyncQueue } from '../../../../services/syncQueue';

export default function Settings() {
  useFontScaleVersion();
  const insets = useSafeAreaInsets();
  const [token, setToken] = useState<string | undefined>();
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<{ type: ThemedNoticeType; title: string; message: string } | null>(null);

  const refreshPendingCount = useCallback(async () => {
    const pending = await getPendingSyncActions();
    setPendingCount(pending.length);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const session = await getCachedSession();
      const context = await captureAuthSessionContext(session?.token, session?.user ?? null);
      const pending = await getPendingSyncActions();
      if (!mounted || (session?.token && !(await isAuthSessionContextCurrent(context)))) return;
      setToken(session?.token);
      setPendingCount(pending.length);
    })().catch((error) => {
      console.log('Settings sync status load error:', error);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const showAbout = () => {
    setNotice({
      type: 'info',
      title: 'IntakeSync',
      message: 'Version 1.0.0\nBuild 2024.12.10\n\nBeverage tracking and medication adherence support.',
    });
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const session = await getCachedSession();
      const activeToken = session?.token || token;
      const context = await captureAuthSessionContext(activeToken, session?.user ?? null);
      if (activeToken && !(await isAuthSessionContextCurrent(context))) return;
      setToken(activeToken);
      if (!activeToken) {
        await refreshPendingCount();
        setNotice({
          type: 'warning',
          title: 'Login Required',
          message: 'Please log in again to sync pending changes.',
        });
        return;
      }
      const result = await processSyncQueue(activeToken);
      if (!(await isAuthSessionContextCurrent(context))) return;
      await refreshPendingCount();
      if (result.failed > 0) {
        setNotice({
          type: 'warning',
          title: 'Sync Pending',
          message: 'Sync will continue when connection is available.',
        });
        return;
      }
      setNotice({
        type: 'success',
        title: 'Sync Complete',
        message: result.synced > 0 ? `Synced ${result.synced} pending change${result.synced === 1 ? '' : 's'}.` : 'Sync complete.',
      });
    } catch (error) {
      console.log('Manual sync error:', error);
      await refreshPendingCount().catch(() => undefined);
      setNotice({
        type: 'warning',
        title: 'Sync Pending',
        message: 'Sync will continue when connection is available.',
      });
    } finally {
      setSyncing(false);
    }
  };

  const pendingSubtitle = pendingCount === 0
    ? 'No pending offline changes.'
    : `${pendingCount} change${pendingCount === 1 ? '' : 's'} waiting to sync.`;

  return (
    <SafeAreaView style={styles.container}>
      <InlineSyncNotice visible={syncing && !notice} message="Syncing..." top={Math.max(insets.top, 8) + 54} />
      <ScreenHeader title="Settings" subtitle="Customize app preferences." showBackButton />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.identityCard}>
          <View style={styles.logoFrame}>
            <Image source={require('../../../../assets/images/mainlogo.png')} style={styles.appLogo} resizeMode="contain" />
          </View>
          <View style={styles.versionInfo}>
            <Text style={styles.appName} maxFontSizeMultiplier={FONT_SCALE.title}>IntakeSync</Text>
            <Text style={styles.versionText} maxFontSizeMultiplier={FONT_SCALE.description}>Beverage tracking and medication adherence support</Text>
          </View>
        </View>

        <SettingGroup title="Sync & Offline">
          <ActionRow
            icon="sync-outline"
            title="Sync Now"
            subtitle="Process pending offline changes when connected."
            onPress={handleSyncNow}
            disabled={syncing}
          />
          <View style={styles.separator} />
          <InfoRow
            icon="time-outline"
            title="Pending Changes"
            subtitle={pendingSubtitle}
            trailing={pendingCount > 0 ? String(pendingCount) : undefined}
          />
          <View style={styles.separator} />
          <InfoRow
            icon="cloud-done-outline"
            title="Offline Cache"
            subtitle="Profile, hydration, medication, and reminder data can load from this device when available."
          />
        </SettingGroup>

        <SettingGroup title="Accessibility">
          <InfoRow
            icon="text-outline"
            title="Device Text Scaling"
            subtitle="IntakeSync follows supported device text size settings."
          />
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
          <InfoRow
            icon="phone-portrait-outline"
            title="Platform"
            subtitle="Android"
          />
          <View style={styles.separator} />
          <InfoRow
            icon="construct-outline"
            title="Build Type"
            subtitle="Capstone prototype"
          />
        </SettingGroup>
      </ScrollView>

      <ThemedNoticeModal
        visible={!!notice}
        type={notice?.type || 'info'}
        title={notice?.title || ''}
        message={notice?.message || ''}
        primaryText="OK"
        onPrimary={() => setNotice(null)}
        onClose={() => setNotice(null)}
      />

      <BottomNavigation currentRoute="profile" />
    </SafeAreaView>
  );
}

function SettingGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.settingsGroup}>
      <Text style={styles.groupTitle} maxFontSizeMultiplier={FONT_SCALE.title}>{title}</Text>
      <View style={styles.groupContainer}>{children}</View>
    </View>
  );
}

function ActionRow({
  icon,
  title,
  subtitle,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity style={[styles.settingItem, disabled && styles.disabledItem]} onPress={onPress} disabled={disabled} activeOpacity={0.75}>
      <View style={styles.settingIcon}>
        <Ionicons name={icon} size={21} color="#2563EB" />
      </View>
      <View style={styles.settingContent}>
        <Text style={styles.settingTitle} maxFontSizeMultiplier={FONT_SCALE.title}>{title}</Text>
        <Text style={styles.settingSubtitle} maxFontSizeMultiplier={FONT_SCALE.description}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
    </TouchableOpacity>
  );
}

function InfoRow({
  icon,
  title,
  subtitle,
  trailing,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  trailing?: string;
}) {
  return (
    <View style={styles.settingItem}>
      <View style={styles.settingIcon}>
        <Ionicons name={icon} size={21} color="#2563EB" />
      </View>
      <View style={styles.settingContent}>
        <Text style={styles.settingTitle} maxFontSizeMultiplier={FONT_SCALE.title}>{title}</Text>
        <Text style={styles.settingSubtitle} maxFontSizeMultiplier={FONT_SCALE.description}>{subtitle}</Text>
      </View>
      {trailing ? <Text style={styles.badge} maxFontSizeMultiplier={FONT_SCALE.chip}>{trailing}</Text> : null}
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
    opacity: 0.66,
  },
  settingIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingContent: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 3,
  },
  settingSubtitle: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
    lineHeight: 18,
  },
  separator: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginLeft: 70,
  },
  badge: {
    color: '#2563EB',
    backgroundColor: '#EFF6FF',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    fontSize: 11,
    fontWeight: '900',
    overflow: 'hidden',
  },
});
