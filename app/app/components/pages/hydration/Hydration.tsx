import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, SafeAreaView, ScrollView, Animated, Easing, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import Constants from 'expo-constants';
import * as api from '../../../api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCacheOwner, getCachedSession, getUserScopedKey, readHydrationCache, writeHydrationCache, updateCachedHydrationGoal } from '../../../../services/offlineStorage';
import { enqueueBeverageLog, markBeverageLogSynced, processBeverageQueue, type BeverageLogPayload } from '../../../../services/syncQueue';
import BottomNavigation from '../../navigation/BottomNavigation';
import ThemedNoticeModal, { ThemedNoticeType } from '../../common/ThemedNoticeModal';
import InlineNotice from '../../common/InlineNotice';
import InlineSyncNotice from '../../common/InlineSyncNotice';
import Ionicons from '@expo/vector-icons/Ionicons';
import { cancelHydrationNotifications, rescheduleHydrationNotifications } from '../../../../services/notificationService';
import { calculateHydrationPace } from '../../../../hooks/useHydrationGoal';
import {
  calculatePersonalizedHydrationGoal,
  resolveHydrationGoal,
} from '../../../../utils/hydrationHelpers';
import { usePulseAnimation } from '../../../../hooks/useHydrationAnimations';
import { FONT_SCALE } from '../../../../utils/fontScaling';

interface UserDetails {
  weight?: number;
  height?: number;
  gender?: string;
  climate?: string;
  exercise_frequency?: string;
  age?: number;
  daily_hydration_goal?: number;
  hydration_goal?: number;
  daily_goal_ml?: number;
}

type BeverageType = 'water' | 'sugar_sweetened' | 'caffeinated' | 'other_non_alcoholic';
type BeverageLevel = 'none' | 'low' | 'medium' | 'high';

const QUICK_WATER_AMOUNTS = [250, 500, 750, 1000];
const isExpoGo = (Constants as any).appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';
const HYDRATION_GOAL_REACHED_SHOWN_PREFIX = 'intakesync.hydration.goalReachedShown';

function createLocalId() {
  return `bev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function entryKey(entry: any) {
  return String(entry?.id ?? entry?.local_id ?? `${entry?.timestamp ?? ''}:${entry?.amount_ml ?? ''}:${entry?.source ?? ''}:${entry?.drink_label ?? ''}`);
}

function getLocalDateKey(date: Date | string) {
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function mergeEntries(primary: any[], secondary: any[]) {
  const seen = new Set<string>();
  const merged: any[] = [];
  [...primary, ...secondary].forEach((entry) => {
    const key = entryKey(entry);
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(entry);
  });
  return merged.sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
}

function totalForLocalDay(sourceEntries: any[], date = new Date()) {
  const dateKey = getLocalDateKey(date);
  return sourceEntries.reduce((sum, entry) => (
    sum + (entry?.timestamp && getLocalDateKey(entry.timestamp) === dateKey ? Number(entry.amount_ml || 0) : 0)
  ), 0);
}

const DRINK_OPTIONS: {
  value: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  beverageType: BeverageType;
  defaultSugar: BeverageLevel;
  defaultCaffeine: BeverageLevel;
}[] = [
  { value: 'water', label: 'Water', icon: 'water', beverageType: 'water', defaultSugar: 'none', defaultCaffeine: 'none' },
  { value: 'coffee', label: 'Coffee', icon: 'cafe', beverageType: 'caffeinated', defaultSugar: 'none', defaultCaffeine: 'medium' },
  { value: 'tea', label: 'Tea', icon: 'cafe-outline', beverageType: 'caffeinated', defaultSugar: 'none', defaultCaffeine: 'low' },
  { value: 'energy_drink', label: 'Energy drink', icon: 'flash', beverageType: 'caffeinated', defaultSugar: 'medium', defaultCaffeine: 'high' },
  { value: 'soda', label: 'Soda', icon: 'wine', beverageType: 'sugar_sweetened', defaultSugar: 'high', defaultCaffeine: 'none' },
  { value: 'juice', label: 'Juice', icon: 'nutrition', beverageType: 'sugar_sweetened', defaultSugar: 'medium', defaultCaffeine: 'none' },
  { value: 'milk_tea', label: 'Milk tea', icon: 'cafe', beverageType: 'sugar_sweetened', defaultSugar: 'medium', defaultCaffeine: 'low' },
  { value: 'other', label: 'Other', icon: 'options', beverageType: 'other_non_alcoholic', defaultSugar: 'none', defaultCaffeine: 'none' },
];

const LEVEL_OPTIONS: { value: BeverageLevel; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

function getLevelLabel(value?: string) {
  return LEVEL_OPTIONS.find((option) => option.value === value)?.label || 'None';
}

function getLevelScore(value?: string) {
  switch (value) {
    case 'low':
      return 1;
    case 'medium':
      return 2;
    case 'high':
      return 3;
    default:
      return 0;
  }
}

function getAwarenessLevel(score: number): BeverageLevel {
  if (score > 5) return 'high';
  if (score > 2) return 'medium';
  if (score > 0) return 'low';
  return 'none';
}

function getBeverageBaseLabel(entry: any) {
  if (typeof entry?.drink_label === 'string' && entry.drink_label.trim()) return entry.drink_label.trim();
  if (entry?.beverage_type === 'caffeinated') return 'Caffeinated beverage';
  if (entry?.beverage_type === 'sugar_sweetened') return 'Sugar-sweetened drink';
  if (entry?.beverage_type === 'other_non_alcoholic') return 'Other beverage';
  return 'Water';
}

function getBeverageLabel(entry: any) {
  const note = typeof entry?.notes === 'string' ? entry.notes.trim() : '';
  const label = getBeverageBaseLabel(entry);
  return note ? `${label} (${note})` : label;
}

function formatSource(source?: string) {
  if (source === 'quick') return 'Quick add';
  if (source === 'custom') return 'Custom';
  if (source === 'reminder') return 'Reminder';
  return 'Manual';
}

function formatLogTitle(entry: any) {
  const label = getBeverageLabel(entry);
  const parts = [label];
  if (entry?.beverage_type === 'caffeinated' && entry?.caffeine_level && entry.caffeine_level !== 'none') {
    parts.push(`Caffeine: ${getLevelLabel(entry.caffeine_level)}`);
  }
  if (entry?.beverage_type === 'sugar_sweetened' && entry?.sugar_level && entry.sugar_level !== 'none') {
    parts.push(`Sugar: ${getLevelLabel(entry.sugar_level)}`);
  }
  if (entry?.beverage_type === 'other_non_alcoholic') {
    if (entry?.sugar_level && entry.sugar_level !== 'none') parts.push(`Sugar: ${getLevelLabel(entry.sugar_level)}`);
    if (entry?.caffeine_level && entry.caffeine_level !== 'none') parts.push(`Caffeine: ${getLevelLabel(entry.caffeine_level)}`);
  }
  if (entry?.beverage_type === 'water') parts.push(formatSource(entry?.source));
  return parts.join(' • ');
}

/**
 * Calculate daily hydration goal based on user profile
 * @param user User profile details
 * @returns Daily goal in milliliters
 */
function calculateDailyGoal(user: UserDetails | null): number {
  return calculatePersonalizedHydrationGoal(user || {});
}

/**
 * HYDRATION SCREEN - EXPO GO COMPATIBLE
 * 
 * This component uses ONLY Expo Go-compatible notification features.
 * NO native modules, NO push tokens, NO background tasks.
 * 
 * NOTIFICATION TYPES:
 * 1. In-App Toast Messages: For hydration reminders and progress updates
 *    - Uses react-native-toast-message
 *    - Works in Expo Go without any build
 * 
 * 2. Alert Dialogs: For critical warnings and confirmations
 *    - Uses React Native Alert API
 *    - System-style dialogs
 * 
 * 3. In-App Timers: For reminders while app is open
 *    - Uses JavaScript setInterval/setTimeout
 *    - Checks on app resume via AppState
 * 
 * 4. Custom Modals: For rich notification content
 *    - Goal completion celebrations
 *    - Daily summaries
 */

export default function Hydration() {
  const { token: routeToken } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const [cachedToken, setCachedToken] = useState<string | undefined>();
  const token = (routeToken as string | undefined) || cachedToken;
  const [goal, setGoal] = useState<number>(2000);
  const [idealGoal, setIdealGoal] = useState<number | null>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [amountInput, setAmountInput] = useState('');
  const [cacheReady, setCacheReady] = useState(false);
  const [hasHydrationCache, setHasHydrationCache] = useState(false);
  const [historyRange] = useState<'daily'|'weekly'|'monthly'>('daily');
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [missedCount, setMissedCount] = useState<number>(0);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [calendarData, setCalendarData] = useState<any[]>([]);
  const [showIdealGoalAlert, setShowIdealGoalAlert] = useState(false);
  const [showInitialGoalModal, setShowInitialGoalModal] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [goalReachedToday, setGoalReachedToday] = useState(false); // Track if goal was already reached today
  const [overhydrationShownToday, setOverhydrationShownToday] = useState(false); // Track if warning shown today
  const [customGoalInput, setCustomGoalInput] = useState('');
  const [showGoalEditorModal, setShowGoalEditorModal] = useState(false);
  const [goalUpdateResult, setGoalUpdateResult] = useState<{ goal: number; synced: boolean } | null>(null);
  const [selectedDrink, setSelectedDrink] = useState('water');
  const [beverageType, setBeverageType] = useState<BeverageType>('water');
  const [sugarLevel, setSugarLevel] = useState<BeverageLevel>('none');
  const [caffeineLevel, setCaffeineLevel] = useState<BeverageLevel>('none');
  const [beverageNotes, setBeverageNotes] = useState('');
  const [customBeverageName, setCustomBeverageName] = useState('');
  const [initialGoalStep, setInitialGoalStep] = useState<'choice' | 'custom'>('choice');
  const [deletedEntryKeys, setDeletedEntryKeys] = useState<Set<string>>(new Set());
  const [hasScrolled, setHasScrolled] = useState(false);
  const [calendarExpanded, setCalendarExpanded] = useState(false);
  const [quickWaterFeedback, setQuickWaterFeedback] = useState<number | null>(null);
  const [inlineNotice, setInlineNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const canUseHydrationCacheRef = useRef(false);
  const previousTokenRef = useRef<string | undefined>(undefined);
  const entriesRef = useRef<any[]>([]);
  const goalRef = useRef(goal);
  const [noticeModal, setNoticeModal] = useState<{
    type: ThemedNoticeType;
    title: string;
    message: string;
    primaryText?: string;
    secondaryText?: string;
    loading?: boolean;
    onPrimary?: () => void | Promise<void>;
  } | null>(null);

  const anim = useRef(new Animated.Value(0)).current;
  const { pulse: pulseButton } = usePulseAnimation();

  // FIX: Session-based refs to prevent repeated modals in a single session
  // These refs track if a modal has already been shown since the app launched
  // They reset when the app is closed, but persist while the app is open
  const goalReachedShownRef = useRef(false);
  const overhydrationShownRef = useRef(false);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    goalRef.current = goal;
  }, [goal]);

  const fmt = (n:number) => {
    try { return n.toLocaleString(); } catch { return String(n); }
  };

  const closeNotice = () => setNoticeModal(null);
  const showNotice = (type: ThemedNoticeType, title: string, message: string, primaryText = 'OK') => {
    void type;
    void primaryText;
    showInlineNotice(`${title}: ${message}`);
  };

  useEffect(() => {
    if (routeToken) return;
    getCachedSession()
      .then((session) => setCachedToken(session?.token))
      .catch(() => {});
  }, [routeToken]);

  async function syncHydrationReminderLifecycle(total: number, nextGoal = goal) {
    await rescheduleHydrationNotifications({
      currentTotal: total,
      goal: nextGoal,
    });
  }

  // FIX #3: Listen for notification taps to show confirmation modal
  useEffect(() => {
    let subscription: { remove: () => void } | null = null;

    if (isExpoGo) {
      console.log('Expo Go detected: using local notifications only.');
      return () => {};
    }

    try {
      const Notifications = require('expo-notifications');
      subscription = Notifications.addNotificationResponseReceivedListener((response: any) => {
        console.log('Notification tapped:', response);
        const data = response.notification.request.content.data;

        // If it's a hydration notification and water was logged, show the goal reached modal
        if (data?.type === 'hydration' && totalToday() >= goal) {
          void showGoalReachedOnce();
        }
      });
    } catch {
      console.log('Expo Go detected: using local notifications only.');
    }

    return () => subscription?.remove();
  }, [goal]);

  // FIX #1: Reset goalReachedToday and overhydrationShownToday at midnight each day
  useEffect(() => {
    const checkMidnight = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const msUntilMidnight = midnight.getTime() - now.getTime();
      
      const timer = setTimeout(() => {
        console.log('Midnight reset: clearing flags');
        goalReachedShownRef.current = false;
        overhydrationShownRef.current = false;
        setGoalReachedToday(false);
        setOverhydrationShownToday(false);
        void syncHydrationReminderLifecycle(totalForLocalDay(entriesRef.current), goalRef.current);
        // Recursively check again for next midnight
        checkMidnight();
      }, msUntilMidnight);
      
      return timer;
    };
    
    const timer = checkMidnight();
    return () => clearTimeout(timer);
  // Uses refs for the latest entries/goal so the midnight timer is not recreated on every log.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show initial goal modal on first load if no current-user goal cache exists
  useEffect(() => {
    if (cacheReady && !hasHydrationCache) {
      setShowInitialGoalModal(true);
    }
  }, [cacheReady, hasHydrationCache]);


  // Calendar functions
  function generateCalendarDays() {
    const startDate = calendarExpanded
      ? new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
      : new Date(currentMonth);

    if (calendarExpanded) {
      startDate.setDate(startDate.getDate() - startDate.getDay());
    } else {
      startDate.setDate(startDate.getDate() - startDate.getDay());
    }
    
    const days = [];
    const dayCount = calendarExpanded ? 42 : 7;
    
    for (let i = 0; i < dayCount; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);
      
      const dateStr = getLocalDateKey(currentDate);
      const dayData = calendarData.find(d => d.date === dateStr);
      const isToday = dateStr === getLocalDateKey(new Date());
      const isSelected = dateStr === getLocalDateKey(selectedDate);
      
      days.push({
        date: new Date(currentDate), // Create a new Date object
        dateStr,
        amount: dayData?.amount_ml || 0,
        percentage: dayData ? (dayData.amount_ml / goal) * 100 : 0,
        isToday,
        isSelected,
        isCurrentMonth: currentDate.getMonth() === currentMonth.getMonth()
      });
    }
    
    return days;
  }

  function navigateMonth(direction: 'prev' | 'next') {
    const newMonth = new Date(currentMonth);
    if (calendarExpanded) {
      newMonth.setMonth(newMonth.getMonth() + (direction === 'prev' ? -1 : 1));
    } else if (direction === 'prev') {
      newMonth.setDate(newMonth.getDate() - 7);
    } else {
      newMonth.setDate(newMonth.getDate() + 7);
    }
    setCurrentMonth(newMonth);
  }

  function showInlineNotice(message: string) {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setInlineNotice(message);
    noticeTimerRef.current = setTimeout(() => setInlineNotice(null), 2400);
  }

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  async function showGoalReachedOnce() {
    if (goalReachedShownRef.current) return;
    const today = getLocalDateKey(new Date());
    const session = await getCachedSession();
    const sessionMatchesToken = !token || session?.token === token;
    const owner = getCacheOwner(sessionMatchesToken ? session?.user : null);
    const shownKey = owner.owner_id || owner.owner_email
      ? getUserScopedKey(owner, `hydration_goal_reached_shown:${today}`)
      : `${HYDRATION_GOAL_REACHED_SHOWN_PREFIX}.${today}`;
    const alreadyShown = await AsyncStorage.getItem(shownKey);
    if (alreadyShown === '1') {
      goalReachedShownRef.current = true;
      setGoalReachedToday(true);
      return;
    }
    goalReachedShownRef.current = true;
    setGoalReachedToday(true);
    await AsyncStorage.setItem(shownKey, '1');
    showInlineNotice('Hydration goal reached');
  }

  function quickAddWater(amount: number) {
    setQuickWaterFeedback(amount);
    void addAmount(amount, 'quick');
    setTimeout(() => setQuickWaterFeedback(null), 450);
  }

  useEffect(() => {
    let cancelled = false;

    async function initializeFromCacheThenRefresh() {
      let cachedEntries: any[] = [];
      try {
        const activeToken = token as string | undefined;
        const tokenChanged = previousTokenRef.current !== activeToken;
        previousTokenRef.current = activeToken;

        if (tokenChanged) {
          setCacheReady(false);
          setHasHydrationCache(false);
          setEntries([]);
          setHistoryData([]);
          setCalendarData([]);
          setMissedCount(0);
          setUserProfile(null);
          setIdealGoal(null);
          setGoal(2000);
        }

        const session = await getCachedSession();
        const sessionMatchesToken = !activeToken || session?.token === activeToken;
        canUseHydrationCacheRef.current = Boolean(sessionMatchesToken && (session?.user?.id || session?.user?.user_id || session?.user?.email));
        const local = canUseHydrationCacheRef.current ? await readHydrationCache<any>() : null;
        if (cancelled) return;

        if (local && (Array.isArray(local.entries) || local.goal)) {
          const parsed = local;
          const parsedGoal = parsed.goal ?? resolveHydrationGoal(parsed.user_profile) ?? 2000;
          setGoal(parsedGoal);
          const filteredEntries = (parsed.entries ?? []).filter((e: any) => 
            !deletedEntryKeys.has(entryKey(e))
          );
          cachedEntries = filteredEntries;
          setEntries(filteredEntries);
          setUserProfile(parsed.user_profile ?? null);
          setMissedCount((parsed.missed || []).length || 0);
          setHasHydrationCache(true);
          const cachedTodayTotal = totalForLocalDay(filteredEntries);
          setGoalReachedToday(cachedTodayTotal >= parsedGoal);
          await syncHydrationReminderLifecycle(cachedTodayTotal, parsedGoal);
        }

        setCacheReady(true);

        if (token) {
          setSyncing(true);
          await syncPendingBeverages(false);
          if (cancelled) return;

          setSyncing(true);
          const res = await api.get('/hydration', token as string, cachedEntries.length > 0 ? 5000 : 10000);
          if (cancelled) return;
          if (res) {
            setOfflineMode(false);
            setUserProfile(res.user_profile); // Store user profile for calculations
            
            const profileGoal = calculateDailyGoal(res.user_profile);
            const backendGoal = Number(res.daily_goal_ml || res.hydration_goal || res.daily_hydration_goal || 0);
            const finalGoal = backendGoal || resolveHydrationGoal(res.user_profile) || 2000;
            setGoal(finalGoal);
            setIdealGoal(profileGoal);
            
            // Filter out deleted entries from server response
            const pendingEntries = cachedEntries.filter((e: any) => e.sync_status === 'pending' || e.sync_status === 'failed');
            const serverEntries = (res.entries ?? []).filter((e: any) => 
              !deletedEntryKeys.has(entryKey(e))
            );
            const finalEntries = mergeEntries(serverEntries, pendingEntries);
            setEntries(finalEntries);
            setMissedCount((res.missed || []).length || 0);
            
            if (canUseHydrationCacheRef.current) {
              await writeHydrationCache({
                ...res,
                goal: finalGoal,
                entries: finalEntries
              });
              setHasHydrationCache(true);
            }
            
            // FIX #1: Check if goal was already reached today (prevent modal flashing on re-render)
            const todayTotal = finalEntries.filter((e: any) => {
              const entryDate = new Date(e.timestamp).toDateString();
              const today = new Date().toDateString();
              return entryDate === today;
            }).reduce((sum: number, e: any) => sum + e.amount_ml, 0);
            
            if (todayTotal >= finalGoal) {
              setGoalReachedToday(true);
            }
            await syncHydrationReminderLifecycle(todayTotal, finalGoal);
            
            // Show ideal goal popup if it's different from current goal
            if (profileGoal && profileGoal !== finalGoal && finalGoal === 2000) {
              setTimeout(() => {
                setShowIdealGoalAlert(true);
              }, 500);
            }
          }
        }
      } catch (err:any) {
        console.log('Hydration load error', err);
        if (api.isNetworkError(err)) {
          setOfflineMode(true);
          showInlineNotice('Offline mode - changes will sync when connected.');
        }
      } finally {
        if (!cancelled) {
          setCacheReady(true);
          setSyncing(false);
        }
      }
    }

    initializeFromCacheThenRefresh();
    return () => {
      cancelled = true;
    };
  // Cache/backend hydration loading intentionally runs from token and local delete markers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, deletedEntryKeys]);

  async function syncPendingBeverages(showResult = true) {
    if (!token) return;
    setSyncing(true);
    try {
      const result = await processBeverageQueue(token as string, async (localId, response) => {
        setEntries((current) => {
          const next = current.map((entry) => {
            if (entry.local_id !== localId) return entry;
            return {
              ...entry,
              id: response?.id ?? response?.entry?.id ?? entry.id,
              sync_status: 'synced',
            };
          });
          void persistLocal({ goal, entries: next });
          return next;
        });
      });
      if (result.synced > 0) {
        setOfflineMode(false);
        if (showResult) showInlineNotice('Changes synced');
      }
    } catch {
      setOfflineMode(true);
      if (showResult) showInlineNotice('Still offline. Changes are saved on this device.');
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    async function loadHistory() {
      if (!token) return;
      try {
        const h = await api.get(`/hydration/history?range=${historyRange}`, token as string);
        setHistoryData(h || []);
      } catch (e) { console.log('history load err', e); }
    }
    loadHistory();
  }, [token, historyRange]);

  useEffect(() => {
    async function loadCalendarData() {
      if (!token) return;
      try {
        // Load daily data for the current month
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0);
        
        // Get all entries for the month
        const entries = await api.get(`/hydration/history?range=daily&start=${getLocalDateKey(startDate)}&end=${getLocalDateKey(endDate)}`, token as string);
        setCalendarData(entries || []);
      } catch (e) { 
        console.log('calendar data load err', e);
        // Fallback to current history data
        setCalendarData(historyData);
      }
    }
    loadCalendarData();
  }, [token, currentMonth, historyData]);

  // compute percent once and animate when it changes
  const currentPercent = percent();
  useEffect(() => {
    const to = Math.min(100, currentPercent);
    Animated.timing(anim, { toValue: to, duration: 800, useNativeDriver: false, easing: Easing.out(Easing.ease) }).start();
  }, [currentPercent, anim]);

  async function persistLocal(data?: any) {
    const payload = data ?? { goal, entries };
    if (!canUseHydrationCacheRef.current) return;
    try { await writeHydrationCache(payload); } catch { }
  }

  async function addAmount(
    amountMl: number,
    source = 'quick',
    metadata?: {
      beverage_type?: BeverageType;
      sugar_level?: BeverageLevel;
      caffeine_level?: BeverageLevel;
      notes?: string | null;
      drink_label?: string | null;
    },
  ) {
    const selectedBeverage = metadata?.beverage_type || 'water';
    const localId = createLocalId();
    const entry = {
      local_id: localId,
      amount_ml: amountMl,
      timestamp: new Date().toISOString(),
      source,
      beverage_type: selectedBeverage,
      sugar_level: selectedBeverage === 'water' ? 'none' : metadata?.sugar_level || 'none',
      caffeine_level: selectedBeverage === 'water' ? 'none' : metadata?.caffeine_level || 'none',
      notes: metadata?.notes?.trim() || null,
      drink_label: metadata?.drink_label?.trim() || undefined,
      sync_status: 'pending',
    };
    const newEntries = [...entries, entry];
    const oldTotal = totalToday();
    const newTotal = oldTotal + amountMl;
    
    setEntries(newEntries);
    await persistLocal({ goal, entries: newEntries });
    
    // Trigger pulse animation
    pulseButton();
    
    // FIX: Check if goal reached (only show modal once per session)
    // Uses ref to prevent repeated modals when user adds more water after crossing 100% threshold
    const justReachedGoal = newTotal >= goal && oldTotal < goal;
    if (justReachedGoal) {
      await showGoalReachedOnce();
    }
    if (newTotal >= goal) {
      await cancelHydrationNotifications();
    } else {
      await syncHydrationReminderLifecycle(newTotal, goal);
    }
    
    // Check for overhydration (>150% of goal) - only show modal once per session
    // Uses ref to prevent repeated warnings when user continues drinking after 150% threshold
    const currentPercentage = (newTotal / goal) * 100;
    const justExceeded150 = currentPercentage > 150 && (oldTotal / goal) * 100 <= 150;
    if (justExceeded150 && !overhydrationShownRef.current) {
      showInlineNotice('High intake logged. Stay mindful.');
      overhydrationShownRef.current = true; // Mark as shown this session
      setOverhydrationShownToday(true); // Also mark for backend tracking
    }
    
    // Check if behind on hydration pace (only if not yet reached goal)
    if (newTotal < goal) {
      const paceCheck = calculateHydrationPace(newTotal, goal, 'morning');
      if (!paceCheck.isOnPace && newTotal > 0 && newTotal < goal * 0.5) {
        const behindMessage = `Stay hydrated! Drink ${paceCheck.remaining}ml more today to reach your goal.`;
        showInlineNotice(behindMessage);
        
      }
    }
    
    const queuePayload: BeverageLogPayload = {
      local_id: localId,
      amount_ml: amountMl,
      source,
      beverage_type: entry.beverage_type,
      sugar_level: entry.sugar_level,
      caffeine_level: entry.caffeine_level,
      notes: entry.notes,
      drink_label: entry.drink_label ?? null,
      timestamp: entry.timestamp,
    };
    await enqueueBeverageLog(queuePayload);

    if (token) {
      try {
        setSyncing(true);
        const response = await api.post('/hydration', {
          local_id: localId,
          client_uuid: localId,
          amount_ml: amountMl,
          source,
          beverage_type: entry.beverage_type,
          sugar_level: entry.sugar_level,
          caffeine_level: entry.caffeine_level,
          notes: entry.notes,
          drink_label: entry.drink_label ?? null,
          timestamp: entry.timestamp,
        }, token as string);
        await markBeverageLogSynced(localId);
        const syncedEntries = newEntries.map((item) => item.local_id === localId ? {
          ...item,
          id: response?.id ?? response?.entry?.id ?? item.id,
          sync_status: 'synced',
        } : item);
        setEntries(syncedEntries);
        await persistLocal({ goal, entries: syncedEntries });
        await syncPendingBeverages(false);
        setOfflineMode(false);
      } catch (err:any) {
        console.log('Hydration sync error', err);
        setOfflineMode(api.isNetworkError(err));
        showInlineNotice(api.isNetworkError(err) ? 'Offline mode - changes will sync when connected.' : 'Saved locally. Sync pending.');
      } finally {
        setSyncing(false);
      }
    } else {
      setOfflineMode(true);
      showInlineNotice('Offline mode - changes will sync when connected.');
    }
    if (source !== 'quick') {
      closeNotice();
      showInlineNotice('Beverage logged');
    }
  }



  async function submitCustom() {
    const val = parseInt(amountInput || '0', 10);
    if (!val || val <= 0) {
      showNotice('warning', 'Invalid Amount', 'Enter a positive amount in ml');
      return;
    }
    const selectedDrinkOption = DRINK_OPTIONS.find((option) => option.value === selectedDrink) || DRINK_OPTIONS[0];
    const note = beverageNotes.trim();
    const drinkLabel = selectedDrink === 'other' ? customBeverageName.trim() : selectedDrinkOption.label;
    setAmountInput('');
    setBeverageNotes('');
    if (selectedDrink === 'other') {
      setCustomBeverageName('');
    }
    addAmount(val, 'custom', {
      beverage_type: beverageType,
      sugar_level: beverageType === 'water' ? 'none' : sugarLevel,
      caffeine_level: beverageType === 'water' ? 'none' : caffeineLevel,
      notes: note || null,
      drink_label: drinkLabel || null,
    });
  }

  function changeGoal() {
    setCustomGoalInput('');
    setShowGoalEditorModal(true);
  }

  async function applyGoalAndClose(newGoal: number) {
    await updateGoal(newGoal);
    setShowGoalEditorModal(false);
    setCustomGoalInput('');
  }

  async function applyCustomGoal() {
    const val = parseInt(customGoalInput || '0', 10);
    if (!customGoalInput.trim() || !Number.isFinite(val)) {
      showNotice('warning', 'Invalid Input', 'Please enter a hydration goal in milliliters.');
      return;
    }
    if (val < 1000 || val > 5000) {
      showNotice('warning', 'Invalid Range', 'Goal must be between 1000 and 5000 ml.');
      return;
    }
    await applyGoalAndClose(val);
  }

  async function updateGoal(newGoal: number) {
    setGoal(newGoal);
    if (canUseHydrationCacheRef.current) {
      await updateCachedHydrationGoal(newGoal, token as string | undefined);
    }
    await persistLocal({ goal: newGoal, entries });
    const currentTotal = totalForLocalDay(entries);
    setGoalReachedToday(currentTotal >= newGoal);
    await syncHydrationReminderLifecycle(currentTotal, newGoal);
    
    if (token) {
      try { 
        await api.post('/hydration/goal', { goal_ml: newGoal }, token as string);
        setOfflineMode(false);
        setGoalUpdateResult({ goal: newGoal, synced: true });
      } catch (e) { 
        console.log('Goal update error:', e);
        if (api.isNetworkError(e)) {
          setOfflineMode(true);
          showInlineNotice('Goal saved locally. Server sync can retry when connected.');
          setGoalUpdateResult({ goal: newGoal, synced: false });
          return;
        }
        setGoalUpdateResult({ goal: newGoal, synced: false });
        showInlineNotice('Goal saved locally, but server sync failed.');
      }
    } else {
      showInlineNotice('Goal saved locally.');
      setGoalUpdateResult({ goal: newGoal, synced: false });
    }
  }

  /**
   * Permanently delete a hydration entry.
   * Updates local state, AsyncStorage, and syncs with backend.
   */
  async function performDeleteEntry(targetEntry: any) {
    setNoticeModal((prev) => prev ? { ...prev, loading: true } : prev);
    const targetKey = entryKey(targetEntry);
    const index = entries.findIndex((entry) => entryKey(entry) === targetKey);
    let syncWarning: string | null = null;

    if (index === -1) {
      console.log('Entry not found:', targetKey);
      showNotice('error', 'Entry Not Found', 'This beverage entry could not be found.');
      return;
    }

    const newEntries = [...entries];
    const deletedEntry = newEntries[index];

    setDeletedEntryKeys(prev => new Set(prev).add(entryKey(deletedEntry)));

    // Remove from array
    newEntries.splice(index, 1);

    // Update local state immediately for instant UI update
    setEntries(newEntries);

    // Persist to AsyncStorage to prevent restoration on refresh
    if (canUseHydrationCacheRef.current) {
      try {
        await writeHydrationCache({
          goal,
          entries: newEntries
        });
        console.log('Entry deleted from AsyncStorage');
      } catch (storageErr) {
        console.error('AsyncStorage delete error:', storageErr);
      }
    }
    const updatedTodayTotal = totalForLocalDay(newEntries);
    setGoalReachedToday(updatedTodayTotal >= goal);
    await syncHydrationReminderLifecycle(updatedTodayTotal, goal);

    // Sync deletion with backend server
    if (token && deletedEntry) {
      try {
        // Use POST method for deletion (backend expects timestamp in body)
        await api.post('/hydration/delete', {
          timestamp: deletedEntry.timestamp
        }, token as string);
        console.log('Entry deleted from server');

        // Reload full hydration data from server to ensure consistency
        const refreshedData = await api.get('/hydration', token as string);
        if (refreshedData && refreshedData.entries) {
          // Filter out deleted entries
          const filteredEntries = refreshedData.entries.filter((e: any) =>
            !deletedEntryKeys.has(entryKey(e)) && entryKey(e) !== targetKey
          );
          setEntries(filteredEntries);
          // Update AsyncStorage with server data
          if (canUseHydrationCacheRef.current) {
            await writeHydrationCache({
              goal,
              entries: filteredEntries
            });
          }
        }
      } catch (err: any) {
        console.error('Server delete sync error:', err);
        // Keep local deletion even if server sync fails
        syncWarning = 'Entry deleted locally but server sync failed. It will be removed on next sync.';
      }
    }

    // Reload calendar data to reflect deletion immediately
    if (token) {
      try {
        const h = await api.get(`/hydration/history?range=${historyRange}`, token as string);
        setHistoryData(h || []);
      } catch (e) {
        console.log('History reload error:', e);
      }
    }

    if (syncWarning) {
      showNotice('warning', 'Sync Pending', syncWarning);
    } else {
      closeNotice();
    }
  }

  async function deleteEntryByEntry(targetEntry: any) {
    setNoticeModal({
      type: 'destructive',
      title: 'Delete Entry',
      message: 'Are you sure you want to delete this beverage entry?',
      primaryText: 'Delete',
      secondaryText: 'Cancel',
      onPrimary: () => performDeleteEntry(targetEntry),
    });
  }

  function totalToday() {
    const today = getLocalDateKey(new Date());
    return entries.reduce((sum, e) => sum + (e.timestamp && getLocalDateKey(e.timestamp) === today ? (e.amount_ml||0) : 0), 0);
  }

  function percent() {
    return (totalToday() / (goal || 1)) * 100; // Allow exceeding 100% for over-hydration tracking
  }

  function todayEntries() {
    const today = getLocalDateKey(new Date());
    return entries.filter((entry) => entry.timestamp && getLocalDateKey(entry.timestamp) === today);
  }

  function awarenessFor(field: 'sugar_level' | 'caffeine_level') {
    const score = todayEntries().reduce((sum, entry) => {
      const amount = Number(entry.amount_ml || 0);
      return sum + getLevelScore(entry[field]) * (amount / 250);
    }, 0);
    return awarenessFromScore(score);
  }

  function awarenessFromScore(score: number) {
    return {
      score,
      level: getAwarenessLevel(score),
      percent: Math.min(100, (score / 5) * 100),
    };
  }

  function awarenessForEntries(dayEntries: any[], field: 'sugar_level' | 'caffeine_level') {
    const score = dayEntries.reduce((sum, entry) => {
      const amount = Number(entry.amount_ml || 0);
      return sum + getLevelScore(entry[field]) * (amount / 250);
    }, 0);
    return awarenessFromScore(score);
  }

  function getAwarenessColor(level: BeverageLevel) {
    if (level === 'high') return '#F97316';
    if (level === 'medium') return '#2563EB';
    if (level === 'low') return '#60A5FA';
    return '#94A3B8';
  }

  function getDrinkAccent(value: string) {
    switch (value) {
      case 'coffee':
      case 'tea':
      case 'milk_tea':
        return '#2563EB';
      case 'energy_drink':
        return '#F97316';
      case 'soda':
      case 'juice':
        return '#7C3AED';
      case 'other':
        return '#64748B';
      default:
        return '#1E3A8A';
    }
  }

  function selectDrink(value: string) {
    const drink = DRINK_OPTIONS.find((option) => option.value === value) || DRINK_OPTIONS[0];
    setSelectedDrink(drink.value);
    setBeverageType(drink.beverageType);
    setSugarLevel(drink.defaultSugar);
    setCaffeineLevel(drink.defaultCaffeine);
    setBeverageNotes('');
    if (drink.value !== 'other') {
      setCustomBeverageName('');
    }
  }

  function getNotesPlaceholder() {
    switch (selectedDrink) {
      case 'coffee':
        return 'e.g., Spanish latte, iced coffee';
      case 'tea':
        return 'e.g., green tea, black tea';
      case 'energy_drink':
        return 'e.g., Red Bull, Monster';
      case 'soda':
        return 'e.g., Coke, Sprite';
      case 'juice':
        return 'e.g., mango juice, orange juice';
      case 'milk_tea':
        return 'e.g., wintermelon, brown sugar';
      case 'other':
        return 'e.g., smoothie, protein shake';
      default:
        return 'Optional note';
    }
  }

  // Handle setting recommended goal from initial modal
  async function handleSetRecommendedGoal() {
    if (idealGoal) {
      await updateGoal(idealGoal);
      setShowInitialGoalModal(false);
      setInitialGoalStep('choice');
    }
  }

  // Handle setting custom goal from initial modal
  async function handleSetCustomGoal() {
    const val = parseInt(customGoalInput || '0', 10);
    if (!val || val <= 0) {
      showNotice('warning', 'Invalid Input', 'Please enter a positive amount');
      return;
    }
    if (val < 1000 || val > 5000) {
      showNotice('warning', 'Invalid Range', 'Goal must be between 1000-5000ml');
      return;
    }
    await updateGoal(val);
    setShowInitialGoalModal(false);
    setInitialGoalStep('choice');
    setCustomGoalInput('');
  }

  function getMotivationalMessage() {
    const pct = percent();
    if (pct >= 200) return "🚨 Critical! You've doubled your goal - stop immediately!";
    if (pct >= 150) return "⚠️ Extreme over-hydration! Please slow down!";
    if (pct >= 130) return "⚠️ Slow down! You're well over your goal!";
    if (pct >= 110) return "💧 You're over your goal - stay mindful!";
    if (pct >= 100) return "🎉 Excellent! You've reached your daily goal!";
    if (pct >= 75) return "💪 Almost there! Keep going!";
    if (pct >= 50) return "👍 Great progress! Halfway there!";
    if (pct >= 25) return "💧 Good start! Keep hydrating!";
    return "🚰 Let's start your hydration journey!";
  }

  function getProgressColor() {
    const pct = percent();
    if (pct >= 100) return '#2563EB'; // Primary blue
    if (pct >= 75) return '#3B82F6'; // Blue
    if (pct >= 50) return '#F59E0B'; // Orange
    return '#EF4444'; // Red
  }

  const selectedDateKey = getLocalDateKey(selectedDate);
  const todayKey = getLocalDateKey(new Date());
  const isFutureSelectedDate = selectedDateKey > todayKey;
  const selectedDateEntries = entries
    .filter(entry => entry.timestamp && getLocalDateKey(entry.timestamp) === selectedDateKey)
    .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.stickyHeader, hasScrolled && styles.stickyHeaderScrolled, { paddingTop: Math.max(insets.top, 8) }]}>
        <View>
          <Text style={styles.title}>Beverage</Text>
          <Text style={styles.headerSubtitle}>{fmt(totalToday())} / {fmt(goal)} ml today</Text>
        </View>
        <TouchableOpacity
          onPress={() => setShowGoalEditorModal(true)}
          style={styles.headerIconButton}
          activeOpacity={0.8}
          accessibilityLabel="Change hydration goal"
          accessibilityRole="button"
        >
          <Ionicons name="speedometer-outline" size={20} color="#1E3A8A" />
        </TouchableOpacity>
      </View>

      <InlineNotice visible={Boolean(inlineNotice)} message={inlineNotice || ''} top={Math.max(insets.top, 8) + 54} />
      {(offlineMode || syncing) && !inlineNotice ? (
        <InlineSyncNotice
          visible
          message={offlineMode ? 'Offline mode - changes will sync when connected.' : 'Syncing...'}
          iconName={offlineMode ? 'cloud-offline-outline' : 'sync-outline'}
          top={Math.max(insets.top, 8) + 54}
        />
      ) : null}

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 160, paddingTop: 12 }]}
        onScroll={(event) => {
          const scrolled = event.nativeEvent.contentOffset.y > 8;
          setHasScrolled((previous) => previous === scrolled ? previous : scrolled);
        }}
        scrollEventThrottle={16}
      >

        <View style={styles.progressCardRow}>
          <View style={styles.progressCardLeft}>
            <View style={styles.progressHeaderLine}>
              <Text style={styles.progressHeadline} maxFontSizeMultiplier={FONT_SCALE.stat} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{Math.round(percent())}%</Text>
              <Text style={styles.progressSubText} maxFontSizeMultiplier={FONT_SCALE.stat} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{fmt(totalToday())} / {fmt(goal)} ml</Text>
            </View>
            <View style={styles.progressBarWrapper}>
              <View style={styles.progressBarBg} />
              <Animated.View style={[
                styles.progressBarFill, 
                { 
                  width: anim.interpolate({ inputRange: [0,100], outputRange: ['0%','100%'] }),
                  backgroundColor: getProgressColor()
                }
              ]} />
            </View>
            <Text style={styles.motivationalText}>{getMotivationalMessage()}</Text>
          </View>
          <View style={styles.missedPassiveCard}>
            <View style={styles.missedPassiveIcon}>
              <Ionicons name="time-outline" size={15} color="#C2410C" />
            </View>
            <Text style={styles.missedMiniLabel}>Missed Reminders</Text>
            <Text style={styles.missedMiniNumber} maxFontSizeMultiplier={FONT_SCALE.stat} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{missedCount}</Text>
            <Text style={styles.missedMiniHelper}>Reminders you skipped today</Text>
          </View>
        </View>

        {(() => {
          const caffeineAwareness = awarenessFor('caffeine_level');
          const sugarAwareness = awarenessFor('sugar_level');
          const caffeineColor = getAwarenessColor(caffeineAwareness.level);
          const sugarColor = getAwarenessColor(sugarAwareness.level);

          return (
            <View style={styles.awarenessGrid}>
              <View style={styles.awarenessCard}>
                <View style={styles.awarenessHeader}>
                  <View style={[styles.awarenessIcon, { backgroundColor: caffeineAwareness.level === 'high' ? '#FFF7ED' : '#EFF6FF' }]}>
                    <Ionicons name="cafe" size={18} color={caffeineColor} />
                  </View>
                  <View style={styles.awarenessTitleWrap}>
                    <Text style={styles.awarenessTitle}>Caffeine Intake</Text>
                    <Text style={styles.awarenessSubtitle}>{"Today's level: "}{getLevelLabel(caffeineAwareness.level)}</Text>
                    <Text style={styles.awarenessHelper}>Adjusted by serving size</Text>
                  </View>
                </View>
                <View style={styles.awarenessTrack}>
                  <View style={[styles.awarenessFill, { width: `${caffeineAwareness.percent}%`, backgroundColor: caffeineColor }]} />
                </View>
              </View>

              <View style={styles.awarenessCard}>
                <View style={styles.awarenessHeader}>
                  <View style={[styles.awarenessIcon, { backgroundColor: sugarAwareness.level === 'high' ? '#FFF7ED' : '#EFF6FF' }]}>
                    <Ionicons name="ice-cream" size={18} color={sugarColor} />
                  </View>
                  <View style={styles.awarenessTitleWrap}>
                    <Text style={styles.awarenessTitle}>Sugar Intake</Text>
                    <Text style={styles.awarenessSubtitle}>{"Today's level: "}{getLevelLabel(sugarAwareness.level)}</Text>
                    <Text style={styles.awarenessHelper}>Adjusted by serving size</Text>
                  </View>
                </View>
                <View style={styles.awarenessTrack}>
                  <View style={[styles.awarenessFill, { width: `${sugarAwareness.percent}%`, backgroundColor: sugarColor }]} />
                </View>
              </View>
              <Text style={styles.awarenessFootnote}>{"Level considers today's drinks and serving size."}</Text>
            </View>
          );
        })()}

        <View style={styles.quickWaterCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.quickAddTitle}>Quick Add Water</Text>
            <Text style={styles.sectionHint}>One tap</Text>
          </View>
          <View style={styles.quickChipRow}>
            {QUICK_WATER_AMOUNTS.map((amount) => (
              <TouchableOpacity
                key={amount}
                style={[styles.waterChip, quickWaterFeedback === amount && styles.waterChipPressed]}
                onPress={() => quickAddWater(amount)}
                activeOpacity={0.75}
              >
                <Ionicons name="water" size={15} color={quickWaterFeedback === amount ? '#FFFFFF' : '#1E3A8A'} />
                <Text style={[styles.waterChipText, quickWaterFeedback === amount && styles.waterChipTextPressed]} maxFontSizeMultiplier={FONT_SCALE.button} numberOfLines={1}>{amount} ml</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.cardAlt}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.quickAddTitle}>Beverage Log</Text>
            <Text style={styles.sectionHint}>Custom entry</Text>
          </View>

          <View style={styles.categoryPanel}>
            <View style={styles.drinkGrid}>
              {DRINK_OPTIONS.map((drink) => {
                const selected = selectedDrink === drink.value;
                const accent = getDrinkAccent(drink.value);
                return (
                  <TouchableOpacity
                    key={drink.value}
                    style={[
                      styles.drinkChip,
                      selected ? styles.drinkChipActive : styles.drinkChipInactive,
                      selected && { borderColor: accent },
                    ]}
                    onPress={() => selectDrink(drink.value)}
                    activeOpacity={0.82}
                  >
                    <View style={[styles.drinkIconBubble, { backgroundColor: selected ? accent : '#EFF6FF' }]}>
                      <Ionicons name={drink.icon} size={selected ? 20 : 17} color={selected ? '#FFFFFF' : accent} />
                    </View>
                    <Text style={[styles.drinkChipText, selected && styles.drinkChipTextActive]} numberOfLines={1}>
                      {drink.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {selectedDrink === 'other' && (
              <TextInput
                value={customBeverageName}
                onChangeText={setCustomBeverageName}
                placeholder="Custom beverage name"
                maxLength={80}
                style={styles.fullInputAlt}
                textAlignVertical="center"
                maxFontSizeMultiplier={FONT_SCALE.input}
              />
            )}

            <Text style={styles.formLabel}>Caffeine level</Text>
            <View style={styles.levelRow}>
              {LEVEL_OPTIONS.map((option) => (
                <TouchableOpacity key={option.value} style={[styles.levelChip, caffeineLevel === option.value && styles.optionChipSelected]} onPress={() => setCaffeineLevel(option.value)} activeOpacity={0.85}>
                  <Text style={[styles.optionChipText, caffeineLevel === option.value && styles.optionChipTextSelected]} maxFontSizeMultiplier={FONT_SCALE.chip}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.formLabel}>Sugar level</Text>
            <View style={styles.levelRow}>
              {LEVEL_OPTIONS.map((option) => (
                <TouchableOpacity key={option.value} style={[styles.levelChip, sugarLevel === option.value && styles.optionChipSelected]} onPress={() => setSugarLevel(option.value)} activeOpacity={0.85}>
                  <Text style={[styles.optionChipText, sugarLevel === option.value && styles.optionChipTextSelected]} maxFontSizeMultiplier={FONT_SCALE.chip}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.formLabel}>Amount</Text>
            <View style={styles.amountRow}>
              {QUICK_WATER_AMOUNTS.map((amount) => (
                <TouchableOpacity key={amount} style={[styles.amountChip, amountInput === String(amount) && styles.amountChipActive]} onPress={() => setAmountInput(String(amount))} activeOpacity={0.85}>
                  <Text style={[styles.amountChipText, amountInput === String(amount) && styles.amountChipTextActive]} maxFontSizeMultiplier={FONT_SCALE.chip} numberOfLines={1}>{amount} ml</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              value={amountInput}
              onChangeText={setAmountInput}
              placeholder="Custom ml"
              placeholderTextColor="#64748B"
              keyboardType="numeric"
              style={styles.inputAltFull}
              textAlignVertical="center"
              maxFontSizeMultiplier={FONT_SCALE.input}
            />

            <Text style={styles.formLabel}>Notes (optional)</Text>
            <TextInput
              value={beverageNotes}
              onChangeText={setBeverageNotes}
              placeholder={getNotesPlaceholder()}
              placeholderTextColor="#64748B"
              maxLength={50}
              style={styles.notesInputAlt}
              returnKeyType="done"
              textAlignVertical="center"
              maxFontSizeMultiplier={FONT_SCALE.input}
            />

            <View style={styles.logButtonRow}>
              <TouchableOpacity style={styles.addBtnAlt} onPress={submitCustom} activeOpacity={0.9}><Text style={styles.addBtnText} maxFontSizeMultiplier={FONT_SCALE.button}>Log</Text></TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.calendarCard}>
          <View style={styles.calendarHeader}>
            <TouchableOpacity onPress={() => navigateMonth('prev')} style={styles.navButton}>
              <Ionicons name="chevron-back" size={20} color="#1E3A8A" />
            </TouchableOpacity>
            <View style={styles.calendarTitleWrap}>
              <Text style={styles.calendarTitle}>
                {calendarExpanded
                  ? currentMonth.toLocaleDateString('en', { month: 'long', year: 'numeric' })
                  : `Week of ${generateCalendarDays()[0]?.date.toLocaleDateString('en', { month: 'short', day: 'numeric' })}`}
              </Text>
              <TouchableOpacity onPress={() => setCalendarExpanded(!calendarExpanded)} style={styles.calendarToggle} activeOpacity={0.8}>
                <Ionicons name={calendarExpanded ? 'contract-outline' : 'expand-outline'} size={13} color="#2563EB" />
                <Text style={styles.calendarToggleText}>{calendarExpanded ? 'Week' : 'Month'}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => navigateMonth('next')} style={styles.navButton}>
              <Ionicons name="chevron-forward" size={20} color="#1E3A8A" />
            </TouchableOpacity>
          </View>

          {calendarExpanded && (
            <View style={styles.dayHeaders}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <Text key={day} style={styles.dayHeader}>{day}</Text>
              ))}
            </View>
          )}

          <View style={calendarExpanded ? styles.calendarDays : styles.weekStrip}>
              {generateCalendarDays().map((day, index) => {
                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      calendarExpanded ? styles.calendarDay : styles.weekDay,
                      calendarExpanded && !day.isCurrentMonth && styles.calendarDayOtherMonth,
                      day.isToday && styles.calendarDayToday,
                      day.isSelected && styles.calendarDaySelected
                    ]}
                    onPress={() => setSelectedDate(day.date)}
                  >
                    {!calendarExpanded && (
                      <Text style={[styles.weekDayName, day.isSelected && styles.calendarDayTextSelected]}>
                        {day.date.toLocaleDateString('en', { weekday: 'short' })}
                      </Text>
                    )}
                    <Text style={[
                      styles.calendarDayText,
                      calendarExpanded && !day.isCurrentMonth && styles.calendarDayTextOtherMonth,
                      day.isToday && styles.calendarDayTextToday,
                      day.isSelected && styles.calendarDayTextSelected
                    ]}>
                      {day.date.getDate()}
                    </Text>
                    
                    {day.amount > 0 && (
                      <View style={styles.blueDotIndicator} />
                    )}
                  </TouchableOpacity>
                );
              })}
          </View>

          {/* Selected day details */}
          {selectedDate && (
            <View style={styles.selectedDayDetails}>
              <Text style={styles.selectedDayTitle}>
                {selectedDate.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })}
              </Text>
              {(() => {
                const amount = selectedDateEntries.reduce((sum, entry) => sum + (entry.amount_ml || 0), 0);
                const selectedCaffeine = awarenessForEntries(selectedDateEntries, 'caffeine_level');
                const selectedSugar = awarenessForEntries(selectedDateEntries, 'sugar_level');
                
                return (
                  <>
                    <View style={styles.daySummaryGrid}>
                      <View style={styles.daySummaryItem}>
                        <Ionicons name="water" size={18} color="#2563EB" />
                        <Text style={styles.statValue}>{amount}ml</Text>
                        <Text style={styles.statLabel}>Water</Text>
                      </View>
                      <View style={styles.daySummaryItem}>
                        <Ionicons name="cafe" size={18} color="#2563EB" />
                        <Text style={styles.statValue}>{getLevelLabel(selectedCaffeine.level)}</Text>
                        <Text style={styles.statLabel}>Caffeine</Text>
                      </View>
                      <View style={styles.daySummaryItem}>
                        <Ionicons name="ice-cream" size={18} color="#2563EB" />
                        <Text style={styles.statValue}>{getLevelLabel(selectedSugar.level)}</Text>
                        <Text style={styles.statLabel}>Sugar</Text>
                      </View>
                    </View>
                    
                    <View style={styles.dateLogsContainer}>
                      <View style={styles.dateLogsHeader}>
                        <View>
                          <Text style={styles.dateLogsTitle}>Logs for Selected Date</Text>
                          <Text style={styles.dateLogsSubtitle}>Entries recorded for the selected day.</Text>
                        </View>
                      </View>
                      {selectedDateEntries.length > 0 ? (
                        selectedDateEntries.map((entry, idx) => {
                          const pending = entry.sync_status === 'pending' || entry.sync_status === 'failed';
                          return (
                            <View key={entryKey(entry)} style={[styles.selectedLogRow, idx % 2 === 0 ? styles.rowAltEven : styles.rowAltOdd]}>
                              <View style={styles.selectedLogInfo}>
                                <Text style={styles.selectedLogTitle} numberOfLines={2}>{formatLogTitle(entry)}</Text>
                                <Text style={styles.selectedLogMeta}>
                                  {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  {pending ? ` - ${entry.sync_status === 'failed' ? 'Sync failed' : 'Pending sync'}` : ''}
                                </Text>
                              </View>
                              <View style={styles.selectedLogRight}>
                                <Text style={styles.selectedLogAmount}>{fmt(entry.amount_ml || 0)} ml</Text>
                                <TouchableOpacity
                                  onPress={() => deleteEntryByEntry(entry)}
                                  style={styles.deleteButton}
                                  accessibilityLabel="Delete beverage entry"
                                  accessibilityRole="button"
                                >
                                  <Ionicons name="trash-outline" size={17} color="#EF4444" />
                                </TouchableOpacity>
                              </View>
                            </View>
                          );
                        })
                      ) : (
                        <Text style={styles.noLogsText}>
                          {isFutureSelectedDate ? 'No beverage logs for this future date.' : 'No beverage logs for this date.'}
                        </Text>
                      )}
                    </View>
                  </>
                );
              })()}
            </View>
          )}
        </View>

      </ScrollView>

      <BottomNavigation currentRoute="hydration" />

      <Modal
        visible={showGoalEditorModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowGoalEditorModal(false);
          setCustomGoalInput('');
        }}
      >
        <View style={styles.goalSheetOverlay}>
          <TouchableOpacity
            style={styles.goalSheetBackdrop}
            activeOpacity={1}
            onPress={() => {
              setShowGoalEditorModal(false);
              setCustomGoalInput('');
            }}
          />
          <View style={[styles.goalSheet, { paddingBottom: Math.max(insets.bottom + 18, 28) }]}>
            <View style={styles.goalSheetHandle} />
            <View style={styles.goalSheetHeader}>
              <View style={styles.goalSheetTitleWrap}>
                <Text style={styles.goalSheetTitle}>Hydration Goal</Text>
                <Text style={styles.goalSheetSubtitle}>Adjust your daily beverage intake target.</Text>
              </View>
              <View style={styles.goalCurrentPill}>
                <Text style={styles.goalCurrentLabel}>Current</Text>
                <Text style={styles.goalCurrentValue}>{fmt(goal)} ml</Text>
              </View>
            </View>

            {idealGoal ? (
              <TouchableOpacity
                style={styles.goalRecommendedCard}
                activeOpacity={0.84}
                onPress={() => applyGoalAndClose(idealGoal)}
              >
                <View style={styles.goalRecommendedIcon}>
                  <Ionicons name="sparkles-outline" size={18} color="#2563EB" />
                </View>
                <View style={styles.goalRecommendedTextWrap}>
                  <Text style={styles.goalRecommendedLabel}>{fmt(idealGoal)} ml recommended</Text>
                  <Text style={styles.goalRecommendedText}>Based on your profile details</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#2563EB" />
              </TouchableOpacity>
            ) : null}

            <Text style={styles.goalSheetSectionTitle}>Quick goals</Text>
            <View style={styles.goalPresetGrid}>
              {[1500, 2000, 2500, 3000].map((preset) => {
                const selected = goal === preset;
                return (
                  <TouchableOpacity
                    key={preset}
                    style={[styles.goalPresetChip, selected && styles.goalPresetChipActive]}
                    activeOpacity={0.84}
                    onPress={() => applyGoalAndClose(preset)}
                  >
                    <Text style={[styles.goalPresetText, selected && styles.goalPresetTextActive]}>
                      {fmt(preset)} ml
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.goalSheetSectionTitle}>Custom goal</Text>
            <View style={styles.goalCustomRow}>
              <TextInput
                value={customGoalInput}
                onChangeText={setCustomGoalInput}
                keyboardType="numeric"
                placeholder="1000 - 5000 ml"
                placeholderTextColor="#94A3B8"
                style={styles.goalCustomInput}
              />
              <TouchableOpacity style={styles.goalApplyButton} activeOpacity={0.84} onPress={applyCustomGoal}>
                <Text style={styles.goalApplyButtonText}>Apply</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.goalSheetHint}>Enter a number between 1000 and 5000 ml.</Text>

            <TouchableOpacity
              style={styles.goalCancelButton}
              activeOpacity={0.84}
              onPress={() => {
                setShowGoalEditorModal(false);
                setCustomGoalInput('');
              }}
            >
              <Text style={styles.goalCancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={goalUpdateResult !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setGoalUpdateResult(null)}
      >
        <View style={styles.goalSuccessOverlay}>
          <View style={styles.goalSuccessCard}>
            <View style={styles.goalSuccessGlow} />
            <View style={styles.goalSuccessIconRing}>
              <View style={styles.goalSuccessIconInner}>
                <Ionicons name="speedometer-outline" size={30} color="#FFFFFF" />
              </View>
            </View>
            <Text style={styles.goalSuccessEyebrow}>
              {goalUpdateResult?.synced ? 'Goal synced' : 'Saved on this device'}
            </Text>
            <Text style={styles.goalSuccessTitle}>Hydration Goal Updated</Text>
            <Text style={styles.goalSuccessSubtitle}>
              Your daily beverage target is now set to {fmt(goalUpdateResult?.goal || goal)} ml.
            </Text>
            <View style={styles.goalSuccessMetricCard}>
              <Text style={styles.goalSuccessMetricLabel}>New target</Text>
              <Text style={styles.goalSuccessMetricValue}>{fmt(goalUpdateResult?.goal || goal)} ml</Text>
              <View style={styles.goalSuccessTrack}>
                <View style={styles.goalSuccessFill} />
              </View>
              <Text style={styles.goalSuccessHelper}>
                {goalUpdateResult?.synced
                  ? 'Your target is saved locally and synced with IntakeSync.'
                  : 'Your target is saved locally. Sync can retry when connected.'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.goalSuccessButton}
              activeOpacity={0.84}
              onPress={() => setGoalUpdateResult(null)}
            >
              <Text style={styles.goalSuccessButtonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Ideal Goal Alert Modal */}
      <Modal
        visible={showIdealGoalAlert && idealGoal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setShowIdealGoalAlert(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Recommended Hydration Goal</Text>
            <Text style={styles.modalMessage}>
              Based on your weight, climate, and activity level, your estimated daily water goal is:
            </Text>
            <Text style={styles.modalGoalValue}>{idealGoal} ml</Text>
            <Text style={styles.modalSubtext}>
              This is a general estimate. You can adjust it anytime.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={styles.modalButtonSecondary}
                onPress={() => {
                  setShowIdealGoalAlert(false);
                }}
              >
                <Text style={styles.modalButtonSecondaryText}>Keep Current ({goal} ml)</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.modalButtonPrimary}
                onPress={async () => {
                  setShowIdealGoalAlert(false);
                  await updateGoal(idealGoal!);
                }}
              >
                <Text style={styles.modalButtonPrimaryText}>Use Recommended</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Initial Hydration Goal Modal - Appears on First Load */}
      <Modal
        visible={showInitialGoalModal}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {initialGoalStep === 'choice' ? (
              <>
                <View style={styles.initialModalIcon}>
                  <Ionicons name="water" size={48} color="#3B82F6" />
                </View>
                <Text style={styles.modalTitle}>Set Your Hydration Goal</Text>
                <Text style={styles.modalMessage}>
                  Let us get started by setting your daily water intake goal.
                </Text>
                
                {idealGoal && (
                  <View style={styles.recommendedGoalBox}>
                    <Text style={styles.recommendedLabel}>📊 Recommended for You:</Text>
                    <Text style={styles.recommendedValue}>{idealGoal} ml</Text>
                    <Text style={styles.recommendedExplain}>
                      Estimated from your profile details
                    </Text>
                  </View>
                )}
                
                <View style={styles.modalButtons}>
                  {idealGoal ? (
                    <>
                      <TouchableOpacity 
                        style={styles.modalButtonPrimary}
                        onPress={handleSetRecommendedGoal}
                      >
                        <Text style={styles.modalButtonPrimaryText}>✓ Use Recommended</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={styles.modalButtonSecondary}
                        onPress={() => setInitialGoalStep('custom')}
                      >
                        <Text style={styles.modalButtonSecondaryText}>Custom Amount</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity 
                      style={styles.modalButtonPrimary}
                      onPress={() => setInitialGoalStep('custom')}
                    >
                      <Text style={styles.modalButtonPrimaryText}>Set Custom Goal</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            ) : (
              <>
                <View style={styles.initialModalIcon}>
                  <Ionicons name="create" size={48} color="#F59E0B" />
                </View>
                <Text style={styles.modalTitle}>Custom Hydration Goal</Text>
                <Text style={styles.modalMessage}>
                  Enter your daily water intake goal in milliliters (1000-5000ml)
                </Text>
                
                <TextInput
                  placeholder="Enter amount in ml"
                  keyboardType="numeric"
                  value={customGoalInput}
                  onChangeText={setCustomGoalInput}
                  style={styles.customGoalInput}
                  placeholderTextColor="#9CA3AF"
                />
                
                <Text style={styles.inputHint}>
                  💡 Recommended: 2000-3000ml for most adults
                </Text>
                
                <View style={styles.modalButtons}>
                  <TouchableOpacity 
                    style={styles.modalButtonSecondary}
                    onPress={() => {
                      setInitialGoalStep('choice');
                      setCustomGoalInput('');
                    }}
                  >
                    <Text style={styles.modalButtonSecondaryText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.modalButtonPrimary}
                    onPress={handleSetCustomGoal}
                  >
                    <Text style={styles.modalButtonPrimaryText}>Set Goal</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
      <ThemedNoticeModal
        visible={Boolean(noticeModal)}
        type={noticeModal?.type || 'info'}
        title={noticeModal?.title || ''}
        message={noticeModal?.message || ''}
        primaryText={noticeModal?.primaryText}
        secondaryText={noticeModal?.secondaryText}
        loading={noticeModal?.loading}
        onPrimary={noticeModal?.onPrimary || closeNotice}
        onSecondary={closeNotice}
        onClose={closeNotice}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor:'#F8FAFC' },
  content: { padding:20 },
  header: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:16 },
  headerRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:8 },
  title: { fontSize:22, fontWeight:'800', color:'#0F172A' },
  editGoal: { color:'#2563EB', fontWeight:'600' },
  card: { backgroundColor:'white', borderRadius:12, padding:16, marginBottom:16, shadowColor:'#000', shadowOpacity:0.05, elevation:2 },
  cardTitle: { fontSize:16, fontWeight:'700', color:'#0F172A', marginBottom:8 },
  total: { fontSize:20, fontWeight:'700', color:'#0F172A', marginBottom:8 },
  progressContainer: { marginBottom:12 },
  progressWrap: { height:12, backgroundColor:'#E6EEF8', borderRadius:8, overflow:'hidden', position:'relative' },
  progressBar: { height:12, backgroundColor:'#2563EB' },
  progressLabel: { position:'absolute', right:8, top:-18, color:'#0F172A', fontWeight:'600' },
  quickRow: { flexDirection:'row', justifyContent:'space-between', marginTop:12 },
  quickBtn: { padding:12, borderRadius:8, backgroundColor:'#E6EEF8', flex:1, marginRight:8, alignItems:'center' },
  quickBtnPrimary: { padding:12, borderRadius:8, backgroundColor:'#2563EB', flex:1, marginLeft:8, alignItems:'center' },
  quickText: { color:'#0F172A', fontWeight:'700' },
  quickTextPrimary: { color:'white', fontWeight:'700' },
  customRow: { flexDirection:'row', marginTop:12 },
  input: { flex:1, backgroundColor:'#F3F4F6', borderRadius:8, paddingHorizontal:12, marginRight:8 },
  addBtn: { backgroundColor:'#2563EB', paddingHorizontal:16, justifyContent:'center', borderRadius:8 },
  historyCard: { backgroundColor:'white', borderRadius:12, padding:12, marginBottom:16 },
  emptyRecent: { paddingVertical:20 },
  emptyText: { color:'#6B7280' },
  historyItem: { flexDirection:'row', justifyContent:'space-between', paddingVertical:8, borderBottomColor:'#F1F5F9', borderBottomWidth:1 },
  
  actionsRow: { flexDirection:'row', justifyContent:'space-between' },
  missedBtn: { padding:12, borderRadius:8, backgroundColor:'#FEF3C7' },

  /* polished UI styles */
  stickyHeader: { backgroundColor: '#F8FAFC', paddingHorizontal: 20, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: 'transparent', zIndex: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stickyHeaderScrolled: { backgroundColor: '#FFFFFF', borderBottomColor: '#E2E8F0', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 4 },
  headerSubtitle: { marginTop: 2, color: '#64748B', fontSize: 12, fontWeight: '700' },
  headerIconButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', alignItems: 'center', justifyContent: 'center' },
  inlineNotice: { position: 'absolute', left: 20, right: 20, zIndex: 60, backgroundColor: '#2563EB', borderRadius: 999, paddingVertical: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, elevation: 8 },
  inlineNoticeText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  headerRowAlt: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:12 },
  goalWrap: { flexDirection: 'row', alignItems: 'center' },
  goalLabel: { color: '#6B7280', marginRight: 8, fontWeight: '600' },
  goalPill: { backgroundColor: 'white', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#E6EEF8' },
  goalText: { fontWeight: '700', color: '#0F172A' },

  progressCard: { flexDirection: 'row', backgroundColor: 'white', borderRadius: 14, padding: 20, marginBottom: 16, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, elevation: 6 },
  progressLeft: { flex: 1, alignItems: 'center' },
  progressRight: { width: 120, alignItems: 'flex-end' },
  progressCircleWrap: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'visible' },
  circleTrack: { position: 'absolute', width: 112, height: 112, borderRadius: 56, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E6EEF8', top: 4 },
  circleProgress: { position: 'absolute', height: 112, borderRadius: 56, backgroundColor: '#60A5FA', opacity: 0.12, top: 4, left: 4 },
  circleCenterAlt: { width: 92, height: 92, borderRadius: 46, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', elevation: 2 },
  percentText: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  progressSub: { fontSize: 12, color: '#6B7280', marginTop: 4 },

  /* top cap and droplet */
  topCap: { position: 'absolute', width: 18, height: 10, borderRadius: 6, backgroundColor: '#60A5FA', top: -10, left: 51, zIndex: 10 },
  percentTextLarge: { fontSize: 34, fontWeight: '900', color: '#0F172A' },
  progressSubLarge: { fontSize: 12, color: '#374151', marginTop: 6 },
  dropWrap: { position: 'absolute', bottom: -20, left: 53, alignItems: 'center' },
  drop: { width: 14, height: 20, backgroundColor: '#60A5FA', borderBottomLeftRadius: 10, borderBottomRightRadius: 10, borderTopLeftRadius: 6, borderTopRightRadius: 6 },

  missedCard: { backgroundColor: '#FEF3C7', padding: 10, borderRadius: 10, alignItems: 'center' },
  missedLabel: { fontSize: 12, color: '#92400E' },
  missedNumber: { fontSize: 18, fontWeight: '800', color: '#92400E', marginTop: 6 },

  /* alternative missed card style to match pale yellow design */
  missedCardAlt: { backgroundColor: '#FEF7E7', padding: 20, borderRadius: 14, width: 150, alignItems: 'center', justifyContent: 'center', shadowColor:'#000', shadowOpacity:0.02, shadowRadius:6, elevation:2 },
  missedIconPlaceholder: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#FDE68A', marginBottom: 10 },
  missedLabelAlt: { fontSize: 12, color: '#92400E', marginBottom: 8, fontWeight: '700' },
  missedNumberAlt: { fontSize: 36, fontWeight: '900', color: '#92400E', marginBottom: 6 },

  cardAlt: { backgroundColor:'#FFFFFF', borderRadius:16, padding:14, marginBottom:16, shadowColor:'#000', shadowOpacity:0.05, shadowRadius:8, elevation:2 },
  quickAddTitle: { fontSize:16, fontWeight:'800', color:'#0F172A', marginBottom:10 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionHint: { fontSize: 12, color: '#64748B', fontWeight: '700', marginBottom: 10 },
  awarenessGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  awarenessCard: { flex: 1, minWidth: '47%', backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  awarenessHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  awarenessIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  awarenessTitleWrap: { flex: 1, minWidth: 0 },
  awarenessTitle: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  awarenessSubtitle: { fontSize: 11, color: '#64748B', marginTop: 2, fontWeight: '600' },
  awarenessHelper: { fontSize: 10, color: '#94A3B8', marginTop: 1, fontWeight: '700' },
  awarenessTrack: { height: 8, borderRadius: 8, backgroundColor: '#E2E8F0', overflow: 'hidden' },
  awarenessFill: { height: 8, borderRadius: 8 },
  awarenessFootnote: { width: '100%', color: '#64748B', fontSize: 11, fontWeight: '600', marginTop: -2 },
  quickWaterCard: { backgroundColor:'#FFFFFF', borderRadius:16, padding:12, marginBottom:16, shadowColor:'#000', shadowOpacity:0.04, shadowRadius:8, elevation:2 },
  quickRowAlt: { flexDirection:'row', justifyContent:'space-between', marginBottom:8 },
  quickCard: { flex: 1, marginRight: 8, paddingVertical: 14, borderRadius: 12, alignItems:'center' },
  quickCardValue: { color: 'white', fontWeight: '800', fontSize: 18, marginTop: 6 },
  quickCardUnit: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
  formSectionTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginTop: 18, marginBottom: 10 },
  formLabel: { fontSize: 11, fontWeight: '800', color: '#475569', marginTop: 12, marginBottom: 7, textTransform: 'uppercase' },
  segmentRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  segmentButton: { flex: 1, minHeight: 58, borderRadius: 12, borderWidth: 1, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segmentButtonActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  segmentButtonText: { marginTop: 4, color: '#1E3A8A', fontSize: 11, fontWeight: '800', textAlign: 'center' },
  segmentButtonTextActive: { color: '#FFFFFF' },
  categoryPanel: { backgroundColor: '#F8FAFC', borderRadius: 14, padding: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  drinkGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, overflow: 'visible' },
  drinkChip: { width: '23%', minHeight: 62, flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 7, paddingHorizontal: 4, borderRadius: 14, borderWidth: 1, borderColor: '#BFDBFE', backgroundColor: '#FFFFFF', overflow: 'visible' },
  drinkChipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB', transform: [{ scale: 1.04 }] },
  drinkChipInactive: { opacity: 0.86, transform: [{ scale: 0.98 }] },
  drinkIconBubble: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  drinkChipText: { color: '#1E3A8A', fontWeight: '900', fontSize: 10, textAlign: 'center' },
  drinkChipTextActive: { color: '#FFFFFF' },
  amountRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  amountChip: { flexGrow: 1, minWidth: '22%', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, borderColor: '#BAE6FD', backgroundColor: '#F0F9FF' },
  amountChipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  amountChipText: { color: '#1E3A8A', fontWeight: '900', fontSize: 12 },
  amountChipTextActive: { color: '#FFFFFF' },
  quickChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  waterChip: { flex: 1, minWidth: 86, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 12, paddingVertical: 9, paddingHorizontal: 6 },
  waterChipPressed: { backgroundColor: '#2563EB', borderColor: '#2563EB', transform: [{ scale: 0.96 }] },
  waterChipText: { color: '#1E3A8A', fontWeight: '900', marginLeft: 4, fontSize: 12 },
  waterChipTextPressed: { color: '#FFFFFF' },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  presetChip: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF' },
  presetChipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  presetChipText: { color: '#334155', fontWeight: '800', fontSize: 13 },
  presetChipTextActive: { color: '#FFFFFF' },
  optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: '#D1D5DB', backgroundColor: '#FFFFFF', marginBottom: 8 },
  optionChipSelected: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  optionChipDisabled: { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB', opacity: 0.65 },
  optionChipText: { color: '#334155', fontSize: 13, fontWeight: '700' },
  optionChipTextSelected: { color: '#FFFFFF' },
  optionChipTextDisabled: { color: '#94A3B8' },
  levelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 2 },
  levelChip: { minWidth: 70, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: '#D1D5DB', backgroundColor: '#FFFFFF', marginBottom: 8 },
  customRowAlt: { flexDirection: 'row', marginTop: 12 },
  inputAlt: { flex:1, backgroundColor:'#F3F4F6', borderRadius:8, paddingHorizontal:12, marginRight:8, color:'#0F172A' },
  inputAltFull: { backgroundColor:'#F3F4F6', borderRadius:8, paddingHorizontal:12, paddingVertical: 11, minHeight: 46, color:'#0F172A', marginTop: 4, marginBottom: 10 },
  fullInputAlt: { backgroundColor:'#FFFFFF', borderRadius:10, borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal:12, paddingVertical: 11, minHeight: 46, color:'#0F172A', marginTop: 10 },
  addBtnAlt: { backgroundColor:'#2563EB', paddingHorizontal:18, justifyContent:'center', borderRadius:10, minHeight: 42, alignItems: 'center' },
  addBtnText: { color:'white', fontWeight:'800' },
  logButtonRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
  notesInputAlt: { backgroundColor:'#F3F4F6', borderRadius:8, paddingHorizontal:12, paddingVertical: 10, minHeight: 44, marginTop: 4, color:'#0F172A' },

  // Calendar styles
  calendarCard: { backgroundColor:'#FFFFFF', borderRadius:16, padding:14, marginBottom:16, shadowColor:'#000', shadowOpacity:0.05, shadowRadius:8, elevation:2 },
  calendarHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:12, gap: 10 },
  navButton: { width:32, height:32, borderRadius:16, backgroundColor:'#EFF6FF', justifyContent:'center', alignItems:'center' },
  calendarTitleWrap: { flex: 1, alignItems: 'center' },
  calendarTitle: { fontSize:15, fontWeight:'900', color:'#1E3A8A' },
  calendarToggle: { marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EFF6FF', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  calendarToggleText: { fontSize: 11, color: '#2563EB', fontWeight: '800' },
  calendarGrid: { marginBottom:16 },
  weekStrip: { flexDirection:'row', gap: 6, marginBottom: 12 },
  dayHeaders: { flexDirection:'row', marginBottom:8 },
  dayHeader: { flex:1, textAlign:'center', fontSize:12, fontWeight:'600', color:'#6B7280', paddingVertical:8 },
  calendarDays: { flexDirection:'row', flexWrap:'wrap' },
  calendarDay: { width:'14.28%', aspectRatio:1, justifyContent:'center', alignItems:'center', borderRadius:8, marginBottom:4, position:'relative', paddingTop: 4, borderWidth: 1, borderColor: 'transparent' },
  weekDay: { flex: 1, minHeight: 64, justifyContent:'center', alignItems:'center', borderRadius:12, position:'relative', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E5E7EB' },
  weekDayName: { fontSize: 10, color: '#64748B', fontWeight: '800', marginBottom: 4, textTransform: 'uppercase' },
  calendarDayOtherMonth: { opacity:0.3 },
  calendarDayToday: { backgroundColor:'#EBF8FF', borderWidth:2, borderColor:'#3B82F6' },
  calendarDaySelected: { backgroundColor:'#2563EB', borderColor: '#2563EB' },
  calendarDayText: { fontSize:14, fontWeight:'500', color:'#374151', marginBottom: 2 },
  calendarDayTextOtherMonth: { color:'#9CA3AF' },
  calendarDayTextToday: { color:'#1D4ED8', fontWeight:'700' },
  calendarDayTextSelected: { color:'white', fontWeight:'700' },
  blueDotIndicator: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#3B82F6', position: 'absolute', bottom: 4, alignSelf: 'center' },
  selectedDayDetails: { backgroundColor:'#F8FAFC', borderRadius:12, padding:12, marginTop:8 },
  selectedDayTitle: { fontSize:15, fontWeight:'800', color:'#1F2937', marginBottom:10 },
  dayStats: { flexDirection:'row', justifyContent:'space-around', marginBottom: 16 },
  daySummaryGrid: { flexDirection:'row', gap: 8, marginBottom: 12 },
  daySummaryItem: { flex: 1, alignItems:'center', backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#DBEAFE', paddingVertical: 10, paddingHorizontal: 6 },
  statItem: { alignItems:'center' },
  statValue: { fontSize:16, fontWeight:'900', color:'#1F2937', marginTop: 4, marginBottom:2 },
  statLabel: { fontSize:11, color:'#64748B', fontWeight:'800' },
  
  // Date-specific logs styles
  dateLogsContainer: { marginTop: 12, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#DBEAFE' },
  dateLogsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  dateLogsTitle: { fontSize: 15, fontWeight: '900', color: '#0F172A' },
  dateLogsSubtitle: { fontSize: 12, color: '#64748B', fontWeight: '700', marginTop: 2 },
  selectedLogRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 9, borderRadius: 10, marginBottom: 7 },
  selectedLogInfo: { flex: 1, minWidth: 0, paddingRight: 10 },
  selectedLogTitle: { color: '#334155', fontWeight: '900', lineHeight: 18, fontSize: 13 },
  selectedLogMeta: { color: '#64748B', fontSize: 12, marginTop: 3, fontWeight: '700' },
  selectedLogRight: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectedLogAmount: { fontWeight:'900', color:'#0F172A', minWidth: 54, textAlign: 'right' },
  noLogsText: { fontSize: 13, color: '#64748B', textAlign: 'center', paddingVertical: 16, fontWeight: '700' },
  
  // Recent entries with delete functionality
  recentEntriesTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  historyRowContent: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  historyRowLeft: { flex: 1, minWidth: 0, paddingRight: 12 },
  historyRight: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  deleteButton: { padding: 8, borderRadius: 8, backgroundColor: '#FEE2E2', flexShrink: 0 },

  chartRowAlt: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 12, height: 160, paddingHorizontal: 4 },
  chartBarContainer: { alignItems: 'center', flex: 1, minWidth: 32 },
  chartBarWrapper: { alignItems: 'center', justifyContent: 'flex-end', height: 120, marginBottom: 8 },
  barAlt: { width: 20, backgroundColor: '#60A5FA', borderRadius: 4, marginBottom: 4 },
  barAmount: { fontSize: 9, color: '#374151', fontWeight: '600', textAlign: 'center', minHeight: 12 },
  barLabel: { fontSize: 10, color: '#6B7280', fontWeight: '500', textAlign: 'center' },
  todayLabel: { color: '#2563EB', fontWeight: '700' },
  emptyChartContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  emptySubText: { fontSize: 12, color: '#9CA3AF', marginTop: 4, textAlign: 'center' },

  historyRowAlt: { flexDirection: 'row', justifyContent:'space-between', paddingVertical:10, paddingHorizontal:8, borderRadius:8 },
  rowAltEven: { backgroundColor: '#FFFFFF' },
  rowAltOdd: { backgroundColor: '#F8FAFC' },
  historyText: { color:'#334155', fontWeight: '800', lineHeight: 18 },
  historyMeta: { color:'#94A3B8', fontSize: 12, marginTop: 3, fontWeight: '700' },
  historyAmt: { fontWeight:'900', color:'#0F172A', minWidth: 54, textAlign: 'right' },
  /* horizontal progress layout */
  progressCardRow: { backgroundColor: 'white', borderRadius: 16, padding: 12, marginBottom: 12, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 },
  progressCardLeft: { flex: 1, paddingRight: 12 },
  progressCardRight: { width: 116, alignItems: 'center', backgroundColor: '#FFF7ED', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 8, borderWidth: 1, borderColor: '#FED7AA' },
  progressHeaderLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  progressHeadline: { fontSize: 30, fontWeight: '900', color: '#0F172A' },
  progressBarWrapper: { marginTop: 8, height: 7, borderRadius: 8, backgroundColor: 'transparent', overflow: 'hidden' },
  progressBarBg: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#F1F5F9', borderRadius: 8 },
  progressBarFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#60A5FA', borderRadius: 8 },
  progressSubText: { color: '#6B7280', fontSize: 13, fontWeight:'700' },
  motivationalText: { marginTop: 7, color: '#374151', fontSize: 12, fontWeight: '600' },
  missedPassiveCard: { width: 104, alignItems: 'center', backgroundColor: '#FFF7ED', borderRadius: 12, borderWidth: 1, borderColor: '#FED7AA', paddingVertical: 8, paddingHorizontal: 7 },
  missedPassiveIcon: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFEDD5', alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  missedPassiveTextWrap: { flex: 1, minWidth: 0 },
  missedMiniLabel: { fontSize: 10, color: '#334155', fontWeight: '700', textAlign: 'center' },
  missedMiniHelper: { fontSize: 9, color: '#64748B', fontWeight: '600', textAlign: 'center', marginTop: 2, lineHeight: 12 },
  missedMiniNumber: { fontSize: 18, color: '#C2410C', fontWeight: '900', marginTop: 2 },
  goalSheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  goalSheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  goalSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 10, paddingHorizontal: 20, shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.16, shadowRadius: 18, elevation: 16 },
  goalSheetHandle: { alignSelf: 'center', width: 42, height: 5, borderRadius: 999, backgroundColor: '#CBD5E1', marginBottom: 16 },
  goalSheetHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, marginBottom: 16 },
  goalSheetTitleWrap: { flex: 1, minWidth: 0 },
  goalSheetTitle: { fontSize: 22, fontWeight: '900', color: '#0F172A' },
  goalSheetSubtitle: { marginTop: 4, fontSize: 13, lineHeight: 18, color: '#64748B', fontWeight: '700' },
  goalCurrentPill: { borderRadius: 14, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', paddingVertical: 8, paddingHorizontal: 11, alignItems: 'center' },
  goalCurrentLabel: { fontSize: 10, color: '#64748B', fontWeight: '900', textTransform: 'uppercase' },
  goalCurrentValue: { marginTop: 2, fontSize: 14, color: '#1E3A8A', fontWeight: '900' },
  goalRecommendedCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#DBEAFE', paddingVertical: 12, paddingHorizontal: 12, marginBottom: 14 },
  goalRecommendedIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  goalRecommendedTextWrap: { flex: 1, minWidth: 0 },
  goalRecommendedLabel: { fontSize: 14, color: '#0F172A', fontWeight: '900' },
  goalRecommendedText: { marginTop: 2, fontSize: 12, color: '#64748B', fontWeight: '700' },
  goalSheetSectionTitle: { marginTop: 4, marginBottom: 9, fontSize: 12, color: '#475569', fontWeight: '900', textTransform: 'uppercase' },
  goalPresetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 14 },
  goalPresetChip: { flexGrow: 1, minWidth: '47%', minHeight: 44, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#BFDBFE', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  goalPresetChipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  goalPresetText: { color: '#1E3A8A', fontSize: 14, fontWeight: '900' },
  goalPresetTextActive: { color: '#FFFFFF' },
  goalCustomRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  goalCustomInput: { flex: 1, minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', paddingHorizontal: 14, color: '#0F172A', fontSize: 15, fontWeight: '800' },
  goalApplyButton: { minHeight: 48, borderRadius: 14, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, shadowColor: '#1E3A8A', shadowOpacity: 0.12, shadowRadius: 8, elevation: 3 },
  goalApplyButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  goalSheetHint: { marginTop: 7, color: '#64748B', fontSize: 12, fontWeight: '700' },
  goalCancelButton: { marginTop: 16, minHeight: 48, borderRadius: 14, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  goalCancelButtonText: { color: '#334155', fontSize: 14, fontWeight: '900' },
  goalSuccessOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.48)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 22 },
  goalSuccessCard: { width: '100%', maxWidth: 380, backgroundColor: '#FFFFFF', borderRadius: 28, padding: 22, alignItems: 'center', overflow: 'hidden', borderWidth: 1, borderColor: '#DCEBFF', shadowColor: '#000', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.2, shadowRadius: 24, elevation: 16 },
  goalSuccessGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 112, backgroundColor: '#EFF6FF', borderBottomLeftRadius: 92, borderBottomRightRadius: 92 },
  goalSuccessIconRing: { width: 82, height: 82, borderRadius: 41, backgroundColor: 'rgba(37, 99, 235, 0.12)', borderWidth: 1, borderColor: '#BFDBFE', alignItems: 'center', justifyContent: 'center', marginTop: 6, marginBottom: 12 },
  goalSuccessIconInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center', shadowColor: '#2563EB', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 12, elevation: 6 },
  goalSuccessEyebrow: { color: '#2563EB', fontSize: 12, fontWeight: '900', textTransform: 'uppercase', marginBottom: 5 },
  goalSuccessTitle: { color: '#0F172A', fontSize: 24, fontWeight: '900', textAlign: 'center' },
  goalSuccessSubtitle: { color: '#64748B', fontSize: 14, fontWeight: '700', lineHeight: 21, textAlign: 'center', marginTop: 7, marginBottom: 16 },
  goalSuccessMetricCard: { width: '100%', backgroundColor: '#F8FAFC', borderRadius: 20, borderWidth: 1, borderColor: '#BFDBFE', padding: 16, marginBottom: 18 },
  goalSuccessMetricLabel: { color: '#475569', fontSize: 12, fontWeight: '900', textTransform: 'uppercase', marginBottom: 4 },
  goalSuccessMetricValue: { color: '#2563EB', fontSize: 34, fontWeight: '900', marginBottom: 12 },
  goalSuccessTrack: { height: 10, borderRadius: 999, backgroundColor: '#DBEAFE', overflow: 'hidden', marginBottom: 10 },
  goalSuccessFill: { width: '100%', height: '100%', borderRadius: 999, backgroundColor: '#2563EB' },
  goalSuccessHelper: { color: '#475569', fontSize: 12, fontWeight: '800', lineHeight: 17 },
  goalSuccessButton: { width: '100%', minHeight: 50, borderRadius: 14, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center', shadowColor: '#2563EB', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 12, elevation: 4 },
  goalSuccessButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  // Modal styles
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: 'white', borderRadius: 20, padding: 24, marginHorizontal: 20, maxWidth: 400, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 10 },
  modalTitle: { fontSize: 22, fontWeight: '700', color: '#1F2937', marginBottom: 12, textAlign: 'center' },
  modalMessage: { fontSize: 15, color: '#6B7280', marginBottom: 16, textAlign: 'center', lineHeight: 22 },
  modalGoalValue: { fontSize: 32, fontWeight: '900', color: '#1E3A8A', textAlign: 'center', marginBottom: 12 },
  modalSubtext: { fontSize: 13, color: '#9CA3AF', marginBottom: 24, textAlign: 'center', lineHeight: 18 },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalButtonSecondary: { flex: 1, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  modalButtonSecondaryText: { color: '#6B7280', fontWeight: '600', textAlign: 'center', fontSize: 14 },
  modalButtonPrimary: { flex: 1, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, backgroundColor: '#1E3A8A', shadowColor: '#1E3A8A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
  modalButtonPrimaryText: { color: '#FFFFFF', fontWeight: '700', textAlign: 'center', fontSize: 14 },
  // Celebration styles
  celebrationContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  celebrationCard: { width: '100%', maxWidth: 390, backgroundColor: '#FFFFFF', borderRadius: 28, padding: 22, alignItems: 'center', overflow: 'hidden', borderWidth: 1, borderColor: '#DCEBFF', shadowColor: '#000', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 14 },
  celebrationGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 118, backgroundColor: '#EFF6FF', borderBottomLeftRadius: 92, borderBottomRightRadius: 92 },
  celebrationIconRing: { width: 84, height: 84, borderRadius: 42, backgroundColor: 'rgba(37, 99, 235, 0.12)', borderWidth: 1, borderColor: '#BFDBFE', alignItems: 'center', justifyContent: 'center', marginTop: 6, marginBottom: 12 },
  celebrationIconInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center', shadowColor: '#2563EB', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 12, elevation: 6 },
  celebrationEyebrow: { color: '#2563EB', fontSize: 12, fontWeight: '900', textTransform: 'uppercase', marginBottom: 5 },
  celebrationTitle: { fontSize: 25, fontWeight: '900', color: '#0F172A', marginBottom: 8, textAlign: 'center' },
  celebrationMessage: { fontSize: 14, color: '#64748B', marginBottom: 18, textAlign: 'center', lineHeight: 21, fontWeight: '700' },
  celebrationProgressCard: { width: '100%', backgroundColor: '#F8FAFC', borderRadius: 20, borderWidth: 1, borderColor: '#BFDBFE', padding: 16, marginBottom: 18 },
  celebrationProgressHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  celebrationProgressLabel: { color: '#0F172A', fontSize: 15, fontWeight: '900' },
  celebrationProgressMeta: { marginTop: 3, color: '#64748B', fontSize: 12, fontWeight: '700' },
  celebrationProgressValue: { color: '#2563EB', fontSize: 34, fontWeight: '900', lineHeight: 38 },
  celebrationProgressTrack: { height: 12, borderRadius: 999, backgroundColor: '#DBEAFE', overflow: 'hidden' },
  celebrationProgressFill: { height: '100%', borderRadius: 999, backgroundColor: '#2563EB' },
  celebrationBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  celebrationBadge: { flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#EFF6FF', borderRadius: 999, paddingVertical: 7, paddingHorizontal: 9, borderWidth: 1, borderColor: '#DBEAFE' },
  celebrationBadgeText: { color: '#1E3A8A', fontSize: 11, fontWeight: '900' },
  celebrationStats: { flexDirection: 'row', marginBottom: 24, gap: 16 },
  statBox: { flex: 1, backgroundColor: '#F0FDF4', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center' },
  celebrationStatValue: { fontSize: 20, fontWeight: '900', color: '#10B981', marginBottom: 4 },
  celebrationStatLabel: { fontSize: 12, color: '#6B7280', fontWeight: '500' },
  celebrationButton: { width: '100%', paddingVertical: 14, paddingHorizontal: 32, backgroundColor: '#2563EB', borderRadius: 14, marginTop: 2, shadowColor: '#2563EB', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 12, elevation: 4 },
  celebrationButtonText: { color: 'white', fontWeight: '900', fontSize: 16, textAlign: 'center' },
  overhydrationTitle: { fontSize: 26, fontWeight: '900', color: '#EF4444', marginBottom: 12, textAlign: 'center' },
  overhydrationMessage: { fontSize: 16, color: '#6B7280', marginBottom: 20, textAlign: 'center', lineHeight: 24 },
  // Alert styles
  alertOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.3)', justifyContent: 'flex-end', zIndex: 999 },
  alertContent: { backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 32 },
  alertIcon: { alignItems: 'center', marginBottom: 16 },
  alertTitle: { fontSize: 20, fontWeight: '700', color: '#1F2937', marginBottom: 8, textAlign: 'center' },
  alertMessage: { fontSize: 15, color: '#6B7280', marginBottom: 20, textAlign: 'center', lineHeight: 22 },
  alertButton: { paddingVertical: 12, paddingHorizontal: 20, backgroundColor: '#1E3A8A', borderRadius: 10 },
  alertButtonText: { color: 'white', fontWeight: '700', fontSize: 16, textAlign: 'center' },
  
  // Initial Goal Modal Styles
  initialModalIcon: { alignItems: 'center', marginBottom: 16 },
  recommendedGoalBox: { backgroundColor: '#EBF8FF', borderRadius: 12, padding: 16, marginBottom: 20, borderLeftWidth: 4, borderLeftColor: '#3B82F6' },
  recommendedLabel: { fontSize: 12, color: '#1E40AF', fontWeight: '600', marginBottom: 4 },
  recommendedValue: { fontSize: 28, fontWeight: '900', color: '#1E3A8A', marginBottom: 4 },
  recommendedExplain: { fontSize: 12, color: '#3B82F6', lineHeight: 16 },
  customGoalInput: { borderWidth: 2, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, color: '#0F172A', marginBottom: 8 },
  inputHint: { fontSize: 12, color: '#6B7280', textAlign: 'center', marginBottom: 16, fontStyle: 'italic' },
});

