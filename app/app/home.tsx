import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, SafeAreaView, Dimensions, Modal, Image, Pressable, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as api from './api';
import { captureAuthSessionContext, handleAuthFailureIfCurrent, isAuthSessionContextCurrent } from '../services/authSession';
import {
  filterOtcReferenceMedicines,
  getCacheOwner,
  getCachedSession,
  readDeletedMedicationTombstones,
  getUserRemoteAvatarUri,
  getUserSelectedAvatar,
  getUserScopedKey,
  hasValidCachedSession,
  mergeLocalAvatarIntoUser,
  readHydrationCache,
  readMedicationCache,
  readMedicationHistoryCache,
  readOwnedOfflineCache,
  searchCachedOtcMedicinesWithMeta,
  updateCachedUser,
  writeHydrationCache,
  writeMedicationCache,
  writeMedicationHistoryCache,
  writeOwnedOfflineCache,
  writeOtcSearchCache,
} from '../services/offlineStorage';
import { enqueueBeverageLog, getSyncQueueSummary, markBeverageLogSynced, processSyncQueue, type BeverageLogPayload } from '../services/syncQueue';
import { subscribeHomeRefresh } from '../services/homeEvents';
import { performLocalLogout } from '../services/logoutSession';
import { deriveTodayMedicationSummary, getMedicationIdentityValues, type TodayMedicationSummary } from '../utils/medicationSummary';
import BottomNavigation from './components/navigation/BottomNavigation';
import { SelectedAvatar, getAvatarSource } from './components/AvatarSelector';
import ThemedNoticeModal, { ThemedNoticeType } from './components/common/ThemedNoticeModal';
import InlineNotice from './components/common/InlineNotice';
import InlineSyncNotice from './components/common/InlineSyncNotice';
import { FONT_SCALE } from '../utils/fontScaling';
import { useFontScaleVersion } from './accessibility/FontScaleProvider';

const { width } = Dimensions.get('window');
const HOME_GOAL_COMPLETION_SHOWN_PREFIX = 'intakesync.home.goalCompletionShown';
const LAST_HOME_REFRESH_KEY = '@intakesync_last_home_refresh_at';
const HOME_BACKGROUND_REFRESH_TTL_MS = 45 * 1000;
const OTC_SAFETY_COPY = 'Use only as directed on the label. This app does not provide medical advice. Consult a healthcare professional if symptoms persist or you are unsure.';

function createBeverageLocalId() {
  return `bev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function hydrationEntryKey(entry: any) {
  return String(entry?.id ?? entry?.local_id ?? `${entry?.timestamp ?? ''}:${entry?.amount_ml ?? ''}:${entry?.source ?? ''}:${entry?.drink_label ?? ''}`);
}

function getLocalDateKey(date: Date | string) {
  const value = typeof date === 'string' ? new Date(date) : date;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function mergeHydrationEntries(primary: any[], secondary: any[]) {
  const seen = new Set<string>();
  const merged: any[] = [];
  [...primary, ...secondary].forEach((entry) => {
    const key = hydrationEntryKey(entry);
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(entry);
  });
  return merged.sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
}

function totalHydrationForLocalDay(entries: any[], date = new Date()) {
  const dateKey = getLocalDateKey(date);
  return entries.reduce((sum, entry) => (
    sum + (entry?.timestamp && getLocalDateKey(entry.timestamp) === dateKey ? Number(entry.amount_ml || 0) : 0)
  ), 0);
}

async function markCachedHydrationEntrySynced(localId: string, response: any) {
  const hydrationCache = await readHydrationCache<any>();
  const entries = Array.isArray(hydrationCache?.entries) ? hydrationCache.entries : [];
  const nextEntries = entries.map((entry: any) => entry?.local_id === localId ? {
    ...entry,
    id: response?.id ?? response?.entry?.id ?? entry.id,
    sync_status: 'synced',
  } : entry);
  const goal = resolveHydrationGoal(hydrationCache);
  await writeHydrationCache({
    ...(hydrationCache || {}),
    goal,
    daily_goal_ml: goal,
    today_total: totalHydrationForLocalDay(nextEntries),
    percentage: goal > 0 ? Math.round((totalHydrationForLocalDay(nextEntries) / goal) * 100) : 0,
    entries: nextEntries,
  });
}

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

const DEFAULT_QUICK_STATUS: QuickStatus = {
  medicationsLeft: 0,
  hydrationPercentage: 0,
  hydrationTotal: 0,
  hydrationGoal: 2000,
  medicationsTaken: 0,
  medicationsTotal: 0,
};

const EMPTY_MEDICATION_SUMMARY: TodayMedicationSummary = {
  taken: 0,
  total: 0,
  missed: 0,
  skipped: 0,
  remaining: 0,
  percent: 0,
  relevantToday: false,
  doses: [],
  nextMedication: null,
};

const resolveHydrationGoal = (hydrationData: any, fallback = 2000) => {
  const goal = Number(
    hydrationData?.daily_goal_ml ??
    hydrationData?.daily_hydration_goal ??
    hydrationData?.hydration_goal ??
    hydrationData?.goal ??
    fallback
  );

  return Number.isFinite(goal) && goal > 0 ? goal : fallback;
};

const resolveHydrationTotal = (hydrationData: any) => {
  const explicitTotal = Number(hydrationData?.today_total);
  if (Number.isFinite(explicitTotal)) return explicitTotal;
  return Array.isArray(hydrationData?.entries) ? totalHydrationForLocalDay(hydrationData.entries) : 0;
};

const resolveHydrationPercentage = (hydrationData: any, goal: number) => {
  const percentage = Number(hydrationData?.percentage);
  if (Number.isFinite(percentage)) {
    return Math.round(percentage);
  }

  const total = resolveHydrationTotal(hydrationData);
  return goal > 0 ? Math.round((total / goal) * 100) : 0;
};

function buildMergedHydrationPayload(backendData: any, localData: any, fallbackGoal = 2000) {
  const goal = resolveHydrationGoal(backendData || localData, fallbackGoal);
  const backendEntries = Array.isArray(backendData?.entries) ? backendData.entries : [];
  const localEntries = Array.isArray(localData?.entries) ? localData.entries : [];
  const entries = mergeHydrationEntries(localEntries, backendEntries);
  const todayTotal = totalHydrationForLocalDay(entries);
  return {
    ...(localData || {}),
    ...(backendData || {}),
    goal,
    daily_goal_ml: goal,
    today_total: todayTotal,
    percentage: goal > 0 ? Math.round((todayTotal / goal) * 100) : 0,
    entries,
  };
}

export default function Home() {
  useFontScaleVersion();
  const insets = useSafeAreaInsets();
  const { token, offline } = useLocalSearchParams();
  const routeToken = Array.isArray(token) ? token[0] : token;
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [quickStatus, setQuickStatus] = useState<QuickStatus>(DEFAULT_QUICK_STATUS);
  const [medicationSummary, setMedicationSummary] = useState<TodayMedicationSummary>(EMPTY_MEDICATION_SUMMARY);
  const [hydrationEntries, setHydrationEntries] = useState<any[] | null>(null);
  const [selectedAvatar, setSelectedAvatar] = useState<SelectedAvatar | null>(null);
  const [headerElevated, setHeaderElevated] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [weeklyReport, setWeeklyReport] = useState<any>(null);
  const [patterns, setPatterns] = useState<any[]>([]);
  const [snoozeSuggestions, setSnoozeSuggestions] = useState<any[]>([]);
  const [upcomingMedications, setUpcomingMedications] = useState<any[]>([]);
  const [notificationStats, setNotificationStats] = useState<any>(null);
  const [offlineMode, setOfflineMode] = useState(offline === '1');
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [medicineSearch, setMedicineSearch] = useState('');
  const [medicineSuggestions, setMedicineSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [medicineSearchMessage, setMedicineSearchMessage] = useState<string | null>(null);
  const [selectedMedicineResult, setSelectedMedicineResult] = useState<any | null>(null);
  const [previousHydrationPercentage, setPreviousHydrationPercentage] = useState(0);
  const [inlineNotice, setInlineNotice] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [noticeModal, setNoticeModal] = useState<{
    type: ThemedNoticeType;
    title: string;
    message: string;
    primaryText?: string;
    secondaryText?: string;
    onPrimary?: () => void;
  } | null>(null);
  const goalCompletionShownRef = useRef(false);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshFromCacheInFlightRef = useRef(false);
  const backgroundRefreshInFlightRef = useRef(false);
  const homeRefreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insightsScore = weeklyReport?.overall_score ?? 0;
  const remoteAvatarUri = getUserRemoteAvatarUri(user);
  const avatarSource = getAvatarSource(selectedAvatar) || (remoteAvatarUri ? { uri: remoteAvatarUri } : null);

  const applyVisibleUser = useCallback(async (nextUser: any) => {
    const withAvatar = await mergeLocalAvatarIntoUser(nextUser);
    setUser(withAvatar);
    setSelectedAvatar(getUserSelectedAvatar(withAvatar));
    return withAvatar;
  }, []);

  const clearVisibleHomeState = useCallback(() => {
    setUser(null);
    setTimeline([]);
    setQuickStatus(DEFAULT_QUICK_STATUS);
    setMedicationSummary(EMPTY_MEDICATION_SUMMARY);
    setHydrationEntries(null);
    setSelectedAvatar(null);
    setWeeklyReport(null);
    setPatterns([]);
    setSnoozeSuggestions([]);
    setUpcomingMedications([]);
    setNotificationStats(null);
    setPendingSyncCount(0);
    setMedicineSuggestions([]);
    setShowSuggestions(false);
    setMedicineSearchMessage(null);
    setSelectedMedicineResult(null);
    setInlineNotice(null);
    setSyncing(false);
  }, []);

  const showInlineNotice = useCallback((message: string) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setInlineNotice(message);
    noticeTimerRef.current = setTimeout(() => setInlineNotice(null), 2400);
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      if (homeRefreshDebounceRef.current) clearTimeout(homeRefreshDebounceRef.current);
    };
  }, []);

  const shouldRunHomeBackgroundRefresh = useCallback(async () => {
    const raw = await AsyncStorage.getItem(LAST_HOME_REFRESH_KEY);
    const lastRefreshAt = raw ? Number(raw) : 0;
    return !Number.isFinite(lastRefreshAt) || Date.now() - lastRefreshAt > HOME_BACKGROUND_REFRESH_TTL_MS;
  }, []);

  const markHomeBackgroundRefreshed = useCallback(async () => {
    await AsyncStorage.setItem(LAST_HOME_REFRESH_KEY, String(Date.now()));
  }, []);

  const loadHeaderUserFromCache = useCallback(async () => {
    try {
      const session = await getCachedSession();
      if (!hasValidCachedSession(session)) {
        setSelectedAvatar(null);
        return;
      }
      if (routeToken && session.token !== routeToken) return;
      await applyVisibleUser(session.user);
    } catch (err) {
      console.log('Home avatar load error:', err);
    }
  }, [applyVisibleUser, routeToken]);

  useEffect(() => {
    loadHeaderUserFromCache();
  }, [loadHeaderUserFromCache]);

  const applyCacheFirstHomeSummary = useCallback(async (visibleUser?: any | null) => {
    if (refreshFromCacheInFlightRef.current) return;
    refreshFromCacheInFlightRef.current = true;
    try {
      const session = await getCachedSession();
      const sessionUser = visibleUser || session?.user || null;
      if (!sessionUser || !hasValidCachedSession(session)) return;
      if (routeToken && session.token !== routeToken) return;

      const [hydrationCache, cachedMedsRaw, medicationHistoryRaw, deletedKeysRaw, homeCache] = await Promise.all([
        readHydrationCache<any>(),
        readMedicationCache<any[]>(sessionUser),
        readMedicationHistoryCache<any[]>(sessionUser),
        readDeletedMedicationTombstones(sessionUser),
        readOwnedOfflineCache<any>(getUserScopedKey(getCacheOwner(sessionUser), 'home_summary'), sessionUser),
      ]);

      const deletedKeys = new Set(deletedKeysRaw || []);
      const cachedMeds = (cachedMedsRaw || []).filter((med) => (
        !med?.deleted_at && !getMedicationIdentityValues(med).some((identity) => deletedKeys.has(identity))
      ));
      const todayMedication = deriveTodayMedicationSummary({
        meds: cachedMeds,
        rawHistory: medicationHistoryRaw || [],
        now: new Date(),
      });

      const hydrationGoal = resolveHydrationGoal(hydrationCache, homeCache?.data?.quickStatus?.hydrationGoal || DEFAULT_QUICK_STATUS.hydrationGoal);
      const hydrationTotal = hydrationCache ? resolveHydrationTotal(hydrationCache) : Number(homeCache?.data?.quickStatus?.hydrationTotal || 0);
      const hydrationPercentage = hydrationCache
        ? resolveHydrationPercentage(hydrationCache, hydrationGoal)
        : Number(homeCache?.data?.quickStatus?.hydrationPercentage || 0);

      setMedicationSummary(todayMedication);
      setHydrationEntries(Array.isArray(hydrationCache?.entries) ? hydrationCache.entries : null);
      if (Array.isArray(homeCache?.data?.timeline)) setTimeline(homeCache.data.timeline);
      setUpcomingMedications(todayMedication.nextMedication ? [todayMedication.nextMedication] : []);
      setQuickStatus((prev) => ({
        ...prev,
        hydrationGoal,
        hydrationTotal,
        hydrationPercentage,
        medicationsTaken: todayMedication.taken,
        medicationsTotal: todayMedication.total,
        medicationsLeft: todayMedication.remaining,
      }));
    } finally {
      refreshFromCacheInFlightRef.current = false;
    }
  }, [routeToken]);

  useFocusEffect(
    useCallback(() => {
      loadHeaderUserFromCache();
      void applyCacheFirstHomeSummary(user);
      const syncToken = routeToken;
      (async () => {
        const context = await captureAuthSessionContext(syncToken);
        if (syncToken && !(await isAuthSessionContextCurrent(context))) return;
        const before = await getSyncQueueSummary();
        if (syncToken && !(await isAuthSessionContextCurrent(context))) return;
        setPendingSyncCount(before.pending);
        if (syncToken && before.pending > 0) {
          setSyncing(true);
          try {
            await processSyncQueue(syncToken, async (item, response) => {
              if (!(await isAuthSessionContextCurrent(context))) return;
              if (item.action_type === 'LOG_BEVERAGE') {
                await markCachedHydrationEntrySynced(item.local_id, response);
              }
            }).catch(() => {});
          } finally {
            if (await isAuthSessionContextCurrent(context)) setSyncing(false);
          }
        }
        const summary = await getSyncQueueSummary();
        if (syncToken && !(await isAuthSessionContextCurrent(context))) return;
        setPendingSyncCount(summary.pending);
      })();
    }, [applyCacheFirstHomeSummary, loadHeaderUserFromCache, routeToken, user])
  );

  useEffect(() => {
    const subscription = subscribeHomeRefresh(() => {
      if (homeRefreshDebounceRef.current) clearTimeout(homeRefreshDebounceRef.current);
      homeRefreshDebounceRef.current = setTimeout(() => {
        void applyCacheFirstHomeSummary(user);
      }, 100);
    });
    return () => subscription.remove();
  }, [applyCacheFirstHomeSummary, user]);

  // Debounce medicine search
  useEffect(() => {
    let active = true;
    const searchMedicines = async () => {
      const query = medicineSearch.trim();
      if (query.length < 2) {
        setMedicineSuggestions([]);
        setShowSuggestions(false);
        setMedicineSearchMessage(null);
        return;
      }

      try {
        const response = await api.get(`/medicines/search?query=${encodeURIComponent(query)}`);
        if (!active) return;
        const results = filterOtcReferenceMedicines(response.medicines || []);
        await writeOtcSearchCache(query, results);
        if (!active) return;
        setMedicineSuggestions(results);
        setMedicineSearchMessage(null);
        setShowSuggestions(true);
      } catch (err: any) {
        console.log('Medicine search error:', err);
        const cached = await searchCachedOtcMedicinesWithMeta(query);
        if (!active) return;
        const canUseCache = cached.results.length > 0 && (api.isNetworkError(err) || !cached.isStale);
        setMedicineSuggestions(canUseCache ? cached.results : []);
        if (canUseCache) {
          setMedicineSearchMessage(cached.isStale ? 'Showing cached medication results. This data may be outdated.' : 'Showing cached medication results.');
          setShowSuggestions(true);
        } else {
          setMedicineSearchMessage(
            api.isNetworkError(err)
              ? 'No offline medication search data available. You can still manually enter a medication name.'
              : 'Could not search medications. Please try again.'
          );
          setShowSuggestions(true);
        }
      }
    };

    const debounceTimer = setTimeout(searchMedicines, 300);
    return () => {
      active = false;
      clearTimeout(debounceTimer);
    };
  }, [medicineSearch]);

  // Detect hydration goal completion and over-hydration
  useEffect(() => {
    const currentPercentage = quickStatus.hydrationPercentage;
    let cancelled = false;
    
    // Show goal completion modal when crossing 100% threshold
    if (currentPercentage >= 100 && previousHydrationPercentage < 100 && !goalCompletionShownRef.current) {
      const showOnce = async () => {
        const today = new Date().toISOString().slice(0, 10);
        const owner = getCacheOwner(user);
        const key = owner.owner_id || owner.owner_email
          ? getUserScopedKey(owner, `hydration_goal_reached_shown:${today}`)
          : `${HOME_GOAL_COMPLETION_SHOWN_PREFIX}.${today}`;
        const alreadyShown = await AsyncStorage.getItem(key);
        if (cancelled || alreadyShown === '1') return;
        goalCompletionShownRef.current = true;
        await AsyncStorage.setItem(key, '1');
        if (!cancelled) showInlineNotice('Beverage goal reached');
      };
      showOnce().catch(() => {
        if (!cancelled) {
          goalCompletionShownRef.current = true;
          showInlineNotice('Beverage goal reached');
        }
      });
    }
    
    // Show over-hydration modal when exceeding 110% (after goal was already completed)
    if (currentPercentage > 110 && previousHydrationPercentage >= 100 && previousHydrationPercentage <= 110) {
      showInlineNotice('High intake logged');
    }
    
    // Update previous percentage
    if (currentPercentage !== previousHydrationPercentage) {
      setPreviousHydrationPercentage(currentPercentage);
    }

    return () => {
      cancelled = true;
    };
  }, [quickStatus.hydrationPercentage, previousHydrationPercentage, showInlineNotice, user]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const activeToken = routeToken?.trim() || '';
        const context = await captureAuthSessionContext(activeToken || undefined);
        if (activeToken && !(await isAuthSessionContextCurrent(context))) return;
        if (!activeToken) {
          const cached = await getCachedSession();
          if (hasValidCachedSession(cached)) {
            if (cancelled) return;
            const cachedUser = await applyVisibleUser(cached.user);
            const homeCache = await readOwnedOfflineCache<any>(getUserScopedKey(getCacheOwner(cachedUser), 'home_summary'), cachedUser);
            if (homeCache?.data?.quickStatus) setQuickStatus((prev) => ({ ...prev, ...homeCache.data.quickStatus }));
            if (Array.isArray(homeCache?.data?.timeline)) setTimeline(homeCache.data.timeline);
            await applyCacheFirstHomeSummary(cachedUser);
            setOfflineMode(true);
            setLoading(false);
            return;
          }
          clearVisibleHomeState();
          setLoading(false);
          router.replace({ pathname: '/login' } as any);
          return;
        }
        
        // Try to load user data with shorter timeout
        let backgroundUser: any = null;
        try {
          const cached = await getCachedSession();
          const sessionMatchesRoute = hasValidCachedSession(cached) && cached.token === activeToken;
          const sessionUser = sessionMatchesRoute ? await mergeLocalAvatarIntoUser(cached.user) : null;
          backgroundUser = sessionUser;
          if (sessionUser) {
            const homeCache = await readOwnedOfflineCache<any>(getUserScopedKey(getCacheOwner(sessionUser), 'home_summary'), sessionUser);
            const hydrationCache = await readHydrationCache<any>();
            if (cancelled) return;
            if (homeCache?.data?.quickStatus) setQuickStatus((prev) => ({ ...prev, ...homeCache.data.quickStatus }));
            if (Array.isArray(homeCache?.data?.timeline)) setTimeline(homeCache.data.timeline);
            if (hydrationCache) {
              const hydrationGoal = resolveHydrationGoal(hydrationCache);
              setQuickStatus((prev) => ({
                ...prev,
                hydrationGoal,
                hydrationTotal: resolveHydrationTotal(hydrationCache),
                hydrationPercentage: resolveHydrationPercentage(hydrationCache, hydrationGoal),
              }));
            }
            await applyVisibleUser(sessionUser);
            await applyCacheFirstHomeSummary(sessionUser);
            setLoading(false);
          }
          const me = await Promise.race([
            api.get('/me', activeToken, 3000), // 3 second timeout - very short
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
          ]) as any;
          if (!(await isAuthSessionContextCurrent(context))) return;
          if (!hasValidCachedSession({ token: activeToken, user: me })) {
            await handleAuthFailureIfCurrent({ context, router });
            return;
          }
          const visibleMe = await mergeLocalAvatarIntoUser(me);
          backgroundUser = visibleMe;
          if (cancelled) return;
          await applyVisibleUser(visibleMe);
          setOfflineMode(false);
          await updateCachedUser(me, activeToken);
          // Set loading to false immediately after getting user data
          setLoading(false);
        } catch (meErr: any) {
          console.log('Home: /me error:', meErr);
          setSyncing(false);
          // If it's an auth error, redirect to login
          if (api.isAuthError(meErr)) {
            if (await handleAuthFailureIfCurrent({ context, router })) {
              clearVisibleHomeState();
            }
            return;
          }
          const cached = await getCachedSession();
          if (!hasValidCachedSession(cached) || cached.token !== activeToken) {
            if (!(await isAuthSessionContextCurrent(context))) return;
            clearVisibleHomeState();
            setLoading(false);
            router.replace({ pathname: '/login' } as any);
            return;
          }
          if (cancelled) return;
          await applyVisibleUser(cached.user);
          setOfflineMode(true);
          setLoading(false);
          // For other errors, continue to show UI with default data
        }
        
        if (!await shouldRunHomeBackgroundRefresh()) {
          return;
        }

        if (backgroundRefreshInFlightRef.current) {
          return;
        }
        backgroundRefreshInFlightRef.current = true;

        // Load other data in background (non-blocking, quiet, won't affect loading state)
        // These run after loading is already set to false
        setTimeout(() => {
          // Load quick status data (non-blocking with timeouts)
          Promise.allSettled([
            api.get('/hydration', activeToken, 3000).catch(() => null),
            api.get('/medications/upcoming', activeToken, 3000).catch(() => null),
            api.get('/medications/stats', activeToken, 3000).catch(() => null),
            api.get('/medications', activeToken, 3000).catch(() => null),
            api.get('/medications/history/all', activeToken, 3000).catch(() => null),
          ]).then((results) => {
            const hydrationData = results[0].status === 'fulfilled' ? results[0].value : null;
            const upcoming = results[1].status === 'fulfilled' ? results[1].value : null;
            const medicationsData = results[3].status === 'fulfilled' ? results[3].value : null;
            const historyData = results[4].status === 'fulfilled' ? results[4].value : null;
            
            const hydrationGoal = resolveHydrationGoal(hydrationData);
            const writeHydration = async () => {
              if (!(await isAuthSessionContextCurrent(context))) return null;
              const currentHydration = await readHydrationCache<any>();
              if (!(await isAuthSessionContextCurrent(context))) return null;
              const mergedHydration = buildMergedHydrationPayload(hydrationData, currentHydration, hydrationGoal);
              const hydrationEntries = Array.isArray(mergedHydration.entries) ? mergedHydration.entries : [];
              setHydrationEntries(hydrationEntries);
              setQuickStatus((prev) => ({
                ...prev,
                hydrationPercentage: mergedHydration.percentage,
                hydrationTotal: mergedHydration.today_total,
                hydrationGoal: mergedHydration.goal,
              }));
              await writeHydrationCache(mergedHydration);
              return mergedHydration;
            };
            void isAuthSessionContextCurrent(context).then((current) => {
              if (!current) return;
              setUpcomingMedications((currentItems) => currentItems.length ? currentItems : (Array.isArray(upcoming) ? upcoming : []));
            });
            if (backgroundUser && Array.isArray(medicationsData)) {
              void isAuthSessionContextCurrent(context).then((current) => {
                if (current) writeMedicationCache(backgroundUser, medicationsData).catch(() => {});
              });
            }
            if (backgroundUser && Array.isArray(historyData)) {
              void isAuthSessionContextCurrent(context).then((current) => {
                if (current) writeMedicationHistoryCache(backgroundUser, historyData).catch(() => {});
              });
            }
            void writeHydration().then(() => applyCacheFirstHomeSummary(backgroundUser)).catch(() => undefined);
            const owner = getCacheOwner(backgroundUser);
            if (owner.owner_id || owner.owner_email) {
              void isAuthSessionContextCurrent(context).then((current) => {
                if (!current) return;
                writeOwnedOfflineCache(getUserScopedKey(owner, 'home_summary'), backgroundUser, {
                  quickStatus: {
                    hydrationPercentage: hydrationData ? resolveHydrationPercentage(hydrationData, hydrationGoal) : 0,
                    hydrationTotal: hydrationData ? resolveHydrationTotal(hydrationData) : 0,
                    hydrationGoal,
                  },
                  upcomingMedications: Array.isArray(upcoming) ? upcoming : [],
                }).catch(() => {});
              });
            }
            void isAuthSessionContextCurrent(context).then((current) => {
              if (current) void markHomeBackgroundRefreshed();
            });
          }).catch(() => {
            void isAuthSessionContextCurrent(context).then((current) => {
              if (!current) return;
              setQuickStatus((prev) => ({
                ...prev,
                hydrationPercentage: 0,
                hydrationTotal: 0,
                hydrationGoal: 2000,
              }));
            });
          });
          
          // Load timeline separately to avoid blocking on errors
          api.get('/notifications/today-timeline', activeToken, 3000)
            .then((timelineData) => {
              void isAuthSessionContextCurrent(context).then((current) => {
                if (!current) return;
              if (Array.isArray(timelineData)) {
                setTimeline(timelineData);
              } else {
                setTimeline([]);
              }
              });
            })
            .catch(() => {
              void isAuthSessionContextCurrent(context).then((current) => current && setTimeline([]));
            });

          api.get('/notifications/stats', activeToken, 3000)
            .then((statsData) => {
              void isAuthSessionContextCurrent(context).then((current) => current && setNotificationStats(statsData || null));
            })
            .catch(() => {
              void isAuthSessionContextCurrent(context).then((current) => current && setNotificationStats(null));
            })
            .finally(() => {
              void isAuthSessionContextCurrent(context).then((current) => {
                if (current) backgroundRefreshInFlightRef.current = false;
              });
            });
        }, 100); // Small delay to ensure loading is set to false first
      } catch (err: any) {
        console.log('Home load error:', err);
        if (api.isStaleSessionError(err)) return;
        setSyncing(false);
        clearVisibleHomeState();
        setLoading(false);
        const context = await captureAuthSessionContext(routeToken || undefined);
        if (await isAuthSessionContextCurrent(context)) {
          router.replace({ pathname: '/login' } as any);
        }
        // Don't show alerts for network/timeout errors
        if (err?.status !== 408 && err?.status !== 0 && err?.status !== undefined) {
          const message = err?.data?.message || err?.data || err?.message || 'Failed to load data';
          console.log('Error message:', message);
        }
      }
    }
    load();
    
    return () => {
      cancelled = true;
    };
  }, [routeToken, router, clearVisibleHomeState, applyVisibleUser, applyCacheFirstHomeSummary, markHomeBackgroundRefreshed, shouldRunHomeBackgroundRefresh]);

  // Load Routine Insights for every logged-in user (non-blocking)
  useEffect(() => {
    if (routeToken) {
      const loadInsights = async () => {
        const context = await captureAuthSessionContext(routeToken);
        if (!(await isAuthSessionContextCurrent(context))) return;
        try {
          // Use Promise.allSettled to prevent one failing from blocking others
          const results = await Promise.allSettled([
            api.get('/insights/weekly-report', routeToken),
            api.get('/insights/patterns', routeToken),
            api.get('/insights/snooze-analysis', routeToken),
          ]);
          
          if (!(await isAuthSessionContextCurrent(context))) return;
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
  }, [routeToken]);

  // Real-time hydration data refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (!routeToken || loading) return;

      const refreshHydrationData = async () => {
        let ownsRefresh = false;
        try {
          const context = await captureAuthSessionContext(routeToken);
          if (!(await isAuthSessionContextCurrent(context))) return;
          await applyCacheFirstHomeSummary(user);
          if (!await shouldRunHomeBackgroundRefresh() || backgroundRefreshInFlightRef.current) return;
          backgroundRefreshInFlightRef.current = true;
          ownsRefresh = true;
          const hydrationRes = await api.get('/hydration', routeToken, 3000).catch(() => null);
          if (!(await isAuthSessionContextCurrent(context))) return;
          
          if (hydrationRes) {
            const currentHydration = await readHydrationCache<any>();
            const mergedHydration = buildMergedHydrationPayload(hydrationRes, currentHydration, quickStatus.hydrationGoal || 2000);
            setHydrationEntries(Array.isArray(mergedHydration.entries) ? mergedHydration.entries : null);
            
            setQuickStatus(prev => ({
              ...prev,
              hydrationPercentage: mergedHydration.percentage,
              hydrationTotal: mergedHydration.today_total,
              hydrationGoal: mergedHydration.goal
            }));
            await writeHydrationCache(mergedHydration);
            await markHomeBackgroundRefreshed();
          }
          await applyCacheFirstHomeSummary(user);
        } catch (err) {
          console.log('Data refresh error', err);
        } finally {
          if (ownsRefresh) backgroundRefreshInFlightRef.current = false;
        }
      };
      
      refreshHydrationData();
    }, [applyCacheFirstHomeSummary, markHomeBackgroundRefreshed, routeToken, loading, quickStatus.hydrationGoal, shouldRunHomeBackgroundRefresh, user])
  );

  // Use nickname if available, otherwise fall back to first name
  const displayName = user?.nickname || user?.name?.split(' ')[0] || 'User';
  const greetingPrefix = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  const handleInsightsPress = () => {
    router.push({ pathname: '/insights', params: { token: routeToken } } as any);
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
      setNoticeModal({
        type: 'destructive',
        title: 'Sign Out?',
        message: 'Are you sure you want to sign out of your account?',
        primaryText: 'Sign Out',
        secondaryText: 'Cancel',
        onPrimary: async () => {
          setNoticeModal(null);
          clearVisibleHomeState();
          setLoading(true);
          await performLocalLogout({
            reason: 'home_menu',
            router,
            token: routeToken as string | undefined,
            user,
            onLocalStateCleared: clearVisibleHomeState,
          });
        },
      });
      return;
    }

    if ('route' in item && item.route) {
      router.push({ pathname: item.route, params: { token: routeToken } } as any);
    } else {
      setNoticeModal({ type: 'info', title: 'Coming Soon', message: `${item.label} will be available soon.` });
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
    if (!todayHydrationEntries || todayHydrationEntries.length === 0) return null;
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
  const medicationPercent = medicationSummary.relevantToday
    ? medicationSummary.percent
    : 0;
  const recentUpdates = timeline.slice(0, 2);
  const missedCount = timeline.filter((item) => item.status === 'missed').length;
  const notificationCount = notificationStats
    ? Math.max(0, Number(notificationStats.unread ?? 0) + Number(notificationStats.alerts ?? notificationStats.needs_attention ?? 0))
    : timeline.filter((item) => item.status === 'missed' || item.status === 'pending').length;
  const nextMedication = medicationSummary.nextMedication || upcomingMedications[0] || null;

  const getMedicationName = (medication: any) => (
    medication?.medication_name ||
    medication?.medicine_name ||
    medication?.name ||
    medication?.title ||
    'medication'
  );

  const getMedicationTime = (medication: any) => {
    const raw =
      medication?.time ||
      medication?.scheduled_time ||
      medication?.reminder_time ||
      medication?.due_time ||
      medication?.next_dose_time ||
      '';
    if (!raw) return '';
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime())
      ? String(raw)
      : parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const neededMl = Math.max(0, (quickStatus.hydrationGoal || 0) - (quickStatus.hydrationTotal || 0));
  const nextMedicationName = nextMedication ? getMedicationName(nextMedication) : '';
  const nextMedicationTime = nextMedication ? getMedicationTime(nextMedication) : '';
  const nextAction = (() => {
    if (nextMedication) {
      return `${nextMedicationName}${nextMedicationTime ? ` at ${nextMedicationTime}` : ' is due soon'}`;
    }
    if (medicationSummary.relevantToday && medicationSummary.remaining === 0) return 'No medication due soon';
    if (quickStatus.hydrationPercentage < 50 && neededMl >= 250) return 'Drink 250 ml now to stay on track';
    if (neededMl > 0) return 'Log your next drink';
    return 'Stay on track today';
  })();

  const hydrationScore = Math.min(100, Math.max(0, quickStatus.hydrationPercentage));
  const medicationScore = medicationPercent;
  const hasHydrationData =
    quickStatus.hydrationTotal > 0 ||
    (Array.isArray(todayHydrationEntries) && todayHydrationEntries.length > 0);
  const hasMedicationData = medicationSummary.relevantToday;
  const hasTodayScoreData = hasHydrationData || hasMedicationData;
  // Today Score intentionally averages hydration with medication adherence whenever
  // there are scheduled doses or durable medication history today. Pending doses count
  // in the medication total, so they lower the score until completed.
  const todayScore = hasMedicationData
    ? Math.round((hydrationScore + medicationScore) / 2)
    : hasHydrationData
      ? hydrationScore
      : null;
  const todayScoreTextColor = todayScore === null
    ? '#64748B'
    : todayScore >= 90 ? '#10B981' : todayScore >= 70 ? '#2563EB' : todayScore >= 40 ? '#F97316' : '#EF4444';
  const todayScoreBorderColor = todayScore === null ? '#CBD5E1' : todayScoreTextColor;
  const hydrationBreakdown = hasHydrationData
    ? `Hydration: ${quickStatus.hydrationPercentage >= 90 ? 'Good' : quickStatus.hydrationPercentage >= 50 ? 'Fair' : 'Low'}`
    : 'Hydration: No logs';
  const medicationBreakdown = hasMedicationData
    ? `Meds: ${medicationPercent >= 80 ? 'Good' : 'Needs attention'}`
    : 'Meds: No doses';
  const sugarBreakdown = sugarAwareness ? `Sugar: ${levelLabel(sugarAwareness.level)}` : null;
  const todayScoreBreakdown = [hydrationBreakdown, medicationBreakdown, sugarBreakdown].filter(Boolean).join(' | ');
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

  const handleNotificationPress = () => {
    router.push({ pathname: '/components/pages/notification/Notification', params: { token: routeToken } } as any);
  };

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

  const clearMedicineSearch = () => {
    setMedicineSearch('');
    setMedicineSuggestions([]);
    setShowSuggestions(false);
    setMedicineSearchMessage(null);
  };

  const getMedicineDosage = (medicine: any) => medicine?.dosage_text || medicine?.dosage || '';
  const getMedicineUse = (medicine: any) => medicine?.common_use || medicine?.short_use || medicine?.description || medicine?.category || '';
  const getMedicineMeta = (medicine: any) => [medicine?.generic_name || medicine?.brand, medicine?.category || medicine?.common_use].filter(Boolean).join(' - ');

  const buildMedicineRouteData = (medicine: any) => {
    let frequency = 'daily';
    const dosageLower = getMedicineDosage(medicine).toLowerCase();
    if (dosageLower.includes('twice') || dosageLower.includes('2 times') || dosageLower.includes('every 12')) {
      frequency = 'twice_daily';
    } else if (dosageLower.includes('three times') || dosageLower.includes('3 times') || dosageLower.includes('every 8')) {
      frequency = 'three_times_daily';
    } else if (dosageLower.includes('four times') || dosageLower.includes('4 times') || dosageLower.includes('every 6')) {
      frequency = 'four_times_daily';
    }

    return {
      id: medicine?.id,
      name: medicine?.name,
      generic_name: medicine?.generic_name,
      brand: medicine?.brand,
      description: medicine?.description,
      common_use: medicine?.common_use,
      category: medicine?.category,
      dosage: medicine?.dosage,
      dosage_text: medicine?.dosage_text,
      interval_hours: medicine?.interval_hours,
      max_daily_doses: medicine?.max_daily_doses,
      timing_instructions: medicine?.timing_instructions,
      warnings: medicine?.warnings,
      is_otc: true,
      frequency,
    };
  };

  const openMedicineResult = (medicine: any) => {
    Keyboard.dismiss();
    setSelectedMedicineResult(medicine);
    setShowSuggestions(false);
  };

  const addSelectedMedicineToMedications = () => {
    if (!selectedMedicineResult) return;
    const medicine = selectedMedicineResult;
    setSelectedMedicineResult(null);
    clearMedicineSearch();
    router.push({
      pathname: '/components/pages/medication/Medication',
      params: {
        token,
        medicineName: medicine.name,
        medicineDosage: getMedicineDosage(medicine),
        medicineData: JSON.stringify(buildMedicineRouteData(medicine)),
      },
    } as any);
  };

  const persistHomeHydrationSnapshot = async (entries: any[], goal: number) => {
    const todayTotal = totalHydrationForLocalDay(entries);
    const hydrationPercentage = goal > 0 ? Math.round((todayTotal / goal) * 100) : 0;
    setHydrationEntries(entries);
    setQuickStatus((prev) => ({
      ...prev,
      hydrationTotal: todayTotal,
      hydrationGoal: goal,
      hydrationPercentage,
    }));
    await writeHydrationCache({
      goal,
      daily_goal_ml: goal,
      today_total: todayTotal,
      percentage: hydrationPercentage,
      entries,
    });
  };

  const quickLogWater = async () => {
    const amountMl = 250;
    const localId = createBeverageLocalId();
    const entry = {
      local_id: localId,
      client_uuid: localId,
      amount_ml: amountMl,
      timestamp: new Date().toISOString(),
      source: 'home_quick',
      beverage_type: 'water',
      sugar_level: 'none',
      caffeine_level: 'none',
      notes: null,
      drink_label: 'Water',
      sync_status: 'pending',
    };
    const cachedHydration = await readHydrationCache<any>();
    const goal = resolveHydrationGoal(cachedHydration || quickStatus, quickStatus.hydrationGoal || 2000);
    const cachedEntries = Array.isArray(cachedHydration?.entries) ? cachedHydration.entries : [];
    const currentEntries = Array.isArray(hydrationEntries) ? hydrationEntries : [];
    const newEntries = mergeHydrationEntries([...currentEntries, entry], cachedEntries);
    try {
      await persistHomeHydrationSnapshot(newEntries, goal);
    } catch {
      showInlineNotice('Save failed');
      return;
    }

    const queuePayload: BeverageLogPayload = {
      local_id: localId,
      amount_ml: amountMl,
      source: entry.source,
      beverage_type: entry.beverage_type,
      sugar_level: entry.sugar_level,
      caffeine_level: entry.caffeine_level,
      notes: entry.notes,
      drink_label: entry.drink_label,
      timestamp: entry.timestamp,
    };
    await enqueueBeverageLog(queuePayload);

    if (!token) {
      setOfflineMode(true);
      showInlineNotice('Will sync later');
      return;
    }

    try {
      const response = await api.post('/hydration', {
        local_id: localId,
        client_uuid: localId,
        amount_ml: amountMl,
        source: entry.source,
        beverage_type: entry.beverage_type,
        sugar_level: entry.sugar_level,
        caffeine_level: entry.caffeine_level,
        notes: entry.notes,
        drink_label: entry.drink_label,
        timestamp: entry.timestamp,
      }, routeToken as string);
      await markBeverageLogSynced(localId);
      const syncedEntries = newEntries.map((item) => item.local_id === localId ? {
        ...item,
        id: response?.id ?? response?.entry?.id ?? item.id,
        sync_status: 'synced',
      } : item);
      await persistHomeHydrationSnapshot(syncedEntries, goal);
      setOfflineMode(false);
      showInlineNotice('Water logged');
    } catch (err: any) {
      console.log('Home quick beverage log sync error:', {
        status: err?.status,
        message: err?.data?.message || err?.message,
        data: err?.data,
      });
      if (api.isNetworkError(err)) setOfflineMode(true);
      showInlineNotice(api.isNetworkError(err) ? 'Will sync later' : 'Sync pending');
    }
  };

  if (loading || !user) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#2563EB" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.header, headerElevated && styles.headerElevated, { paddingTop: Math.max(insets.top, 8) }]}>
        <View style={styles.headerBrand}>
          <TouchableOpacity style={styles.menuButton} onPress={() => setMenuVisible(true)} activeOpacity={0.82}>
            <Ionicons name="menu" size={22} color="#1E3A8A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>IntakeSync</Text>
        </View>
          
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.notificationButton}
            onPress={handleNotificationPress}
            activeOpacity={0.82}
          >
            <Ionicons name="notifications-outline" size={22} color="#1E3A8A" />
            {notificationCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>{notificationCount > 9 ? '9+' : notificationCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.profileAvatar}
            onPress={() => router.push({ pathname: '/components/pages/profile/Profile', params: { token: routeToken } } as any)}
            activeOpacity={0.82}
          >
            {renderHeaderAvatar()}
          </TouchableOpacity>
        </View>
      </View>
      <InlineSyncNotice
        visible={syncing && !inlineNotice && !menuVisible && !noticeModal && !selectedMedicineResult}
        message="Syncing..."
        top={Math.max(insets.top, 8) + 54}
      />
      <InlineNotice
        visible={Boolean(inlineNotice) && !menuVisible && !noticeModal && !selectedMedicineResult}
        message={inlineNotice || ''}
        top={Math.max(insets.top, 8) + 54}
      />
      {offlineMode ? (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={15} color="#1E3A8A" />
          <Text style={styles.offlineBannerText}>Offline mode</Text>
        </View>
      ) : null}
      {pendingSyncCount > 0 ? (
        <View style={styles.offlineBanner}>
          <Ionicons name="sync-outline" size={15} color="#1E3A8A" />
          <Text style={styles.offlineBannerText}>{pendingSyncCount} changes waiting to sync.</Text>
        </View>
      ) : null}

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
            <Text style={styles.welcomeText} numberOfLines={2} maxFontSizeMultiplier={FONT_SCALE.title}>{displayName ? `${greetingPrefix}, ${displayName}` : 'Welcome back'}</Text>
            <Text style={styles.welcomeSubtext} maxFontSizeMultiplier={FONT_SCALE.description}>Here is your routine summary for today.</Text>
          <View>
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color="#6B7280" style={styles.searchIcon} />
              <TextInput
                placeholder="Search medicine"
                style={styles.searchInput}
                placeholderTextColor="#9CA3AF"
                value={medicineSearch}
                onChangeText={(text) => {
                  setMedicineSearch(text);
                  setMedicineSearchMessage(null);
                  if (!text.trim()) clearMedicineSearch();
                }}
                onFocus={() => medicineSearch.length >= 2 && setShowSuggestions(true)}
                textAlignVertical="center"
                maxFontSizeMultiplier={FONT_SCALE.input}
              />
              {medicineSearch.length > 0 && (
                <TouchableOpacity 
                  style={styles.searchClear}
                  onPress={clearMedicineSearch}
                >
                  <Ionicons name="close-circle" size={20} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>
            
            {/* Medicine Suggestions Dropdown */}
            {showSuggestions && (medicineSuggestions.length > 0 || medicineSearchMessage) && (
              <View style={styles.suggestionsContainer}>
                {medicineSearchMessage ? (
                  <Text style={styles.suggestionNotice}>{medicineSearchMessage}</Text>
                ) : null}
                <ScrollView style={styles.suggestionsList} nestedScrollEnabled keyboardShouldPersistTaps="always">
                  {medicineSuggestions.map((medicine) => (
                    <TouchableOpacity
                      key={String(medicine.id || medicine.name)}
                      style={styles.suggestionItem}
                      onPress={() => openMedicineResult(medicine)}
                    >
                      <View style={styles.suggestionIcon}>
                        <Ionicons name="medkit" size={19} color="#FFFFFF" />
                      </View>
                      <View style={styles.suggestionContent}>
                        <Text style={styles.suggestionName} maxFontSizeMultiplier={FONT_SCALE.title}>{medicine.name}</Text>
                        <Text style={styles.suggestionDetails} maxFontSizeMultiplier={FONT_SCALE.description}>{getMedicineMeta(medicine) || 'OTC medication'}</Text>
                        {!!getMedicineUse(medicine) && <Text style={styles.suggestionUse} numberOfLines={3} maxFontSizeMultiplier={FONT_SCALE.description}>{getMedicineUse(medicine)}</Text>}
                      </View>
                      <Ionicons name="add-circle" size={20} color="#1E3A8A" />
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
                <View style={styles.smartHeaderCopy}>
                  <Text style={styles.smartCardLabel}>Next Action</Text>
                  {nextMedication ? <Text style={styles.smartCardHint}>Medication</Text> : null}
                </View>
              </View>
              <Text style={styles.nextActionText} numberOfLines={3}>{nextAction}</Text>
            </View>

            <View style={[styles.smartCard, styles.scoreCard, { borderColor: todayScoreBorderColor, borderLeftColor: todayScoreBorderColor }]}>
              <Text style={styles.smartCardLabel}>Today Score</Text>
              {hasTodayScoreData && todayScore !== null ? (
                <>
                  <Text style={[styles.scoreValue, { color: todayScoreTextColor }]} maxFontSizeMultiplier={FONT_SCALE.stat} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{todayScore}%</Text>
                  <Text style={styles.scoreHelper} numberOfLines={2}>{todayScoreBreakdown}</Text>
                </>
              ) : (
                <>
                  <Text style={[styles.scoreEmptyValue, { color: todayScoreTextColor }]} maxFontSizeMultiplier={FONT_SCALE.stat} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>No score yet</Text>
                  <Text style={styles.scoreHelper} numberOfLines={2}>Log beverages or medication activity to start.</Text>
                </>
              )}
            </View>
          </View>

          {/* Beverage Intake Card */}
          <Pressable
            style={({ pressed }) => [styles.featureCard, styles.beverageCard, pressed && styles.cardPressed]}
            onPress={() => router.push({ pathname: '/components/pages/hydration/Hydration', params: { token: routeToken } } as any)}
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
              <Text style={styles.primaryMetric} maxFontSizeMultiplier={FONT_SCALE.stat} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{quickStatus.hydrationPercentage}%</Text>
              <Pressable
                style={({ pressed }) => [styles.quickActionChip, pressed && styles.chipPressed]}
                onPress={async (e) => {
                  e.stopPropagation();
                  try {
                    await quickLogWater();
                  } catch (err: any) {
                    console.log('Home quick beverage local save error:', err);
                    showInlineNotice('Save failed');
                  }
                }}
              >
                <Text style={styles.quickActionText} maxFontSizeMultiplier={FONT_SCALE.button} numberOfLines={1}>+250 ml</Text>
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
            onPress={() => router.push({ pathname: '/components/pages/medication/Medication', params: { token: routeToken } } as any)}
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
                <Ionicons name="medkit-outline" size={24} color="#EF4444" />
              </View>
            </View>
            <View style={styles.metricRow}>
              <Text style={[styles.primaryMetric, styles.medicationMetric]} maxFontSizeMultiplier={FONT_SCALE.stat} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{medicationPercent}%</Text>
              <Pressable
                style={({ pressed }) => [styles.medicationAddChip, pressed && styles.chipPressed]}
                onPress={(e) => {
                  e.stopPropagation();
                  router.push({ pathname: '/components/pages/medication/Medication', params: { token: routeToken } } as any);
                }}
              >
                <Text style={styles.quickActionText} maxFontSizeMultiplier={FONT_SCALE.button} numberOfLines={1}>+ Add</Text>
              </Pressable>
            </View>
            {nextMedication && (
              <Text style={styles.nextMedicationText} numberOfLines={1}>
                Next: {nextMedicationName}{nextMedicationTime ? ` at ${nextMedicationTime}` : ''}
              </Text>
            )}
            <View style={styles.progressBarContainer}>
              <View style={[
                styles.progressBar, 
                { 
                  width: `${medicationPercent}%`, 
                  backgroundColor: '#EF4444' 
                }
              ]} />
            </View>
            {quickStatus.medicationsLeft > 0 && (
              <Text style={styles.nextMedicationText}>
                {quickStatus.medicationsLeft === 1 ? '1 dose remaining' : `${quickStatus.medicationsLeft} doses remaining`}
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

      <Modal
        visible={!!selectedMedicineResult}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedMedicineResult(null)}
      >
        <View style={styles.medicineModalOverlay}>
          <View style={styles.medicineModalContent}>
            <View style={styles.medicineModalHeader}>
              <View style={styles.medicineModalIcon}>
                <Ionicons name="medkit" size={24} color="#FFFFFF" />
              </View>
              <TouchableOpacity style={styles.medicineModalCloseIcon} onPress={() => setSelectedMedicineResult(null)}>
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <Text style={styles.medicineModalEyebrow}>OTC medication</Text>
            <Text style={styles.medicineModalTitle}>{selectedMedicineResult?.name || 'Medicine'}</Text>
            {!!selectedMedicineResult?.generic_name && (
              <Text style={styles.medicineModalSubtitle}>Generic: {selectedMedicineResult.generic_name}</Text>
            )}

            <View style={styles.medicineDetailGrid}>
              {!!selectedMedicineResult?.brand && (
                <View style={styles.medicineDetailBox}>
                  <Text style={styles.medicineDetailLabel}>Brand</Text>
                  <Text style={styles.medicineDetailValue}>{selectedMedicineResult.brand}</Text>
                </View>
              )}
              {!!selectedMedicineResult?.category && (
                <View style={styles.medicineDetailBox}>
                  <Text style={styles.medicineDetailLabel}>Category</Text>
                  <Text style={styles.medicineDetailValue}>{selectedMedicineResult.category}</Text>
                </View>
              )}
            </View>

            <View style={styles.medicineInfoSection}>
              <Text style={styles.medicineInfoLabel}>Common use</Text>
              <Text style={styles.medicineInfoText}>{getMedicineUse(selectedMedicineResult) || 'Medication lookup details are limited for this item.'}</Text>
            </View>
            <View style={styles.medicineInfoSection}>
              <Text style={styles.medicineInfoLabel}>Recommended dosage</Text>
              <Text style={styles.medicineInfoText}>{getMedicineDosage(selectedMedicineResult) || 'Follow the medication label or package directions.'}</Text>
            </View>
            <View style={styles.medicineSafetyBox}>
              <Ionicons name="shield-checkmark-outline" size={17} color="#1E3A8A" />
              <Text style={styles.medicineSafetyText}>{OTC_SAFETY_COPY}</Text>
            </View>

            <View style={styles.medicineModalActions}>
              <TouchableOpacity style={styles.medicinePrimaryButton} onPress={addSelectedMedicineToMedications}>
                <Ionicons name="add-circle" size={18} color="#FFFFFF" />
                <Text style={styles.medicinePrimaryButtonText}>Add to Medications</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.medicineSecondaryButton} onPress={() => setSelectedMedicineResult(null)}>
                <Text style={styles.medicineSecondaryButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ThemedNoticeModal
        visible={!!noticeModal}
        type={noticeModal?.type || 'info'}
        title={noticeModal?.title || ''}
        message={noticeModal?.message || ''}
        primaryText={noticeModal?.primaryText || 'OK'}
        secondaryText={noticeModal?.secondaryText}
        onPrimary={noticeModal?.onPrimary || (() => setNoticeModal(null))}
        onSecondary={() => setNoticeModal(null)}
        onClose={() => setNoticeModal(null)}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  loadingText: {
    marginTop: 12,
    color: '#64748B',
    fontSize: 14,
    fontWeight: '700',
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#DBEAFE',
    borderBottomWidth: 1,
    borderBottomColor: '#BFDBFE',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  offlineBannerText: {
    color: '#1E3A8A',
    fontSize: 12,
    fontWeight: '800',
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
    paddingHorizontal: 20,
    paddingBottom: 10,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
    zIndex: 10,
  },
  headerElevated: {
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#E2E8F0',
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
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1E3A8A',
  },
  menuButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 12,
  },
  notificationButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
  },
  profileAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1E3A8A',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#BFDBFE',
  },
  headerAvatarImage: {
    width: '112%',
    height: '112%',
  },
  avatarText: {
    color: 'white',
    fontWeight: '800',
    fontSize: 18,
  },
  welcomeSection: {
    paddingTop: 16,
    marginBottom: 16,
  },
  welcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  welcomeText: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    color: '#1F2937',
    marginBottom: 4,
  },
  welcomeKicker: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2563EB',
    marginBottom: 4,
  },
  welcomeSubtext: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 12,
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
    paddingVertical: 8,
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1F2937',
    minHeight: 34,
    paddingVertical: 6,
  },
  searchClear: {
    padding: 4,
  },
  suggestionsContainer: {
    backgroundColor: 'white',
    borderRadius: 14,
    marginTop: 8,
    maxHeight: 300,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.09,
    shadowRadius: 12,
    elevation: 5,
    overflow: 'hidden',
  },
  suggestionsList: {
    maxHeight: 300,
  },
  suggestionNotice: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 12,
    lineHeight: 16,
    color: '#1E3A8A',
    fontWeight: '800',
    backgroundColor: '#EFF6FF',
    borderBottomWidth: 1,
    borderBottomColor: '#DBEAFE',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  suggestionIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: '#1E3A8A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#93C5FD',
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  suggestionContent: {
    flex: 1,
    minWidth: 0,
  },
  suggestionName: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 2,
  },
  suggestionDetails: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 2,
  },
  suggestionUse: {
    fontSize: 11,
    color: '#1E3A8A',
    fontWeight: '800',
    lineHeight: 15,
  },
  medicineModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.46)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  medicineModalContent: {
    width: '100%',
    maxWidth: 390,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
  },
  medicineModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  medicineModalIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: '#1E3A8A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#93C5FD',
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  medicineModalCloseIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  medicineModalEyebrow: {
    fontSize: 11,
    color: '#1E3A8A',
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  medicineModalTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 30,
  },
  medicineModalSubtitle: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '800',
    marginTop: 4,
  },
  medicineDetailGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  medicineDetailBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  medicineDetailLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  medicineDetailValue: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '900',
  },
  medicineInfoSection: {
    marginTop: 14,
  },
  medicineInfoLabel: {
    fontSize: 12,
    color: '#1E3A8A',
    fontWeight: '900',
    marginBottom: 5,
  },
  medicineInfoText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '700',
    lineHeight: 19,
  },
  medicineSafetyBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    padding: 12,
    marginTop: 16,
  },
  medicineSafetyText: {
    flex: 1,
    fontSize: 12,
    color: '#1E3A8A',
    fontWeight: '800',
    lineHeight: 17,
  },
  medicineModalActions: {
    gap: 10,
    marginTop: 18,
  },
  medicinePrimaryButton: {
    minHeight: 46,
    borderRadius: 15,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 4,
  },
  medicinePrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  medicineSecondaryButton: {
    minHeight: 44,
    borderRadius: 15,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  medicineSecondaryButtonText: {
    color: '#1E3A8A',
    fontSize: 14,
    fontWeight: '900',
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
    justifyContent: 'flex-start',
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
    marginBottom: 10,
  },
  smartHeaderCopy: {
    flex: 1,
    minWidth: 0,
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
  smartCardHint: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '800',
    color: '#2563EB',
  },
  nextActionText: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '800',
    color: '#1E3A8A',
    lineHeight: 20,
    textAlign: 'left',
  },
  scoreValue: {
    fontSize: 30,
    fontWeight: '900',
    color: '#1E3A8A',
    marginTop: 4,
  },
  scoreEmptyValue: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '900',
    marginTop: 10,
    marginBottom: 4,
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
    gap: 10,
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
    flexShrink: 1,
  },
  waterActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    marginTop: 2,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  medicationMetric: {
    color: '#EF4444',
  },
  medicationCard: {
    borderColor: '#FECACA',
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  medicationIcon: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  addMedicationHint: {
    fontSize: 12,
    fontWeight: '800',
    color: '#EF4444',
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
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
    marginBottom: 4,
  },
  beverageMiniBox: {
    flex: 1,
    minWidth: 120,
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
    gap: 6,
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
    flexShrink: 1,
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
    minHeight: 36,
    minWidth: 88,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    justifyContent: 'center',
    marginTop: 0,
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
    elevation: 2,
  },
  medicationAddChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EF4444',
    minHeight: 36,
    minWidth: 82,
    paddingVertical: 8,
    paddingHorizontal: 17,
    borderRadius: 999,
    justifyContent: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
    elevation: 2,
  },
  chipPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.88,
  },
  quickActionText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#DCEBFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  goalModalTopGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 112,
    backgroundColor: '#EFF6FF',
    borderBottomLeftRadius: 90,
    borderBottomRightRadius: 90,
  },
  goalModalIconRing: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  goalModalIconInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 6,
  },
  goalModalHeader: {
    alignItems: 'center',
    marginBottom: 18,
  },
  goalModalEyebrow: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0,
    marginBottom: 5,
  },
  goalModalTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  goalModalSubtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 6,
    textAlign: 'center',
    fontWeight: '700',
  },
  goalModalStats: {
    width: '100%',
    marginBottom: 18,
  },
  goalStatBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  goalStatHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  goalStatValue: {
    fontSize: 34,
    fontWeight: '900',
    color: '#2563EB',
    lineHeight: 38,
  },
  goalStatLabel: {
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '900',
  },
  goalStatCaption: {
    marginTop: 3,
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  goalProgressTrack: {
    height: 12,
    borderRadius: 999,
    backgroundColor: '#DBEAFE',
    overflow: 'hidden',
  },
  goalProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#2563EB',
  },
  goalStatFooter: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  goalStatFooterText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '800',
  },
  goalModalMessage: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 18,
    fontWeight: '700',
  },
  goalModalButton: {
    backgroundColor: '#2563EB',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 4,
  },
  goalModalButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '900',
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



