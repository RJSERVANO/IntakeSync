import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import EditProfileModal from './EditProfileModal';
import ProfileInfoList from './ProfileInfoList';
import useUser from '../../../../hooks/useUser';
import { SafeAreaView } from 'react-native-safe-area-context';
import ScreenHeader from '../../common/ScreenHeader';
import { getCachedSession, mergeLocalAvatarIntoUser, readProfileCache, writeProfileCache } from '../../../../services/offlineStorage';
import { useFontScaleVersion } from '../../../accessibility/FontScaleProvider';
import { formatBackendBirthDateForInput } from '../../../../utils/profileValidation';

interface UserDetails {
  name: string;
  email: string;
  phone?: string;
  date_of_birth?: string;
  gender?: string;
  address?: string;
  nickname?: string;
  climate?: string;
  exercise_frequency?: string;
  weight?: number;
  weight_unit?: string;
  hydration_goal?: number;
  daily_hydration_goal?: number;
  daily_goal_ml?: number;
}

export default function ProfileDetails() {
  useFontScaleVersion();
  const { token } = useLocalSearchParams();
  const { user: fetchedUser, setUser: setFetchedUser, loading } = useUser(token as string | undefined);
  const [cachedProfile, setCachedProfile] = React.useState<UserDetails | null>(null);

  // local alias to satisfy existing code that used `user`
  const user = (fetchedUser || cachedProfile) as unknown as UserDetails | null;

  const [modalVisible, setModalVisible] = React.useState(false);

  const isProfileNewerThanUser = React.useCallback((profile: any, nextUser: any) => {
    const profileTime = new Date(profile?.local_updated_at || profile?.updated_at || 0).getTime();
    const userTime = new Date(nextUser?.local_updated_at || nextUser?.updated_at || 0).getTime();
    return Number.isFinite(profileTime) && profileTime > 0 && (!Number.isFinite(userTime) || profileTime > userTime);
  }, []);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      const session = await getCachedSession();
      const profile = await readProfileCache<UserDetails>(session?.user ?? null);
      if (mounted && profile) setCachedProfile(await mergeLocalAvatarIntoUser(profile));
    })().catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      (async () => {
        const session = await getCachedSession();
        const profile = await readProfileCache<UserDetails>(session?.user ?? null);
        if (active && profile) setCachedProfile(await mergeLocalAvatarIntoUser(profile));
      })().catch(() => {});
      return () => {
        active = false;
      };
    }, [])
  );

  React.useEffect(() => {
    if (!fetchedUser) return;
    (async () => {
      const session = await getCachedSession();
      const profile = await readProfileCache<UserDetails>(session?.user ?? null);
      if (isProfileNewerThanUser(profile, fetchedUser)) return;
      await writeProfileCache(fetchedUser, fetchedUser);
    })().catch(() => {});
  }, [fetchedUser, isProfileNewerThanUser]);

  const openEditModal = () => setModalVisible(true);
  const closeEditModal = () => setModalVisible(false);

  const handleSaved = (updated: any) => {
    // update shared user state
    setFetchedUser((prev: any) => ({ ...(prev || {}), ...(updated || {}) }));
    setCachedProfile((prev: any) => ({ ...(prev || {}), ...(updated || {}) }));
  };

  const formatClimate = (climate: string | undefined) => {
    if (!climate) return 'Not set';
    return climate.charAt(0).toUpperCase() + climate.slice(1);
  };

  const formatExercise = (exercise: string | undefined) => {
    if (!exercise) return 'Not set';
    return exercise.charAt(0).toUpperCase() + exercise.slice(1) + ' exercise';
  };

  const getHydrationGoal = () => {
    const goal = Number(user?.daily_hydration_goal || user?.daily_goal_ml || user?.hydration_goal || 0);
    return goal > 0 ? `${goal} ml` : 'Not set';
  };

  if (loading && !user) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <ScreenHeader title="Profile Details" subtitle="View and update your account and hydration profile." showBackButton />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1E3A8A" />
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <ScreenHeader title="Profile Details" subtitle="View and update your account and hydration profile." showBackButton />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to load profile details</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScreenHeader
        title="Profile Details"
        subtitle="View and update your account and hydration profile."
        showBackButton
        rightAction={(
          <TouchableOpacity style={styles.iconButton} onPress={openEditModal}>
            <Ionicons name="create-outline" size={22} color="#2563EB" />
          </TouchableOpacity>
        )}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Personal Information Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <View style={styles.sectionBadge}>
              <Ionicons name="person-outline" size={17} color="#2563EB" />
            </View>
            <Text style={styles.sectionTitle}>Account Information</Text>
          </View>
          <ProfileInfoList
            sections={[
              {
                rows: [
                  { label: 'Full Name', value: user.name },
                  { label: 'Nickname', value: user.nickname },
                  { label: 'Email', value: user.email },
                  { label: 'Phone', value: user.phone },
                  { label: 'Date of Birth', value: user.date_of_birth ? formatBackendBirthDateForInput(user.date_of_birth) : user.date_of_birth },
                  { label: 'Address', value: user.address },
                ],
              },
            ]}
          />
        </View>

        {/* Health Information Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <View style={styles.sectionBadge}>
              <Ionicons name="water-outline" size={17} color="#2563EB" />
            </View>
            <Text style={styles.sectionTitle}>Hydration Profile</Text>
          </View>
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Weight</Text>
              <Text style={styles.infoValue}>
                {user.weight ? `${user.weight} ${user.weight_unit || 'kg'}` : 'Not set'}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Weight Unit</Text>
              <Text style={styles.infoValue}>{user.weight_unit || 'Not set'}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Exercise Frequency</Text>
              <Text style={styles.infoValue}>{formatExercise(user.exercise_frequency)}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Climate</Text>
              <Text style={styles.infoValue}>{formatClimate(user.climate)}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Hydration Goal</Text>
              <Text style={styles.infoValue}>{getHydrationGoal()}</Text>
            </View>
          </View>
        </View>

        <View style={styles.bottomSpacing} />
      </ScrollView>

      <EditProfileModal
        visible={modalVisible}
        onClose={closeEditModal}
        user={user}
        token={token as string}
        onSaved={handleSaved}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#EF4444',
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 12,
  },
  sectionBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 12,
  },
  infoContent: {
    flex: 1,
    marginLeft: 12,
    flexShrink: 1,
  },
  icon: {
    marginRight: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '700',
    flex: 0.5,
    marginRight: 8,
  },
  infoValue: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '800',
    textAlign: 'right',
    flex: 0.5,
    flexWrap: 'wrap',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  bottomSpacing: {
    height: 40,
  },
  scrollContent: {
    paddingBottom: 56,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  modalCancelButton: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '600',
  },
  modalSaveButton: {
    fontSize: 16,
    color: '#1E3A8A',
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  formGroup: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1F2937',
  },
  textArea: {
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  profilePictureSection: {
    alignItems: 'center',
    marginBottom: 24,
    paddingTop: 20,
  },
  profilePictureContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#E5E7EB',
  },
  profileImagePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  cameraButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E3A8A',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
});

