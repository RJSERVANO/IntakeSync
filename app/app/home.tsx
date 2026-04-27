import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, StyleSheet, ScrollView, TextInput, SafeAreaView, Dimensions, Modal, Image, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as api from './api';
import BottomNavigation from './components/navigation/BottomNavigation';
import { AVATAR_STORAGE_KEY, SelectedAvatar, getAvatarSource } from './components/AvatarSelector';

const { width } = Dimensions.get('window');

interface TimelineItem {
  id: number;
  time: string;
  title: string;
  body: string;
  type: string;
  status: string;
  status_text: string;
  status_emoji: string;
}

interface QuickStatus {
  medicationsLeft: number;
  hydrationPercentage: number;
  hydrationTotal: number;
  hydrationGoal: number;
  medicationsTaken: number;
  medicationsTotal: number;
}

type BeverageLevel = 'none' | 'low' | 'medium' | 'high';

export default function Home() {
  const insets = useSafeAreaInsets();
  const { token } = useLocalSearchParams();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [quickStatus, setQuickStatus] = useState<QuickStatus>({ 
    medicationsLeft: 0, 
    hydrationPercentage: 0,
    hydrationTotal: 0,
    hydrationGoal: 2000,
    medicationsTaken: 0,
    medicationsTotal: 0
  });
  const [hydrationEntries, setHydrationEntries] = useState<any[] | null>(null);
  const [selectedAvatar, setSelectedAvatar] = useState<SelectedAvatar | null>(null);
  const [headerElevated, setHeaderElevated] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [weeklyReport, setWeeklyReport] = useState<any>(null);
  const [patterns, setPatterns] = useState<any[]>([]);
  const [snoozeSuggestions, setSnoozeSuggestions] = useState<any[]>([]);
  const [upcomingMedications, setUpcomingMedications] = useState<any[]>([]);
  const [medicineSearch, setMedicineSearch] = useState('');
  const [medicineSuggestions, setMedicineSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showGoalCompletionModal, setShowGoalCompletionModal] = useState(false);
  const [showOverHydrationModal, setShowOverHydrationModal] = useState(false);
  const [previousHydrationPercentage, setPreviousHydrationPercentage] = useState(0);
  const insightsScore = weeklyReport?.overall_score ?? 0;
  const avatarSource = getAvatarSource(selectedAvatar);

  const loadSelectedAvatar = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(AVATAR_STORAGE_KEY);
      setSelectedAvatar(raw ? JSON.parse(raw) : null);
    } catch (err) {
      console.log('Home avatar load error:', err);
    }
  }, []);

  useEffect(() => {
    loadSelectedAvatar();
  }, [loadSelectedAvatar]);

  useFocusEffect(
    useCallback(() => {
      loadSelectedAvatar();
    }, [loadSelectedAvatar])
  );

  // Debounce medicine search
  useEffect(() => {
    const searchMedicines = async () => {
      if (medicineSearch.trim().length < 2) {
        setMedicineSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      try {
        const response = await api.get(`/medicines/search?query=${encodeURIComponent(medicineSearch)}`);
        setMedicineSuggestions(response.medicines || []);
        setShowSuggestions(true);
      } catch (err) {
        console.log('Medicine search error:', err);
        setMedicineSuggestions([]);
      }
    };

    const debounceTimer = setTimeout(searchMedicines, 300);
    return () => clearTimeout(debounceTimer);
  }, [medicineSearch]);

  // Detect hydration goal completion and over-hydration
  useEffect(() => {
    const currentPercentage = quickStatus.hydrationPercentage;
    
    // Show goal completion modal when crossing 100% threshold
    if (currentPercentage >= 100 && previousHydrationPercentage < 100) {
      setShowGoalCompletionModal(true);
    }
    
    // Show over-hydration modal when exceeding 110% (after goal was already completed)
    if (currentPercentage > 110 && previousHydrationPercentage >= 100 && previousHydrationPercentage <= 110) {
      setShowOverHydrationModal(true);
    }
    
    // Update previous percentage
    if (currentPercentage !== previousHydrationPercentage) {
      setPreviousHydrationPercentage(currentPercentage);
    }
  }, [quickStatus.hydrationPercentage, previousHydrationPercentage]);

  useEffect(() => {
    // Safety timeout - always set loading to false after 5 seconds max (very aggressive)
    const safetyTimeout = setTimeout(() => {
      console.log('Safety timeout: forcing loading to false after 5 seconds');
      setLoading(false);
      // Set default user if still loading
      setUser((prevUser: any) => prevUser || { name: 'User', email: '', nickname: 'User' });
    }, 5000);

    async function load() {
      try {
        console.log('Home: token=', token);
        if (!token) {
          clearTimeout(safetyTimeout);
          setLoading(false);
          router.replace({ pathname: '/login' } as any);
          return;
        }
        
        // Try to load user data with shorter timeout
        try {
          const me = await Promise.race([
            api.get('/me', token as string, 3000), // 3 second timeout - very short
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
          ]) as any;
          console.log('Home: /me response:', me);
          setUser(me);
          // Set loading to false immediately after getting user data
          clearTimeout(safetyTimeout);
          setLoading(false);
        } catch (meErr: any) {
          console.log('Home: /me error:', meErr);
          // Set a default user to allow UI to render immediately
          setUser({ name: 'User', email: '', nickname: 'User' });
          clearTimeout(safetyTimeout);
          setLoading(false);
          // If it's an auth error, redirect to login
          if (meErr?.status === 401) {
            router.replace({ pathname: '/login' } as any);
            return;
          }
          // For other errors, continue to show UI with default data
        }
        
        // Load other data in background (non-blocking, won't affect loading state)
        // These run after loading is already set to false
        setTimeout(() => {
          // Load quick status data (non-blocking with timeouts)
          Promise.allSettled([
            api.get('/hydration', token as string, 3000).catch(() => null),
            api.get('/medications/upcoming', token as string, 3000).catch(() => null),
            api.get('/medications/stats', token as string, 3000).catch(() => null),
          ]).then((results) => {
            const hydrationData = results[0].status === 'fulfilled' ? results[0].value : null;
            const upcoming = results[1].status === 'fulfilled' ? results[1].value : null;
            const stats = results[2].status === 'fulfilled' ? results[2].value : null;
            
            const hydrationPercentage = hydrationData ? Math.round(hydrationData?.percentage || 0) : 0;
            const hydrationEntries = Array.isArray(hydrationData?.entries) ? hydrationData.entries : null;
            const medicationsLeft = Array.isArray(upcoming) ? upcoming.length : 0;
            const medicationsTaken = stats?.completed_today || 0;
            const medicationsTotal = stats?.total_reminders_today || 0;
            setHydrationEntries(hydrationEntries);
            setUpcomingMedications(Array.isArray(upcoming) ? upcoming : []);
            
            setQuickStatus({
              medicationsLeft,
              hydrationPercentage,
              hydrationTotal: hydrationData?.today_total || 0,
              hydrationGoal: hydrationData?.goal || 2000,
              medicationsTaken,
              medicationsTotal
            });
          }).catch(() => {
            // Set defaults if all fail
            setQuickStatus({ 
              medicationsLeft: 0, 
              hydrationPercentage: 0,
              hydrationTotal: 0,
              hydrationGoal: 2000,
              medicationsTaken: 0,
              medicationsTotal: 0
            });
          });
          
          // Load timeline separately to avoid blocking on errors
          api.get('/notifications/today-timeline', token as string, 3000)
            .then((timelineData) => {
              if (Array.isArray(timelineData)) {
                setTimeline(timelineData);
              } else {
                setTimeline([]);
              }
            })
            .catch(() => {
              setTimeline([]);
            });
        }, 100); // Small delay to ensure loading is set to false first
      } catch (err: any) {
        console.log('Home load error:', err);
        // Set default user immediately to allow UI to render
        setUser({ name: 'User', email: '', nickname: 'User' });
        clearTimeout(safetyTimeout);
        setLoading(false);
        // Don't show alerts for network/timeout errors
        if (err?.status !== 408 && err?.status !== 0 && err?.status !== undefined) {
          const message = err?.data?.message || err?.data || err?.message || 'Failed to load data';
          console.log('Error message:', message);
        }
      }
    }
    load();
    
    return () => {
      clearTimeout(safetyTimeout);
    };
  }, [token, router]);

  // Load Routine Insights for every logged-in user (non-blocking)
  useEffect(() => {
    if (token) {
      const loadInsights = async () => {
        try {
          // Use Promise.allSettled to prevent one failing from blocking others
          const results = await Promise.allSettled([
            api.get('/insights/weekly-report', token as string),
            api.get('/insights/patterns', token as string),
            api.get('/insights/snooze-analysis', token as string),
          ]);
          
          if (results[0].status === 'fulfilled' && results[0].value) {
            setWeeklyReport(results[0].value);
          }
          if (results[1].status === 'fulfilled' && results[1].value?.patterns) {
            setPatterns(results[1].value.patterns);
          }
          if (results[2].status === 'fulfilled' && results[2].value?.suggestions) {
            setSnoozeSuggestions(results[2].value.suggestions);
          }
        } catch (insightsErr) {
          console.log('Error loading insights (non-critical):', insightsErr);
        }
      };
      loadInsights();
    }
  }, [token]);

  // Real-time hydration data refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (!token || loading) return;

      const refreshHydrationData = async () => {
        try {
          const [hydrationRes, statsRes] = await Promise.all([
            api.get('/hydration', token as string, 3000).catch(() => null),
            api.get('/medications/stats', token as string, 3000).catch(() => null),
          ]);
          
          if (hydrationRes) {
            const hydrationPercentage = Math.round(hydrationRes.percentage || 0);
            setHydrationEntries(Array.isArray(hydrationRes.entries) ? hydrationRes.entries : null);
            
            setQuickStatus(prev => ({
              ...prev,
              hydrationPercentage,
              hydrationTotal: hydrationRes.today_total || 0,
              hydrationGoal: hydrationRes.goal || prev.hydrationGoal || 2000
            }));
          }
          
          if (statsRes) {
            const medicationsTaken = statsRes.completed_today || 0;
            const medicationsTotal = statsRes.total_reminders_today || 0;
            
            setQuickStatus(prev => ({
              ...prev,
              medicationsTaken,
              medicationsTotal
            }));
          }
        } catch (err) {
          console.log('Data refresh error', err);
        }
      };
      
      refreshHydrationData();
    }, [token, loading])
  );

  // Real-time hydration polling - refresh every 10 seconds
  useEffect(() => {
    if (!token || loading) return;

    const fetchHydrationStatus = async () => {
      try {
        const results = await Promise.allSettled([
          api.get('/hydration', token as string, 3000).catch(() => null),
          api.get('/medications/upcoming', token as string, 3000).catch(() => null),
          api.get('/medications/stats', token as string, 3000).catch(() => null),
        ]);
        
        const hydrationData = results[0].status === 'fulfilled' ? results[0].value : null;
        const upcoming = results[1].status === 'fulfilled' ? results[1].value : null;
        const stats = results[2].status === 'fulfilled' ? results[2].value : null;
        
        const hydrationPercentage = hydrationData ? Math.round(hydrationData?.percentage || 0) : 0;
        const hydrationEntries = Array.isArray(hydrationData?.entries) ? hydrationData.entries : null;
        const medicationsLeft = Array.isArray(upcoming) ? upcoming.length : 0;
        const medicationsTaken = stats?.completed_today || 0;
        const medicationsTotal = stats?.total_reminders_today || 0;
        setHydrationEntries(hydrationEntries);
        setUpcomingMedications(Array.isArray(upcoming) ? upcoming : []);
        
        setQuickStatus({
          medicationsLeft,
          hydrationPercentage,
          hydrationTotal: hydrationData?.today_total || 0,
          hydrationGoal: hydrationData?.goal || 2000,
          medicationsTaken,
          medicationsTotal
        });
        
        console.log('Real-time update: Hydration', hydrationPercentage + '%', 'Medications:', medicationsTaken + '/' + medicationsTotal);
      } catch (error) {
        console.log('Error refreshing quick status:', error);
      }
    };

    // Poll every 10 seconds for real-time updates
    const pollInterval = setInterval(fetchHydrationStatus, 10000);

    return () => clearInterval(pollInterval);
  }, [token, loading]);


  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FA', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#1E3A8A" />
        <Text style={{ marginTop: 16, color: '#6B7280', fontSize: 14 }}>Loading...</Text>
      </SafeAreaView>
    );
  }

  // Use nickname if available, otherwise fall back to first name
  const displayName = user?.nickname || user?.name?.split(' ')[0] || 'User';

  const handleInsightsPress = () => {
    router.push({ pathname: '/insights', params: { token } } as any);
  };

  const menuItems = [
    { label: 'Profile', icon: 'person-outline', route: '/components/pages/profile/Profile' },
    { label: 'Settings', icon: 'settings-outline', route: '/components/pages/settings/Settings' },
    { label: 'Notifications', icon: 'notifications-outline', route: '/components/pages/profile/NotificationSettings' },
    { label: 'Privacy & Security', icon: 'shield-checkmark-outline', route: '/components/pages/profile/PrivacySecurity' },
    { label: 'Help & Support', icon: 'help-circle-outline', route: '/components/pages/profile/HelpSupport' },
    { label: 'Sign Out', icon: 'log-out-outline', action: 'logout' },
  ];

  const handleMenuAction = (item: typeof menuItems[0]) => {
    setMenuVisible(false);
    if ('action' in item && item.action === 'logout') {
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
            },
          },
        ]
      );
      return;
    }

    if ('route' in item && item.route) {
      router.push({ pathname: item.route, params: { token } } as any);
    } else {
      Alert.alert('Coming Soon', `${item.label} will be available soon.`);
    }
  };

  const levelValue = (level?: string) => {
    if (level === 'low') return 1;
    if (level === 'medium') return 2;
    if (level === 'high') return 3;
    return 0;
  };

  const awarenessLevel = (score: number): BeverageLevel => {
    if (score <= 0) return 'none';
    if (score <= 2) return 'low';
    if (score <= 5) return 'medium';
    return 'high';
  };

  const levelLabel = (level: BeverageLevel) => level.charAt(0).toUpperCase() + level.slice(1);

  const awarenessColor = (level: BeverageLevel) => {
    if (level === 'high') return '#F97316';
    if (level === 'medium') return '#2563EB';
    if (level === 'low') return '#60A5FA';
    return '#94A3B8';
  };

  const todayHydrationEntries = Array.isArray(hydrationEntries)
    ? hydrationEntries.filter((entry) => entry?.timestamp && new Date(entry.timestamp).toDateString() === new Date().toDateString())
    : null;

  const getAwareness = (field: 'caffeine_level' | 'sugar_level') => {
    if (!todayHydrationEntries) return null;
    const score = todayHydrationEntries.reduce((sum, entry) => {
      const amount = Number(entry?.amount_ml || entry?.logged_ml || 0);
      return sum + levelValue(entry?.[field]) * (amount / 250);
    }, 0);
    const level = awarenessLevel(score);
    return {
      score,
      level,
      percent: Math.min(100, (score / 5) * 100),
    };
  };

  const caffeineAwareness = getAwareness('caffeine_level');
  const sugarAwareness = getAwareness('sugar_level');
  const medicationPercent = quickStatus.medicationsTotal > 0
    ? Math.round((quickStatus.medicationsTaken / quickStatus.medicationsTotal) * 100)
    : 0;
  const recentUpdates = timeline.slice(0, 2);
  const missedCount = timeline.filter((item) => item.status === 'missed').length;
  const nextMedication = upcomingMedications[0] || null;

  const getMedicationName = (medication: any) => (
    medication?.medication_name ||
    medication?.medicine_name ||
    medication?.name ||
    medication?.title ||
    'medication'
  );

  const getMedicationTime = (medication: any) => (
    medication?.time ||
    medication?.scheduled_time ||
    medication?.reminder_time ||
    medication?.due_time ||
    medication?.next_dose_time ||
    ''
  );

  const neededMl = Math.max(0, (quickStatus.hydrationGoal || 0) - (quickStatus.hydrationTotal || 0));
  const nextAction = (() => {
    if (nextMedication) {
      const time = getMedicationTime(nextMedication);
      return `Next medication${time ? ` at ${time}` : ' soon'}`;
    }
    if (quickStatus.hydrationPercentage < 50 && neededMl >= 250) return 'Drink 250 ml now to stay on track';
    if (neededMl > 0) return `You are behind by +${neededMl} ml`;
    return 'You are on track today';
  })();

  const awarenessScore = (awareness: ReturnType<typeof getAwareness>) => {
    if (!awareness) return 100;
    if (awareness.level === 'high') return 55;
    if (awareness.level === 'medium') return 75;
    if (awareness.level === 'low') return 90;
    return 100;
  };

  const beverageScore = Math.min(100, Math.max(0, quickStatus.hydrationPercentage));
  const medicationScore = quickStatus.medicationsTotal > 0 ? medicationPercent : 100;
  const todayScore = Math.round((beverageScore + medicationScore + awarenessScore(caffeineAwareness) + awarenessScore(sugarAwareness)) / 4);
  const todayScoreColor = todayScore >= 90 ? '#10B981' : todayScore >= 70 ? '#2563EB' : todayScore >= 40 ? '#F97316' : '#EF4444';
  const hydrationBreakdown = quickStatus.hydrationPercentage >= 90 ? 'Good' : quickStatus.hydrationPercentage >= 50 ? 'Fair' : 'Low';
  const medicationBreakdown = quickStatus.medicationsTotal === 0 ? 'Clear' : medicationPercent >= 80 ? 'Good' : 'Low';
  const sugarBreakdown = levelLabel(sugarAwareness?.level ?? 'none');
  const todayScoreBreakdown = `Hydration: ${hydrationBreakdown} | Meds: ${medicationBreakdown} | Sugar: ${sugarBreakdown}`;
  const beveragePaceHint = quickStatus.hydrationPercentage >= 90 ? 'On track' : quickStatus.hydrationPercentage >= 50 ? 'Good pace' : 'You are behind today';
  const safeInsight = (() => {
    if (missedCount > 0) return 'You usually miss afternoon logs. Try logging after meals.';
    if (patterns.length > 0) return 'You are most consistent in the morning. Try logging after meals.';
    if (quickStatus.medicationsTotal > 0 && medicationPercent < 80) return 'Medication check-ins need attention today.';
    if (caffeineAwareness?.level === 'high' || sugarAwareness?.level === 'high') return 'Beverage levels are higher today. Keep portions steady.';
    return 'Your routine looks steady today. Keep the momentum.';
  })();

  const renderHeaderAvatar = () => (
    avatarSource ? (
      <Image source={avatarSource as any} style={styles.headerAvatarImage} />
    ) : (
      <Text style={styles.avatarText}>
        {(user?.name || 'U').split(' ').map((s:any)=>s[0]).slice(0,2).join('').toUpperCase()}
      </Text>
    )
  );

  const renderBeverageMini = (
    title: string,
    value: string,
    icon: string,
    color = '#2563EB',
    percent = 0,
  ) => (
    <View style={styles.beverageMiniBox}>
      <View style={styles.miniTopRow}>
        <View style={styles.miniLabelRow}>
          <View style={[styles.miniIconBubble, { backgroundColor: color === '#F97316' ? '#FFF7ED' : '#EFF6FF' }]}>
            <Ionicons name={icon as any} size={15} color={color} />
          </View>
          <Text style={styles.miniLabel}>{title}</Text>
        </View>
        <Text style={[styles.miniValue, { color }]}>{value}</Text>
      </View>
      <View style={styles.miniProgressTrack}>
        <View style={[styles.miniProgressFill, { width: `${percent}%`, backgroundColor: color }]} />
      </View>
    </View>
  );

  const getAwarenessMini = (awareness: ReturnType<typeof getAwareness>) => {
    const level = awareness?.level ?? 'none';
    const color = awarenessColor(level);
    const percent = level === 'high' ? 100 : level === 'medium' ? 66 : level === 'low' ? 33 : 0;
    return { color, label: levelLabel(level), percent };
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.header, headerElevated && styles.headerElevated, { paddingTop: Math.max(insets.top, 8) }]}>
        <View style={styles.headerBrand}>
          <TouchableOpacity style={styles.menuButton} onPress={() => setMenuVisible(true)}>
            <Ionicons name="menu" size={22} color="#1E3A8A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>IntakeSync</Text>
        </View>
          
        <TouchableOpacity 
          style={styles.profileAvatar}
          onPress={() => router.push({ pathname: '/components/pages/profile/Profile', params: { token } } as any)}
        >
          {renderHeaderAvatar()}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(event) => setHeaderElevated(event.nativeEvent.contentOffset.y > 8)}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.preContent}>

          {/* Welcome Section */}
          <View style={styles.welcomeSection}>
            <Text style={styles.welcomeText}>Hi, {displayName}</Text>
            <Text style={styles.welcomeSubtext}>Here is your routine summary for today.</Text>
          <View>
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color="#6B7280" style={styles.searchIcon} />
              <TextInput
                placeholder="Search medicine"
                style={styles.searchInput}
                placeholderTextColor="#9CA3AF"
                value={medicineSearch}
                onChangeText={setMedicineSearch}
                onFocus={() => medicineSearch.length >= 2 && setShowSuggestions(true)}
              />
              {medicineSearch.length > 0 && (
                <TouchableOpacity 
                  style={styles.searchClear}
                  onPress={() => {
                    setMedicineSearch('');
                    setShowSuggestions(false);
                  }}
                >
                  <Ionicons name="close-circle" size={20} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>
            
            {/* Medicine Suggestions Dropdown */}
            {showSuggestions && medicineSuggestions.length > 0 && (
              <View style={styles.suggestionsContainer}>
                <ScrollView style={styles.suggestionsList} nestedScrollEnabled>
                  {medicineSuggestions.map((medicine) => (
                    <TouchableOpacity
                      key={medicine.id}
                      style={styles.suggestionItem}
                      onPress={() => {
                        setMedicineSearch('');
                        setShowSuggestions(false);
                        Alert.alert(
                          medicine.name,
                          `${medicine.generic_name ? `Generic: ${medicine.generic_name}\n` : ''}${medicine.brand ? `Brand: ${medicine.brand}\n` : ''}Category: ${medicine.category}\n${medicine.description ? `\n${medicine.description}` : ''}${medicine.dosage ? `\n\nRecommended Dosage: ${medicine.dosage}` : ''}`,
                          [
                            { text: 'Close', style: 'cancel' },
                            {
                              text: 'Add to Medications',
                              onPress: () => {
                                // Determine frequency from dosage text
                                let frequency = 'daily';
                                const dosageLower = (medicine.dosage || '').toLowerCase();
                                if (dosageLower.includes('twice') || dosageLower.includes('2 times') || dosageLower.includes('every 12')) {
                                  frequency = 'twice_daily';
                                } else if (dosageLower.includes('three times') || dosageLower.includes('3 times') || dosageLower.includes('every 8')) {
                                  frequency = 'three_times_daily';
                                } else if (dosageLower.includes('four times') || dosageLower.includes('4 times') || dosageLower.includes('every 6')) {
                                  frequency = 'four_times_daily';
                                }
                                
                                router.push({ 
                                  pathname: '/components/pages/medication/Medication', 
                                  params: { 
                                    token, 
                                    medicineName: medicine.name, 
                                    medicineDosage: medicine.dosage || '',
                                    medicineData: JSON.stringify({
                                      description: medicine.description,
                                      category: medicine.category,
                                      frequency: frequency
                                    })
                                  } 
                                } as any);
                              }
                            }
                          ]
                        );
                      }}
                    >
                      <View style={styles.suggestionIcon}>
                        <Ionicons name="medical" size={20} color="#1E3A8A" />
                      </View>
                      <View style={styles.suggestionContent}>
                        <Text style={styles.suggestionName}>{medicine.name}</Text>
                        <Text style={styles.suggestionDetails}>
                          {medicine.generic_name || medicine.brand || medicine.category}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
          </View>

          {/* Dashboard Section */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Today Overview</Text>
          </View>

          <View style={styles.topSummaryGrid}>
            <View style={[styles.smartCard, styles.nextActionCard]}>
              <View style={styles.smartCardHeader}>
                <View style={[styles.smartIcon, { backgroundColor: 'rgba(37, 99, 235, 0.1)' }]}>
                  <Ionicons name="flash" size={22} color="#2563EB" />
                </View>
                <Text style={styles.smartCardLabel}>Next Action</Text>
              </View>
              <Text style={styles.nextActionText} numberOfLines={3}>{nextAction}</Text>
            </View>

            <View style={[styles.smartCard, styles.scoreCard, { borderColor: todayScoreColor, borderLeftColor: todayScoreColor }]}>
              <Text style={styles.smartCardLabel}>Today Score</Text>
              <Text style={[styles.scoreValue, { color: todayScoreColor }]}>{todayScore}%</Text>
              <Text style={styles.scoreHelper} numberOfLines={2}>{todayScoreBreakdown}</Text>
            </View>
          </View>

          {/* Beverage Intake Card */}
          <Pressable
            style={({ pressed }) => [styles.featureCard, styles.beverageCard, pressed && styles.cardPressed]}
            onPress={() => router.push({ pathname: '/components/pages/hydration/Hydration', params: { token } } as any)}
          >
            <View style={styles.summaryCardHeader}>
              <View>
                <Text style={styles.summaryCardTitle}>Beverage Intake</Text>
                <Text style={styles.summaryCardSubtitle} numberOfLines={1}>
                  {quickStatus.hydrationTotal} / {quickStatus.hydrationGoal} ml water today
                </Text>
              </View>
              <View style={styles.widgetIcon}>
                <Ionicons name="water" size={25} color="#2563EB" />
              </View>
            </View>

            <View style={styles.waterActionRow}>
              <Text style={styles.primaryMetric}>{quickStatus.hydrationPercentage}%</Text>
              <Pressable
                style={({ pressed }) => [styles.quickActionChip, pressed && styles.chipPressed]}
                onPress={async (e) => {
                e.stopPropagation();
                try {
                  // Match the Beverage screen quick-log payload so backend validation receives the expected metadata.
                  await api.post('/hydration', {
                    amount_ml: 250,
                    source: 'quick',
                    beverage_type: 'water',
                    sugar_level: 'none',
                    caffeine_level: 'none',
                    notes: null,
                  }, token as string);
                  
                  // Refresh hydration data immediately
                  const hydrationRes = await api.get('/hydration', token as string);
                  if (hydrationRes) {
                    const hydrationPercentage = Math.round(hydrationRes.percentage || 0);
                    const todayTotal = hydrationRes.today_total || 0;
                    const goal = hydrationRes.goal || 2000;
                    setHydrationEntries(Array.isArray(hydrationRes.entries) ? hydrationRes.entries : null);
                    
                    setQuickStatus(prev => ({
                      ...prev,
                      hydrationPercentage,
                      hydrationTotal: todayTotal,
                      hydrationGoal: goal
                    }));
                    
                    Toast.show({
                      type: 'success',
                      text1: 'Beverage logged',
                      text2: `+250ml - Total: ${todayTotal}ml / ${goal}ml (${hydrationPercentage}%)` ,
                      position: 'top',
                      visibilityTime: 3000,
                      topOffset: 60,
                    });
                  }
                } catch (err: any) {
                  console.log('Home quick beverage log error:', {
                    status: err?.status,
                    message: err?.data?.message || err?.message,
                    data: err?.data,
                  });
                  Toast.show({
                    type: 'error',
                    text1: 'Logging failed',
                    text2: 'Failed to log beverage intake. Please try again.',
                    position: 'top',
                    visibilityTime: 3000,
                    topOffset: 60,
                  });
                }
                }}
              >
                <Text style={styles.quickActionText}>+250 ml</Text>
              </Pressable>
            </View>

            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBar, { width: `${Math.min(quickStatus.hydrationPercentage, 100)}%` }]} />
            </View>
            <Text style={styles.beveragePaceHint}>{beveragePaceHint}</Text>

            <View style={styles.beverageMiniGrid}>
              {(() => {
                const status = getAwarenessMini(caffeineAwareness);
                return renderBeverageMini('Caffeine', status.label, 'cafe', status.color, status.percent);
              })()}
              {(() => {
                const status = getAwarenessMini(sugarAwareness);
                return renderBeverageMini('Sugar', status.label, 'ice-cream', status.color, status.percent);
              })()}
            </View>
            <Text style={styles.helperText}>Caffeine and sugar levels update from your beverage logs.</Text>
          </Pressable>

          {/* Medication Summary Card */}
          <Pressable
            style={({ pressed }) => [styles.featureCard, styles.medicationCard, pressed && styles.cardPressed]}
            onPress={() => router.push({ pathname: '/components/pages/medication/Medication', params: { token } } as any)}
          >
            <View style={styles.summaryCardHeader}>
              <View>
                <Text style={styles.summaryCardTitle}>Medication Adherence</Text>
                <Text style={styles.summaryCardSubtitle}>
                  {quickStatus.medicationsTotal === 0 
                    ? 'You are all clear today' 
                    : `${quickStatus.medicationsTaken} of ${quickStatus.medicationsTotal} taken`}
                </Text>
              </View>
              <View style={[styles.widgetIcon, styles.medicationIcon]}>
                <Ionicons name="checkmark-done-circle" size={25} color="#F97316" />
              </View>
            </View>
            <View style={styles.metricRow}>
              <Text style={[styles.primaryMetric, styles.medicationMetric]}>{medicationPercent}%</Text>
              <Pressable
                style={({ pressed }) => [styles.medicationAddChip, pressed && styles.chipPressed]}
                onPress={(e) => {
                  e.stopPropagation();
                  router.push({ pathname: '/components/pages/medication/Medication', params: { token } } as any);
                }}
              >
                <Ionicons name="medical" size={14} color="#FFFFFF" />
                <Text style={styles.quickActionText}>Add</Text>
              </Pressable>
            </View>
            {nextMedication && (
              <Text style={styles.nextMedicationText} numberOfLines={1}>
                Next: {getMedicationName(nextMedication)}{getMedicationTime(nextMedication) ? ` at ${getMedicationTime(nextMedication)}` : ''}
              </Text>
            )}
            <View style={styles.progressBarContainer}>
              <View style={[
                styles.progressBar, 
                { 
                  width: `${medicationPercent}%`, 
                  backgroundColor: '#F97316' 
                }
              ]} />
            </View>
            {quickStatus.medicationsLeft > 0 && (
              <Text style={styles.nextMedicationText}>
                {quickStatus.medicationsLeft === 1 ? '1 medication remaining' : `${quickStatus.medicationsLeft} medications remaining`}
              </Text>
            )}
            {quickStatus.medicationsTotal === 0 && (
              <Text style={styles.addMedicationHint}>Add medication</Text>
            )}
          </Pressable>

          {/* Routine Insights Card */}
          <Pressable
            style={({ pressed }) => [styles.insightsCard, styles.insightsAmberCard, pressed && styles.cardPressed]}
            onPress={handleInsightsPress}
          >
            <View style={styles.summaryCardHeader}>
              <View>
                <Text style={styles.summaryCardTitle}>Routine Insights</Text>
                <Text style={styles.summaryCardSubtitle}>
                  Weekly score: {insightsScore}%
                </Text>
              </View>
              <View style={[styles.widgetIcon, styles.insightsIcon]}>
                <Ionicons name="analytics" size={25} color="#D97706" />
              </View>
            </View>

            {weeklyReport && (
              <View style={styles.progressBarContainer}>
                <View style={[styles.progressBar, { width: `${Math.min(insightsScore, 100)}%`, backgroundColor: '#F59E0B' }]} />
              </View>
            )}
            <Text style={styles.insightPreview} numberOfLines={2}>{safeInsight}</Text>

            {recentUpdates.length > 0 && (
              <View style={styles.recentUpdatesBlock}>
                <Text style={styles.recentUpdatesTitle}>Recent updates</Text>
                {recentUpdates.map((item, index) => (
                  <Text key={`${item.id}-${index}`} style={styles.recentUpdateText} numberOfLines={1}>
                    {item.time ? `${item.time} - ` : ''}{item.title}
                  </Text>
                ))}
              </View>
            )}

            <View style={styles.weeklyReportButton}>
              <View style={styles.weeklyReportTitleRow}>
                <Ionicons name="bar-chart" size={18} color="#D97706" />
                <Text style={styles.weeklyReportTitle}>View weekly report</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#D97706" />
            </View>
          </Pressable>

          {snoozeSuggestions.length > 0 && (
            <View style={styles.snoozeCard}>
              <View style={styles.snoozeHeader}>
                <Ionicons name="time" size={20} color="#F97316" />
                <Text style={styles.snoozeTitle}>Reminder Suggestions</Text>
              </View>
              {snoozeSuggestions.slice(0, 2).map((suggestion, index) => (
                <Text key={index} style={styles.snoozeMessage} numberOfLines={2}>{suggestion.message}</Text>
              ))}
            </View>
          )}
        </View>

      </ScrollView>

      {/* Bottom Navigation */}
      <BottomNavigation currentRoute="home" />

      {/* Menu Modal */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity 
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View style={styles.menuContainer}>
            <View style={styles.menuHeader}>
              <View style={styles.menuUserRow}>
                <View style={styles.menuAvatar}>
                  {renderHeaderAvatar()}
                </View>
                <View>
                  <Text style={styles.menuTitle}>Menu</Text>
                  <Text style={styles.menuSubtitle}>{displayName}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setMenuVisible(false)}>
                <Ionicons name="close" size={24} color="#1F2937" />
              </TouchableOpacity>
            </View>
            {menuItems.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={styles.menuItem}
                onPress={() => handleMenuAction(item)}
                activeOpacity={0.75}
              >
                <View style={[
                  styles.menuItemIcon,
                  item.label === 'Sign Out' && styles.menuItemIconDanger
                ]}>
                  <Ionicons name={item.icon as any} size={20} color={item.label === 'Sign Out' ? '#EF4444' : '#1E3A8A'} />
                </View>
                <Text style={[styles.menuItemText, item.label === 'Sign Out' && styles.menuItemTextDanger]}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Goal Completion Modal */}
      <Modal
        visible={showGoalCompletionModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGoalCompletionModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.goalModalContent}>
            <View style={styles.goalModalHeader}>
              <Ionicons name="checkmark-circle" size={64} color="#10B981" />
              <Text style={styles.goalModalTitle}>🎉 Goal Achieved!</Text>
              <Text style={styles.goalModalSubtitle}>Amazing progress on your beverage intake goal.</Text>
            </View>
            
            <View style={styles.goalModalStats}>
              <View style={styles.goalStatBox}>
                <Text style={styles.goalStatValue}>{quickStatus.hydrationPercentage}%</Text>
                <Text style={styles.goalStatLabel}>Beverage Intake</Text>
              </View>
            </View>

            <Text style={styles.goalModalMessage}>
              You have reached 100% of your daily beverage intake goal. Keep up the steady routine.
            </Text>

            <TouchableOpacity 
              style={styles.goalModalButton}
              onPress={() => setShowGoalCompletionModal(false)}
            >
              <Text style={styles.goalModalButtonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Over-Hydration Warning Modal */}
      <Modal
        visible={showOverHydrationModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowOverHydrationModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.overHydrationModalContent}>
            <View style={styles.overHydrationModalHeader}>
              <Ionicons name="warning" size={64} color="#F59E0B" />
              <Text style={styles.overHydrationModalTitle}>Beverage Intake Alert</Text>
              <Text style={styles.overHydrationModalSubtitle}>You have exceeded your goal</Text>
            </View>
            
            <View style={styles.goalModalStats}>
              <View style={styles.overHydrationStatBox}>
                <Text style={styles.overHydrationStatValue}>{quickStatus.hydrationPercentage}%</Text>
                <Text style={styles.goalStatLabel}>Current Level</Text>
              </View>
            </View>

            <Text style={styles.overHydrationModalMessage}>
              You are at {quickStatus.hydrationPercentage}% of your daily goal. Consider slowing down and spacing beverage intake evenly.
            </Text>

            <View style={styles.overHydrationTips}>
              <View style={styles.tipItem}>
                <Ionicons name="information-circle" size={20} color="#3B82F6" />
                <Text style={styles.tipText}>Listen to your body signals</Text>
              </View>
              <View style={styles.tipItem}>
                <Ionicons name="information-circle" size={20} color="#3B82F6" />
                <Text style={styles.tipText}>Space out water intake evenly</Text>
              </View>
            </View>

            <TouchableOpacity 
              style={styles.overHydrationModalButton}
              onPress={() => setShowOverHydrationModal(false)}
            >
              <Text style={styles.goalModalButtonText}>Got It</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 112,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: '#F8F9FA',
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
    zIndex: 10,
  },
  headerElevated: {
    borderBottomColor: '#DBEAFE',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1E3A8A',
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  profileAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#1E3A8A',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#BFDBFE',
  },
  headerAvatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    color: 'white',
    fontWeight: '800',
    fontSize: 18,
  },
  welcomeSection: {
    paddingTop: 18,
    marginBottom: 18,
  },
  welcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  welcomeText: {
    fontSize: 30,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 6,
  },
  welcomeKicker: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2563EB',
    marginBottom: 4,
  },
  welcomeSubtext: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
    marginBottom: 14,
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  tierBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1F2937',
  },
  searchClear: {
    padding: 4,
  },
  suggestionsContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginTop: 8,
    maxHeight: 300,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  suggestionsList: {
    maxHeight: 300,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  suggestionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  suggestionContent: {
    flex: 1,
  },
  suggestionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  suggestionDetails: {
    fontSize: 13,
    color: '#6B7280',
  },
  statusCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  statusText: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  statusIllustration: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EBF8FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  topSummaryGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  smartCard: {
    flex: 1,
    minHeight: 108,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    justifyContent: 'center',
  },
  nextActionCard: {
    borderColor: '#BFDBFE',
    borderLeftWidth: 4,
    borderLeftColor: '#2563EB',
  },
  scoreCard: {
    borderColor: '#DBEAFE',
    borderLeftWidth: 4,
    borderLeftColor: '#2563EB',
    alignItems: 'flex-start',
  },
  smartCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  smartIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  smartCardLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
  },
  nextActionText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E3A8A',
    lineHeight: 20,
  },
  scoreValue: {
    fontSize: 30,
    fontWeight: '900',
    color: '#1E3A8A',
    marginTop: 4,
  },
  scoreHelper: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 15,
  },
  cardPressed: {
    transform: [{ scale: 0.97 }],
  },
  seeAllButton: {
    padding: 4,
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  categoryCard: {
    width: (width - 52) / 2,
    aspectRatio: 1,
    backgroundColor: '#1E3A8A',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  categoryText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  timelineCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    minHeight: 100,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  timelineItem: {
    marginBottom: 12,
  },
  timelineItemContent: {
    flexDirection: 'row',
  },
  timelineLeft: {
    width: 24,
    alignItems: 'center',
    marginRight: 12,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#1E3A8A',
    zIndex: 1,
  },
  timelineLine: {
    position: 'absolute',
    top: 12,
    left: 5,
    width: 2,
    height: '100%',
    backgroundColor: '#DBEAFE',
  },
  timelineRight: {
    flex: 1,
    paddingBottom: 2,
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  timelineTime: {
    color: '#1E3A8A',
    fontSize: 14,
    fontWeight: '700',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  timelineActivityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  timelineIcon: {
    marginRight: 8,
  },
  timelineActivity: {
    color: '#1F2937',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  timelineBody: {
    color: '#64748B',
    fontSize: 13,
    marginTop: 2,
    marginLeft: 26,
    lineHeight: 19,
  },
  timelineEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyIcon: {
    marginBottom: 16,
    opacity: 0.6,
  },
  timelineEmptyText: {
    color: '#1F2937',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  timelineEmptySubtext: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
  },
  // Summary Cards Styles
  featureCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  beverageCard: {
    backgroundColor: 'rgba(37, 99, 235, 0.03)',
    borderColor: '#BFDBFE',
    borderLeftWidth: 4,
    borderLeftColor: '#2563EB',
  },
  summaryCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  summaryCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  summaryCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  primaryMetric: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1E3A8A',
    marginBottom: 4,
  },
  waterActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  medicationMetric: {
    color: '#F97316',
  },
  medicationCard: {
    borderColor: '#FED7AA',
    borderLeftWidth: 4,
    borderLeftColor: '#F97316',
  },
  medicationIcon: {
    backgroundColor: 'rgba(249, 115, 22, 0.1)',
    borderColor: '#FED7AA',
  },
  addMedicationHint: {
    fontSize: 12,
    fontWeight: '800',
    color: '#F97316',
    marginTop: 2,
  },
  widgetIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  widgetIconSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    marginBottom: 10,
  },
  compactGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  awarenessCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  compactCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 6,
  },
  awarenessLevelText: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
  },
  compactProgressTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
    marginBottom: 8,
  },
  compactProgressFill: {
    height: '100%',
    borderRadius: 999,
  },
  helperText: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 13,
  },
  beverageMiniGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
    marginBottom: 4,
  },
  beverageMiniBox: {
    flex: 1,
    backgroundColor: 'rgba(37, 99, 235, 0.04)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#EAF2FF',
  },
  miniTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 7,
  },
  miniLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  miniIconBubble: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  miniLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E3A8A',
  },
  miniValue: {
    fontSize: 12,
    fontWeight: '900',
  },
  miniProgressTrack: {
    height: 5,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#DDEBFF',
  },
  miniProgressFill: {
    height: '100%',
    borderRadius: 999,
  },
  beveragePaceHint: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
    marginTop: -2,
    marginBottom: 6,
  },
  insightsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  insightPreview: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 19,
  },
  insightsAmberCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FDE68A',
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
    shadowColor: '#F59E0B',
  },
  insightsIcon: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: '#FDE68A',
  },
  recentUpdatesBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#FDE68A',
  },
  recentUpdatesTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#92400E',
    marginBottom: 6,
  },
  recentUpdateText: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 18,
  },
  weeklyReportButton: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#FDE68A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryCardSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 4,
  },
  quickActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B82F6',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    justifyContent: 'center',
    gap: 6,
  },
  quickActionChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 999,
    justifyContent: 'center',
    gap: 4,
    marginTop: 0,
  },
  medicationAddChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F97316',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 999,
    justifyContent: 'center',
    gap: 4,
  },
  chipPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.88,
  },
  quickActionText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  nextMedicationText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
    marginTop: 2,
  },
  allCaughtUpContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyStateIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  allCaughtUpText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginTop: 16,
  },
  allCaughtUpSubtext: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
  },
  // Menu Modal Styles
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.32)',
    justifyContent: 'flex-start',
    paddingTop: 72,
    paddingHorizontal: 14,
  },
  menuContainer: {
    backgroundColor: 'white',
    borderRadius: 22,
    paddingTop: 14,
    paddingBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 10,
  },
  menuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#DBEAFE',
  },
  menuUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: 'hidden',
    backgroundColor: '#1E3A8A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 2,
    borderColor: '#BFDBFE',
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1F2937',
  },
  menuSubtitle: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  menuItemIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemIconDanger: {
    backgroundColor: '#FEF2F2',
  },
  menuItemText: {
    flex: 1,
    fontSize: 15,
    color: '#1F2937',
    marginLeft: 12,
    fontWeight: '700',
  },
  menuItemTextDanger: {
    color: '#EF4444',
  },
  // Premium Badge Styles
  premiumBadge: {
    backgroundColor: '#FFF7ED',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  plusBadge: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#60A5FA',
  },
  premiumBadgeContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  premiumBadgeText: {
    flex: 1,
    marginLeft: 12,
  },
  premiumBadgeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 2,
  },
  premiumBadgeSubtitle: {
    fontSize: 13,
    color: '#6B7280',
  },
  // Premium Popup Styles
  premiumPopupOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  premiumPopupContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  premiumPopupHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  premiumPopupTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    marginTop: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  premiumPopupPrice: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1E3A8A',
  },
  premiumFeaturesList: {
    marginBottom: 24,
  },
  premiumFeatureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  premiumFeatureText: {
    fontSize: 15,
    color: '#4B5563',
    marginLeft: 12,
    flex: 1,
  },
  premiumPopupActions: {
    gap: 12,
  },
  premiumPopupButton: {
    backgroundColor: '#1E3A8A',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  premiumPopupButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  premiumPopupCloseButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  premiumPopupCloseText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '500',
  },
  weeklyReportSummary: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E3A8A',
  },
  premiumCongratsContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  premiumCongratsTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginTop: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  premiumCongratsBody: {
    fontSize: 15,
    color: '#4B5563',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  premiumCongratsButton: {
    backgroundColor: '#1E3A8A',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    width: '100%',
  },
  premiumCongratsButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  insightsTeaserContainer: {
    marginTop: 8,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  insightsTeaserButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#F59E0B',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  insightsTeaserButtonText: {
    color: '#F59E0B',
    fontSize: 13,
    fontWeight: '700',
  },
  plusCongratsContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  plusCongratsTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginTop: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  plusCongratsBody: {
    fontSize: 15,
    color: '#374151',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  plusFeatureList: {
    width: '100%',
    marginBottom: 16,
  },
  plusFeatureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  plusFeatureText: {
    fontSize: 15,
    color: '#1F2937',
    fontWeight: '600',
  },
  plusCongratsButton: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    width: '100%',
  },
  plusCongratsButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  // Weekly Report Card Styles
  weeklyReportCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  weeklyReportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weeklyReportTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  weeklyReportMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  weeklyReportTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  weeklyReportContent: {
    paddingTop: 14,
  },
  weeklyReportItem: {
    marginBottom: 12,
  },
  weeklyReportLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  weeklyReportValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1E3A8A',
    marginBottom: 4,
  },
  weeklyReportMessage: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 18,
  },
  weeklyReportDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 12,
  },
  weeklyReportScore: {
    backgroundColor: '#EBF8FF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  weeklyReportScoreLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  weeklyReportScoreValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  // Patterns Card Styles
  patternsCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  patternsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  patternsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginLeft: 12,
  },
  patternItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
  },
  patternText: {
    flex: 1,
    fontSize: 14,
    color: '#4B5563',
    marginLeft: 12,
    lineHeight: 20,
  },
  // Snooze Card Styles
  snoozeCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  snoozeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  snoozeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginLeft: 8,
  },
  snoozeItem: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
  },
  snoozeMessage: {
    fontSize: 14,
    color: '#4B5563',
    marginBottom: 8,
    lineHeight: 20,
  },
  snoozeActionButton: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  snoozeActionText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  // Pre-content wrapper to stabilize sticky header index
  preContent: {
    paddingTop: 0,
  },
  // Sticky header background
  stickyHeader: {
    backgroundColor: '#F8F9FA',
  },
  // Divider after Categories
  sectionDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 4,
  },
  // Modal Overlay
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  // Goal Completion Modal Styles
  goalModalContent: {
    backgroundColor: 'white',
    borderRadius: 24,
    padding: 28,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  goalModalHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  goalModalTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
    marginTop: 16,
    textAlign: 'center',
  },
  goalModalSubtitle: {
    fontSize: 15,
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'center',
  },
  goalModalStats: {
    width: '100%',
    marginBottom: 20,
  },
  goalStatBox: {
    backgroundColor: '#ECFDF5',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#10B981',
  },
  goalStatValue: {
    fontSize: 48,
    fontWeight: '700',
    color: '#10B981',
    marginBottom: 4,
  },
  goalStatLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  goalModalMessage: {
    fontSize: 15,
    color: '#4B5563',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  goalModalButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  goalModalButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  // Over-Hydration Modal Styles
  overHydrationModalContent: {
    backgroundColor: 'white',
    borderRadius: 24,
    padding: 28,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  overHydrationModalHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  overHydrationModalTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1F2937',
    marginTop: 16,
    textAlign: 'center',
  },
  overHydrationModalSubtitle: {
    fontSize: 15,
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'center',
  },
  overHydrationStatBox: {
    backgroundColor: '#FFF7ED',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#F59E0B',
  },
  overHydrationStatValue: {
    fontSize: 48,
    fontWeight: '700',
    color: '#F59E0B',
    marginBottom: 4,
  },
  overHydrationModalMessage: {
    fontSize: 15,
    color: '#4B5563',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  overHydrationTips: {
    width: '100%',
    backgroundColor: '#F0F9FF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  tipText: {
    fontSize: 14,
    color: '#1F2937',
    marginLeft: 10,
    flex: 1,
  },
  overHydrationModalButton: {
    backgroundColor: '#F59E0B',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
});



