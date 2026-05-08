import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Image, Modal } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomNavigation from '../../navigation/BottomNavigation';
import useUser from '../../../../hooks/useUser';
import AvatarSelector, { SelectedAvatar, getAvatarSource } from '../../AvatarSelector';
import * as api from '../../../api';
import { clearCachedSession, getCachedSession, getUserRemoteAvatarUri, getUserSelectedAvatar, mergeLocalAvatarIntoUser, readProfileCache, writeProfileCache } from '../../../../services/offlineStorage';
import InlineSyncNotice from '../../common/InlineSyncNotice';
import { useFontScaleVersion } from '../../../accessibility/FontScaleProvider';
import { formatBackendBirthDateForInput } from '../../../../utils/profileValidation';
import { hapticWarning } from '../../../../utils/haptics';

export default function Profile() {
  useFontScaleVersion();
  const router = useRouter();
  const { token: routeToken } = useLocalSearchParams();
  const [cachedToken, setCachedToken] = React.useState<string | undefined>();
  const [offlineMode, setOfflineMode] = React.useState(false);
  const token = (routeToken as string | undefined) || cachedToken;
  const { user } = useUser(token);
  const [visibleUser, setVisibleUser] = React.useState<any>(null);
  const [syncing, setSyncing] = React.useState(false);
  const [avatarModalVisible, setAvatarModalVisible] = React.useState(false);
  const [signOutVisible, setSignOutVisible] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);
  const [selectedAvatar, setSelectedAvatar] = React.useState<SelectedAvatar | null>(null);
  const insets = useSafeAreaInsets();
  const displayUser = visibleUser || user || { name: 'User', email: '', nickname: 'User' };
  const googleAvatarUri = getUserRemoteAvatarUri(displayUser);
  const avatarSource = getAvatarSource(selectedAvatar) || (googleAvatarUri ? { uri: googleAvatarUri } : null);

  const applyVisibleUser = React.useCallback(async (nextUser: any) => {
    const withAvatar = await mergeLocalAvatarIntoUser(nextUser);
    setVisibleUser(withAvatar);
    setSelectedAvatar(getUserSelectedAvatar(withAvatar));
    return withAvatar;
  }, []);

  const handleAvatarChange = React.useCallback((next: SelectedAvatar | null) => {
    setSelectedAvatar(next);
    setVisibleUser((current: any) => ({
      ...(current || {}),
      selected_avatar: next,
      local_avatar_type: next?.type === 'custom' ? 'custom' : next?.type === 'preset' ? 'built_in' : null,
      avatar_uri: next?.type === 'custom' ? next.uri : null,
      avatar_key: next?.type === 'preset' ? next.id : null,
    }));
  }, []);

  React.useEffect(() => {
    let mounted = true;
    if (routeToken) {
      setOfflineMode(false);
      return () => {
        mounted = false;
      };
    }

    getCachedSession().then((session) => {
      if (!mounted) return;
      if (session?.token) {
        setCachedToken(session.token);
        applyVisibleUser(session.user ?? null).catch(() => setVisibleUser(session.user ?? null));
        setOfflineMode(true);
      } else {
        router.replace('/login');
      }
    });

    return () => {
      mounted = false;
    };
  }, [applyVisibleUser, routeToken, router]);

  const profileOptions = [
    {
      id: 1,
      title: 'Personal Information',
      subtitle: 'View your profile details',
      icon: 'person-outline',
      action: () => router.push({ pathname: '/components/pages/profile/ProfileDetails', params: { token } } as any)
    },
    {
      id: 3,
      title: 'Notifications',
      subtitle: 'Manage notification preferences',
      icon: 'notifications-outline',
      action: () => router.push({ pathname: '/components/pages/profile/NotificationSettings', params: { token } } as any)
    },
    {
      id: 4,
      title: 'Privacy & Security',
      subtitle: 'Security settings and privacy',
      icon: 'shield-outline',
      action: () => router.push({ pathname: '/components/pages/profile/PrivacySecurity', params: { token } } as any)
    },
    {
      id: 6,
      title: 'Settings',
      subtitle: 'App preferences and configurations',
      icon: 'settings-outline',
      action: () => router.push({ pathname: '/components/pages/settings/Settings', params: { token } } as any)
    },
    {
      id: 7,
      title: 'Help & Support',
      subtitle: 'Get help and contact support',
      icon: 'help-circle-outline',
      action: () => router.push({ pathname: '/components/pages/profile/HelpSupport', params: { token } } as any)
    },
    {
      id: 8,
      title: 'Sign Out',
      subtitle: 'Log out of your account',
      icon: 'log-out-outline',
      destructive: true,
      action: () => {
        hapticWarning();
        setSignOutVisible(true);
      },
    },
  ];

  const refreshFromCache = React.useCallback(async (showSync = false) => {
    const session = await getCachedSession();
    const sessionUser = await mergeLocalAvatarIntoUser(session?.user ?? null);
    const cachedProfile = await readProfileCache<any>(sessionUser);
    const cachedVisible = await mergeLocalAvatarIntoUser(cachedProfile || sessionUser || { name: 'User', email: '', nickname: 'User' });
    setCachedToken(session?.token);
    setVisibleUser(cachedVisible);
    setSelectedAvatar(getUserSelectedAvatar(cachedVisible));
    if (showSync) setSyncing(Boolean(token));
  }, [token]);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      const session = await getCachedSession();
      const sessionUser = await mergeLocalAvatarIntoUser(session?.user ?? null);
      const cachedProfile = await readProfileCache<any>(sessionUser);
      if (!mounted) return;
      const cachedVisible = await mergeLocalAvatarIntoUser(cachedProfile || sessionUser || { name: 'User', email: '', nickname: 'User' });
      if (!mounted) return;
      setVisibleUser(cachedVisible);
      setSelectedAvatar(getUserSelectedAvatar(cachedVisible));
      setSyncing(Boolean(token));
      if (user) {
        const freshUser = await mergeLocalAvatarIntoUser(user);
        if (!mounted) return;
        setVisibleUser(freshUser);
        setSelectedAvatar(getUserSelectedAvatar(freshUser));
        await writeProfileCache(freshUser, freshUser);
      }
      setSyncing(false);
    })().catch(() => {
      if (mounted) setSyncing(false);
    });
    return () => {
      mounted = false;
      setSyncing(false);
    };
  }, [token, user]);

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      refreshFromCache(true)
        .then(async () => {
          if (!active || !token || !user) return;
          const freshUser = await mergeLocalAvatarIntoUser(user);
          if (!active) return;
          setVisibleUser(freshUser);
          setSelectedAvatar(getUserSelectedAvatar(freshUser));
          await writeProfileCache(freshUser, freshUser);
        })
        .catch(() => undefined)
        .finally(() => {
          if (active) setSyncing(false);
        });
      return () => {
        active = false;
      };
    }, [refreshFromCache, token, user])
  );

  const getInitials = (name: string = '') => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  const confirmSignOut = async () => {
    try {
      setSigningOut(true);
      await api.post('/logout', {}, token as string);
    } catch (err) {
      console.log('Logout error:', err);
    } finally {
      await clearCachedSession();
      setSigningOut(false);
      setSignOutVisible(false);
      router.replace({ pathname: '/login' } as any);
    }
  };

  const displayBirthDate = displayUser.date_of_birth
    ? formatBackendBirthDateForInput(String(displayUser.date_of_birth))
    : displayUser.dateOfBirth
      ? formatBackendBirthDateForInput(String(displayUser.dateOfBirth))
      : 'Not set';

  return (
    <SafeAreaView style={styles.container}>
      <InlineSyncNotice visible={syncing && !avatarModalVisible && !signOutVisible} message="Syncing..." top={Math.max(insets.top, 8) + 54} />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]}>
        <View>
          <Text style={styles.headerTitle}>Profile</Text>
          <Text style={styles.headerSubtitle}>Manage your account, preferences, and reminders.</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {offlineMode ? (
          <View style={styles.offlineBanner}>
            <Ionicons name="cloud-offline-outline" size={17} color="#2563EB" />
            <Text style={styles.offlineBannerText}>Offline mode - changes will sync when connected.</Text>
          </View>
        ) : null}

        {/* Profile Header */}
        <TouchableOpacity activeOpacity={0.82} style={styles.profileHeader} onPress={() => setAvatarModalVisible(true)}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              {avatarSource ? (
                <Image source={avatarSource as any} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>{getInitials(displayUser.name)}</Text>
              )}
            </View>
            <TouchableOpacity style={styles.cameraButton} onPress={() => setAvatarModalVisible(true)}>
              <Ionicons name="camera" size={16} color="white" />
            </TouchableOpacity>
          </View>
          <View style={styles.profileCopy}>
            <Text style={styles.userName} numberOfLines={1}>{displayUser.name}</Text>
            <Text style={styles.userEmail} numberOfLines={1}>{displayUser.email}</Text>
            <View style={styles.avatarHint}>
              <Ionicons name="image-outline" size={13} color="#2563EB" />
              <Text style={styles.avatarHintText}>Customize avatar</Text>
            </View>
          </View>
          <View style={styles.profileChevronBadge}>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </View>
        </TouchableOpacity>

        {/* Quick Info Cards */}
        <View style={styles.quickInfoContainer}>
          <View style={styles.infoCard}>
            <View style={styles.infoIconBadge}>
              <Ionicons name="call-outline" size={18} color="#2563EB" />
            </View>
            <Text style={styles.infoLabel}>Phone</Text>
            <Text style={styles.infoValue}>{displayUser.phone || 'Not set'}</Text>
          </View>
          
          <View style={styles.infoCard}>
            <View style={styles.infoIconBadge}>
              <Ionicons name="calendar-outline" size={18} color="#2563EB" />
            </View>
            <Text style={styles.infoLabel}>Date of Birth</Text>
            <Text style={styles.infoValue}>{displayBirthDate}</Text>
          </View>
        </View>

        {/* Removed onboarding preview - profile details moved to Personal Information page */}

        {/* Profile Options */}
        <Text style={styles.optionsTitle}>Account & Preferences</Text>
        <View style={styles.optionsContainer}>
          {profileOptions.map((option) => (
            <TouchableOpacity key={option.id} activeOpacity={0.72} style={styles.optionItem} onPress={option.action}>
              <View style={[styles.optionIcon, option.destructive && styles.optionIconDanger]}>
                <Ionicons name={option.icon as any} size={21} color={option.destructive ? '#EF4444' : '#2563EB'} />
              </View>
              <View style={styles.optionContent}>
                <Text style={[styles.optionTitle, option.destructive && styles.optionTitleDanger]}>{option.title}</Text>
                <Text style={styles.optionSubtitle}>{option.subtitle}</Text>
              </View>
              {!option.destructive ? (
                <View style={styles.chevronBadge}>
                  <Ionicons name="chevron-forward" size={17} color="#94A3B8" />
                </View>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <Modal
        transparent
        animationType="slide"
        visible={avatarModalVisible}
        onRequestClose={() => setAvatarModalVisible(false)}
      >
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setAvatarModalVisible(false)} />
          <View style={[styles.avatarSheet, { paddingBottom: Math.max(insets.bottom + 16, 28) }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetPreview}>
                {avatarSource ? (
                  <Image source={avatarSource as any} style={styles.sheetPreviewImage} />
                ) : (
                  <Text style={styles.sheetPreviewText}>{getInitials(displayUser.name)}</Text>
                )}
              </View>
              <View style={styles.sheetTitleWrap}>
                <Text style={styles.sheetTitle}>Customize profile</Text>
                <Text style={styles.sheetSubtitle}>Choose an avatar or upload your own image.</Text>
              </View>
            </View>
            <AvatarSelector owner={displayUser} onChange={handleAvatarChange} />
            <TouchableOpacity style={styles.sheetDoneButton} onPress={() => setAvatarModalVisible(false)}>
              <Text style={styles.sheetDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="fade"
        visible={signOutVisible}
        onRequestClose={() => setSignOutVisible(false)}
      >
        <View style={styles.confirmOverlay}>
          <TouchableOpacity style={styles.confirmBackdrop} activeOpacity={1} onPress={() => setSignOutVisible(false)} />
          <View style={[styles.confirmSheet, { paddingBottom: Math.max(insets.bottom + 16, 24) }]}>
            <View style={styles.signOutBadge}>
              <Ionicons name="log-out-outline" size={24} color="#EF4444" />
            </View>
            <Text style={styles.confirmTitle}>Sign out?</Text>
            <Text style={styles.confirmMessage}>{"You'll need to log in again to access your account."}</Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.confirmCancel} onPress={() => setSignOutVisible(false)} disabled={signingOut}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmDestructive, signingOut && styles.disabled]} onPress={confirmSignOut} disabled={signingOut}>
                <Text style={styles.confirmDestructiveText}>{signingOut ? 'Signing Out...' : 'Sign Out'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <BottomNavigation currentRoute="profile" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 136,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 14,
    padding: 10,
  },
  offlineBannerText: {
    flex: 1,
    color: '#1E3A8A',
    fontSize: 12,
    fontWeight: '800',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 10,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubtitle: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
    lineHeight: 17,
  },
  profileHeader: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    borderLeftWidth: 4,
    borderLeftColor: '#2563EB',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
    overflow: 'hidden',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 14,
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#1E3A8A',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#DBEAFE',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    color: 'white',
    fontSize: 24,
    fontWeight: '900',
  },
  cameraButton: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
  profileCopy: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
  },
  avatarHint: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    marginTop: 9,
    backgroundColor: '#DBEAFE',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  avatarHintText: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '900',
  },
  quickInfoContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  infoCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    minHeight: 104,
    paddingHorizontal: 14,
    paddingVertical: 15,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  infoIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  infoLabel: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 9,
    marginBottom: 6,
    fontWeight: '800',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },
  optionsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
    overflow: 'hidden',
  },
  optionsTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 10,
    marginLeft: 2,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    minHeight: 72,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 13,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  optionIconDanger: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  optionContent: {
    flex: 1,
    minWidth: 0,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 2,
  },
  optionTitleDanger: {
    color: '#EF4444',
  },
  optionSubtitle: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
    lineHeight: 18,
  },
  chevronBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  profileChevronBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  avatarSheet: {
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 22,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  sheetHandle: {
    width: 42,
    height: 4,
    borderRadius: 4,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sheetPreview: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1E3A8A',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: 12,
  },
  sheetPreviewImage: {
    width: '100%',
    height: '100%',
  },
  sheetPreviewText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  sheetTitleWrap: {
    flex: 1,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  sheetSubtitle: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 5,
  },
  sheetDoneButton: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 4,
    alignSelf: 'stretch',
  },
  sheetDoneText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  confirmOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.46)',
  },
  confirmBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  confirmSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 22,
    alignItems: 'center',
  },
  signOutBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  confirmTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 6,
  },
  confirmMessage: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 18,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 10,
    alignSelf: 'stretch',
  },
  confirmCancel: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  confirmDestructive: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: '#EF4444',
  },
  confirmCancelText: {
    color: '#475569',
    fontSize: 15,
    fontWeight: '900',
  },
  confirmDestructiveText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  disabled: {
    opacity: 0.6,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
    fontWeight: '700',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#EF4444',
    marginBottom: 20,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#1E3A8A',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
