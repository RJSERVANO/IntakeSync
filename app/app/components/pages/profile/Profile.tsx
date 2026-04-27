import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Alert, Image, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomNavigation from '../../navigation/BottomNavigation';
import useUser from '../../../../hooks/useUser';
import AvatarSelector, { AVATAR_STORAGE_KEY, SelectedAvatar, getAvatarSource } from '../../AvatarSelector';
import * as api from '../../../api';

export default function Profile() {
  const router = useRouter();
  const { token } = useLocalSearchParams();
  const { user, loading, reload } = useUser(token as string | undefined);
  const [avatarModalVisible, setAvatarModalVisible] = React.useState(false);
  const [selectedAvatar, setSelectedAvatar] = React.useState<SelectedAvatar | null>(null);
  const insets = useSafeAreaInsets();
  const avatarSource = getAvatarSource(selectedAvatar);

  React.useEffect(() => {
    AsyncStorage.getItem(AVATAR_STORAGE_KEY)
      .then((raw) => {
        if (raw) setSelectedAvatar(JSON.parse(raw));
      })
      .catch((err) => console.log('Profile avatar load error:', err));
  }, []);

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
  ];

  const retryFetch = () => {
    reload();
  };

  const getInitials = (name: string = '') => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to load user data</Text>
          <TouchableOpacity style={styles.retryButton} onPress={retryFetch}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 8, 18) }]}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Profile Header */}
        <TouchableOpacity activeOpacity={0.82} style={styles.profileHeader} onPress={() => setAvatarModalVisible(true)}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              {avatarSource ? (
                <Image source={avatarSource as any} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>{getInitials(user.name)}</Text>
              )}
            </View>
            <TouchableOpacity style={styles.cameraButton} onPress={() => setAvatarModalVisible(true)}>
              <Ionicons name="camera" size={16} color="white" />
            </TouchableOpacity>
          </View>
          <View style={styles.profileCopy}>
            <Text style={styles.userName} numberOfLines={1}>{user.name}</Text>
            <Text style={styles.userEmail} numberOfLines={1}>{user.email}</Text>
            <View style={styles.avatarHint}>
              <Ionicons name="image-outline" size={13} color="#2563EB" />
              <Text style={styles.avatarHintText}>Customize avatar</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
        </TouchableOpacity>

        {/* Quick Info Cards */}
        <View style={styles.quickInfoContainer}>
          <View style={styles.infoCard}>
            <Ionicons name="call-outline" size={20} color="#1E3A8A" />
            <Text style={styles.infoLabel}>Phone</Text>
            <Text style={styles.infoValue}>{user.phone || 'Not set'}</Text>
          </View>
          
          <View style={styles.infoCard}>
            <Ionicons name="calendar-outline" size={20} color="#1E3A8A" />
            <Text style={styles.infoLabel}>Date of Birth</Text>
            <Text style={styles.infoValue}>{user.dateOfBirth || 'Not set'}</Text>
          </View>
        </View>

        {/* Removed onboarding preview - profile details moved to Personal Information page */}

        {/* Profile Options */}
        <View style={styles.optionsContainer}>
          {profileOptions.map((option) => (
            <TouchableOpacity key={option.id} style={styles.optionItem} onPress={option.action}>
              <View style={styles.optionIcon}>
                <Ionicons name={option.icon as any} size={24} color="#1E3A8A" />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>{option.title}</Text>
                <Text style={styles.optionSubtitle}>{option.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          ))}
        </View>

        {/* Emergency contact moved to Personal Information page */}

        {/* Logout Button */}
        <TouchableOpacity 
          style={styles.logoutButton}
          onPress={() => {
            Alert.alert(
              'Sign Out',
              'Are you sure you want to sign out of your account?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Sign Out',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await api.post('/logout', {}, token as string);
                    } catch (err) {
                      console.log('Logout error:', err);
                    }
                    router.replace({ pathname: '/login' } as any);
                  }
                }
              ]
            );
          }}
        >
          <Ionicons name="log-out-outline" size={20} color="#EF4444" />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        transparent
        animationType="slide"
        visible={avatarModalVisible}
        onRequestClose={() => setAvatarModalVisible(false)}
      >
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setAvatarModalVisible(false)} />
          <View style={styles.avatarSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetPreview}>
                {avatarSource ? (
                  <Image source={avatarSource as any} style={styles.sheetPreviewImage} />
                ) : (
                  <Text style={styles.sheetPreviewText}>{getInitials(user.name)}</Text>
                )}
              </View>
              <View style={styles.sheetTitleWrap}>
                <Text style={styles.sheetTitle}>Customize profile</Text>
                <Text style={styles.sheetSubtitle}>Choose an avatar or upload your own image.</Text>
              </View>
            </View>
            <AvatarSelector onChange={setSelectedAvatar} />
            <TouchableOpacity style={styles.sheetDoneButton} onPress={() => setAvatarModalVisible(false)}>
              <Text style={styles.sheetDoneText}>Done</Text>
            </TouchableOpacity>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
  },
  profileHeader: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
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
    backgroundColor: '#EFF6FF',
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
    borderRadius: 16,
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
    borderRadius: 16,
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
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 2,
  },
  optionSubtitle: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 13,
    marginTop: 2,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EF4444',
    marginLeft: 8,
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
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
