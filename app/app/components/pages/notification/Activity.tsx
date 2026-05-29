import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DeviceEventEmitter,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { del, get, invalidateApiCacheGroup, isAuthError, isNetworkError, post, put } from '../../../api';
import { captureAuthSessionContext, handleAuthFailureIfCurrent, isAuthSessionContextCurrent } from '../../../../services/authSession';
import {
  getCachedSession,
  getCacheOwner,
  getMedicationClearedHistoryCacheKey,
  getUserCacheIdentifier,
  getUserScopedKey,
  readDeletedMedicationTombstones,
  readHydrationCache,
  readMedicationCache,
  readMedicationHistoryCache,
  readNotificationsCache,
  readSettingsCache,
  writeNotificationsCache,
} from '../../../../services/offlineStorage';
import { enqueueSyncAction, getPendingSyncActions, processSyncQueue } from '../../../../services/syncQueue';
import {
  getScheduledNotificationRefs,
  isNotificationRecordHidden,
  isUnreadActionableNotificationRecord,
  markLocalNotificationCleared,
  markLocalNotificationRead,
  readLocalNotificationInbox,
  reconcileNotificationInbox,
} from '../../../../services/notificationService';
import { notificationSettings } from '../../../../services/notificationSettings';
import { NOTIFICATIONS_UPDATED_EVENT, REMINDERS_RESCHEDULED_EVENT } from '../../../../services/homeEvents';
import { FONT_SCALE } from '../../../../utils/fontScaling';
import BottomNavigation from '../../navigation/BottomNavigation';
import ThemedNoticeModal from '../../common/ThemedNoticeModal';
import InlineNotice from '../../common/InlineNotice';
import InlineSyncNotice from '../../common/InlineSyncNotice';
import { deriveTopNotice } from '../../common/topNotice';
import { useConnectionStatus } from '../../../../hooks/useConnectionStatus';
import { logPerf, perfNow } from '../../../../utils/perf';

type NotificationType = 'hydration' | 'medication' | 'general';
type NotificationStatus =
  | 'scheduled'
  | 'upcoming'
  | 'delivered'
  | 'completed'
  | 'missed'
  | 'skipped'
  | 'snoozed'
  | 'failed'
  | 'needs_attention'
  | 'cleared';
type InboxFilter = 'all' | 'unread' | 'medication' | 'hydration';
type CounterKey = 'unread' | 'scheduled' | 'alerts';
const RECENT_NOTIFICATION_PAGE_SIZE = 50;
const ACTIVITY_BACKEND_REFRESH_TTL_MS = 20 * 1000;
const ACTIVITY_LOCAL_INBOX_READ_TTL_MS = 7500;

interface NotificationItem {
  id: number | string;
  type: NotificationType;
  title: string;
  message: string;
  status: NotificationStatus;
  scheduled_at?: string | null;
  scheduled_time?: string | null;
  created_at?: string | null;
  delivered_at?: string | null;
  opened_at?: string | null;
  read_at?: string | null;
  hidden_at?: string | null;
  cleared_at?: string | null;
  deleted_at?: string | null;
  metadata?: Record<string, any> | null;
}

interface NotificationStats {
  unread?: number;
  scheduled_today?: number;
  alerts?: number;
  by_type?: {
    hydration?: number;
    medication?: number;
    general?: number;
  };
}

interface ReminderItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  time: string;
  status: NotificationStatus;
  notification?: NotificationItem;
  fallback?: boolean;
}

const isSameLocalDay = (iso: string | null | undefined, date: Date) => {
  if (!iso) return false;
  const parsed = new Date(iso);
  return (
    parsed.getFullYear() === date.getFullYear() &&
    parsed.getMonth() === date.getMonth() &&
    parsed.getDate() === date.getDate()
  );
};

const parseSafeDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getSafeTime = (value?: string | null) => parseSafeDate(value)?.getTime() ?? 0;

const formatSafeTime = (value?: string | null) =>
  parseSafeDate(value)?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) ?? 'Unknown';

const MEDICATION_LATE_GRACE_MS = 30 * 60 * 1000;

const isMedicationHistoryLate = (entry: any) => {
  if (entry?.status !== 'completed') return false;
  if (entry?.is_late === true || entry?.isLate === true || entry?.taken_status === 'late' || entry?.takenStatus === 'late') return true;
  const scheduled = getSafeTime(entry?.scheduled_time || entry?.time);
  const actual = getSafeTime(entry?.loggedAt || entry?.logged_at || entry?.taken_at || entry?.completed_at || entry?.created_at || entry?.updated_at);
  return scheduled > 0 && actual > 0 && actual - scheduled > MEDICATION_LATE_GRACE_MS;
};

const formatMeta = (value?: string | null) => {
  const date = parseSafeDate(value);
  if (!date) return 'Unknown time';
  return `${date.toLocaleDateString()} | ${formatSafeTime(value)}`;
};

const getErrorMessage = (error: any, fallback: string) => {
  const message = error?.data?.message || error?.message || error?.data;
  return typeof message === 'string' && message.trim() ? message : fallback;
};

const isMissingBackendRoute = (error: any) => (
  error?.status === 404 ||
  error?.response?.status === 404 ||
  String(error?.data?.message || error?.message || error?.data || '').toLowerCase().includes('route not found')
);

const isScheduledStatus = (status: NotificationStatus) => status === 'scheduled' || status === 'upcoming';
const isLocalActivity = (item: NotificationItem) => Boolean(item.metadata?.local_activity);
const isUnread = (item: NotificationItem) => isUnreadActionableNotificationRecord(item as any);
const isAlertStatus = (status: NotificationStatus) =>
  status === 'missed' || status === 'skipped' || status === 'failed' || status === 'needs_attention';

const getTone = (item: Pick<NotificationItem | ReminderItem, 'type' | 'status'>) => {
  if (isAlertStatus(item.status)) {
    return { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', label: 'Alert', icon: 'alert-circle-outline' as const };
  }
  if (item.status === 'snoozed') {
    return { color: '#D97706', bg: '#FFF7ED', border: '#FED7AA', label: 'Snoozed', icon: 'time-outline' as const };
  }
  if (item.status === 'completed') {
    return { color: '#059669', bg: '#ECFDF5', border: '#A7F3D0', label: 'Completed', icon: 'checkmark-circle-outline' as const };
  }
  if (item.type === 'hydration') {
    return { color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', label: 'Beverage', icon: 'water-outline' as const };
  }
  if (item.type === 'medication') {
    return { color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', label: 'Medication', icon: 'medical-outline' as const };
  }
  return { color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', label: 'Reminder', icon: 'notifications-outline' as const };
};

const activityDate = (item: NotificationItem) => item.scheduled_at || item.scheduled_time || item.created_at;

const dedupeNotifications = (items: NotificationItem[]) => {
  const byKey = new Map<string, NotificationItem>();
  items.forEach((item) => {
    const key = getNotificationIdentity(item);
    const existing = byKey.get(key);
    if (!existing || getSafeTime(activityDate(item)) > getSafeTime(activityDate(existing))) {
      byKey.set(key, item);
    }
  });
  return Array.from(byKey.values());
};

const formatBeverageLabel = (entry: any) => {
  if (entry?.drink_label) return entry.drink_label;
  const type = String(entry?.beverage_type || 'beverage').replace(/_/g, ' ');
  return type.charAt(0).toUpperCase() + type.slice(1);
};

const medicationHistoryCompositeKey = (entry: any) => [
  entry?.medId ?? entry?.medication_id ?? entry?.medicationId ?? '',
  entry?.time ?? entry?.scheduled_at ?? entry?.scheduled_time ?? '',
  entry?.status ?? '',
].map((value) => String(value)).join('|');

const getReminderKey = (item: ReminderItem) => `${item.type}:${item.id || item.title}:${formatSafeTime(item.time)}`;

const getNotificationIdentity = (item: NotificationItem) => String(
  item.type === 'hydration' && item.metadata?.source === 'hydration_log'
    ? (
      item.metadata?.local_id
        ? `hydration-log:${item.metadata.local_id}`
        : item.metadata?.client_uuid
          ? `hydration-log:${item.metadata.client_uuid}`
          : item.metadata?.server_id || item.metadata?.hydration_log_id
            ? `hydration-log:server:${item.metadata.server_id || item.metadata.hydration_log_id}`
            : `hydration-log:fallback:${item.metadata?.timestamp || activityDate(item)}:${item.metadata?.amount_ml || item.metadata?.amount || ''}:${String(item.metadata?.drink_label || item.title || '').trim().toLowerCase()}`
    )
    : item.metadata?.scheduleKey ||
      item.metadata?.schedule_key ||
      item.metadata?.doseKey ||
      item.metadata?.dose_key ||
      item.metadata?.notificationId ||
      item.metadata?.notification_id ||
      item.id ||
      `${item.type}:${item.title}:${activityDate(item)}`
);

const mergeNotificationRecords = (items: NotificationItem[]) => {
  const byKey = new Map<string, NotificationItem>();
  items.forEach((item) => {
    const key = getNotificationIdentity(item);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      return;
    }
    const status = item.status === 'cleared' || existing.status === 'cleared'
      ? 'cleared'
      : item.status === 'scheduled' && ['delivered', 'missed', 'skipped', 'failed', 'needs_attention', 'snoozed', 'completed'].includes(existing.status)
        ? existing.status
        : item.status;
    const incomingIsLocalStateMarker = Boolean(item.metadata?.local_state_marker);
    byKey.set(key, {
      ...existing,
      ...item,
      id: existing.id || item.id,
      type: incomingIsLocalStateMarker ? existing.type : item.type,
      title: incomingIsLocalStateMarker ? existing.title : item.title,
      message: incomingIsLocalStateMarker ? existing.message : item.message,
      status,
      scheduled_at: item.scheduled_at || existing.scheduled_at || null,
      scheduled_time: item.scheduled_time || existing.scheduled_time || null,
      created_at: existing.created_at || item.created_at || null,
      opened_at: item.opened_at || existing.opened_at || null,
      read_at: item.read_at || existing.read_at || null,
      hidden_at: item.hidden_at || existing.hidden_at || null,
      cleared_at: item.cleared_at || existing.cleared_at || null,
      deleted_at: item.deleted_at || existing.deleted_at || null,
      metadata: { ...(existing.metadata || {}), ...(item.metadata || {}) },
    });
  });
  return Array.from(byKey.values());
};

const dedupeReminders = (items: ReminderItem[]) => {
  const seen = new Set<string>();
  return items
    .sort((a, b) => getSafeTime(a.time) - getSafeTime(b.time))
    .filter((item) => {
      const key = getReminderKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const hiddenRecentKey = (user: any) => {
  const owner = getCacheOwner(user);
  if (!owner.owner_id && !owner.owner_email) return null;
  return getUserScopedKey(owner, 'notifications:hidden_recent_ids');
};

const isHiddenRecent = (item: NotificationItem, hiddenIds: Set<string>) => (
  hiddenIds.has(String(item.id)) || isNotificationRecordHidden(item as any)
);

const isLocalReminderRecord = (item: NotificationItem) => {
  const source = String(item.metadata?.source || '');
  return source.includes('reminder') || Boolean(item.metadata?.scheduleKey || item.metadata?.schedule_key || item.metadata?.notificationId || item.metadata?.notification_id);
};

const backendNotificationId = (item: NotificationItem) => item.metadata?.backendNotificationId || item.metadata?.backend_notification_id || (!isLocalReminderRecord(item) ? item.id : null);

const hasHappenedOrWasActioned = (item: NotificationItem) => {
  const when = getSafeTime(item.scheduled_at || item.scheduled_time || item.created_at);
  if (isNotificationRecordHidden(item as any)) return false;
  if (isLocalActivity(item)) return true;
  if (item.delivered_at || item.opened_at || item.read_at) return true;
  if (['delivered', 'completed', 'missed', 'skipped', 'failed', 'needs_attention'].includes(item.status)) return when <= Date.now();
  if (item.status === 'snoozed') return when <= Date.now();
  return false;
};

const getMedicationDoseGroupKey = (item: NotificationItem) => {
  const metadata = item.metadata || {};
  const scheduleKey = String(metadata.scheduleKey || metadata.schedule_key || metadata.doseKey || metadata.dose_key || item.id || '');
  const match = scheduleKey.match(/^medication:([^:]+):([^:]+):(\d{4}-\d{2}-\d{2}):(\d{2}):(\d{2})(?::\d+)?$/);
  if (match) return `medication:${match[2]}:${match[3]}:${match[4]}:${match[5]}`;
  const medicationId = metadata.medicationId || metadata.medication_id || 'medication';
  const doseTime = getMedicationBaseDoseTime(item) || item.scheduled_at || item.scheduled_time || item.created_at || '';
  return `medication:${medicationId}:${formatSafeTime(doseTime)}`;
};

const getMedicationBaseDoseTime = (item: NotificationItem) => {
  const metadata = item.metadata || {};
  if (metadata.doseTime || metadata.dose_time) return String(metadata.doseTime || metadata.dose_time);
  const scheduleKey = String(metadata.scheduleKey || metadata.schedule_key || metadata.doseKey || metadata.dose_key || item.id || '');
  const match = scheduleKey.match(/^medication:([^:]+):([^:]+):(\d{4}-\d{2}-\d{2}):(\d{2}):(\d{2})(?::\d+)?$/);
  if (match) {
    const parsed = new Date(`${match[3]}T${match[4]}:${match[5]}:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  const offset = Number(metadata.reminderOffsetMinutes ?? metadata.reminder_offset_minutes);
  const triggerTime = getSafeTime(item.scheduled_at || item.scheduled_time || item.created_at);
  if (Number.isFinite(offset) && triggerTime > 0) {
    return new Date(triggerTime + offset * 60 * 1000).toISOString();
  }
  return item.scheduled_at || item.scheduled_time || item.created_at || '';
};

const getMedicationReminderOffset = (item: NotificationItem) => {
  const metadata = item.metadata || {};
  const direct = Number(metadata.reminderOffsetMinutes ?? metadata.reminder_offset_minutes);
  if (Number.isFinite(direct)) return direct;
  const scheduleKey = String(metadata.scheduleKey || metadata.schedule_key || metadata.doseKey || metadata.dose_key || item.id || '');
  const match = scheduleKey.match(/^medication:[^:]+:[^:]+:\d{4}-\d{2}-\d{2}:\d{2}:\d{2}:(\d+)$/);
  return match ? Number(match[1]) : NaN;
};

const getLocalHourKey = (value?: string | null) => {
  const date = parseSafeDate(value);
  if (!date) return '';
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  return `${year}-${month}-${day}:${hour}`;
};

const getHydrationSlotGroupKey = (item: NotificationItem) => {
  const metadata = item.metadata || {};
  return String(metadata.scheduleKey || metadata.schedule_key || item.id || `hydration:${formatSafeTime(item.scheduled_at || item.scheduled_time || item.created_at)}`);
};

const getScheduledGroupKey = (item: NotificationItem) => (
  item.type === 'medication' ? getMedicationDoseGroupKey(item) : getHydrationSlotGroupKey(item)
);

const groupScheduledTodayRecords = (items: NotificationItem[]) => {
  const groups = new Map<string, NotificationItem & { triggerOffsets?: number[] }>();
  items.forEach((item) => {
    let key = getScheduledGroupKey(item);
    const metadata = item.metadata || {};
    if (item.type === 'medication' && metadata.source === 'scheduled_ref_fallback') {
      const itemTime = formatSafeTime(item.scheduled_at || item.scheduled_time || item.created_at);
      const existingSameTime = Array.from(groups.entries()).find(([, record]) => (
        record.type === 'medication' &&
        formatSafeTime(record.scheduled_at || record.scheduled_time || record.created_at) === itemTime
      ));
      if (existingSameTime) key = existingSameTime[0];
    }
    const existing = groups.get(key);
    const offset = getMedicationReminderOffset(item);
    const triggerOffsets = new Set<number>([...(existing?.triggerOffsets || [])]);
    if (Number.isFinite(offset)) triggerOffsets.add(offset);

    if (item.type === 'medication') {
      const doseTime = getMedicationBaseDoseTime(item);
      const medicationName = metadata.medicationName || metadata.medication_name || String(item.title || '').replace(/^Take\s+/i, '').replace(/^Time to take\s+/i, '').replace(/\s+in\s+\d+\s+minutes$/i, '');
      const existingName = existing?.title?.replace(/^Take\s+/i, '');
      const displayName = String(medicationName || existingName || '').trim();
      const existingTrigger = getSafeTime(existing?.metadata?.nextTriggerAt || existing?.metadata?.next_trigger_at || existing?.scheduled_at || existing?.scheduled_time || existing?.created_at);
      const itemTrigger = getSafeTime(item.scheduled_at || item.scheduled_time || item.created_at);
      const nextTriggerAt = existingTrigger > 0 && itemTrigger > 0
        ? new Date(Math.min(existingTrigger, itemTrigger)).toISOString()
        : item.scheduled_at || item.scheduled_time || item.created_at;
      const next: NotificationItem & { triggerOffsets?: number[] } = {
        ...(existing || item),
        ...item,
        id: key,
        title: displayName && displayName !== 'Medication reminder' ? `Take ${displayName.replace(/^Take\s+/i, '')}` : 'Medication reminder',
        message: `Dose at ${formatSafeTime(doseTime)}`,
        scheduled_at: doseTime || item.scheduled_at || item.scheduled_time || item.created_at,
        scheduled_time: doseTime || item.scheduled_time || item.scheduled_at || item.created_at,
        status: existing?.status === 'delivered' || item.status === 'delivered' ? 'delivered' : item.status,
        metadata: { ...(existing?.metadata || {}), ...metadata, grouped_schedule: true, doseTime, nextTriggerAt },
        triggerOffsets: Array.from(triggerOffsets).sort((a, b) => b - a),
      };
      const offsets = next.triggerOffsets || [];
      if (offsets.length > 0) {
        const labels = offsets.map((value) => value > 0 ? `${value} min` : 'due time').join(', ');
        next.message = `${next.message} | Alerts: ${labels}`;
      }
      groups.set(key, next);
      return;
    }

    groups.set(key, {
      ...(existing || item),
      ...item,
      id: key,
      metadata: { ...(existing?.metadata || {}), ...metadata, grouped_schedule: true },
      triggerOffsets: Array.from(triggerOffsets).sort((a, b) => b - a),
    });
  });
  return Array.from(groups.values()).sort(
    (a, b) => getSafeTime(a.scheduled_at || a.scheduled_time || a.created_at) - getSafeTime(b.scheduled_at || b.scheduled_time || b.created_at)
  );
};

export default function Activity() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const routeToken = (params?.token as string) || undefined;
  const [cachedToken, setCachedToken] = useState<string | undefined>();
  const token = routeToken || cachedToken;
  const insets = useSafeAreaInsets();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [medicationFallbacks, setMedicationFallbacks] = useState<ReminderItem[]>([]);
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNotification, setSelectedNotification] = useState<NotificationItem | null>(null);
  const [noticeModal, setNoticeModal] = useState<{ title: string; message: string } | null>(null);
  const [offlineMode, setOfflineMode] = useState(false);
  const [inlineNotice, setInlineNotice] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [hiddenRecentIds, setHiddenRecentIds] = useState<Set<string>>(new Set());
  const [recordListModal, setRecordListModal] = useState<{ title: string; records: NotificationItem[] } | null>(null);
  const [recentRenderLimit, setRecentRenderLimit] = useState(RECENT_NOTIFICATION_PAGE_SIZE);
  const [localReminderPrefs, setLocalReminderPrefs] = useState({
    allowNotifications: false,
    medicationReminders: true,
    hydrationReminders: true,
  });
  const backendRefreshInFlightRef = useRef(false);
  const lastBackendRefreshRef = useRef<{ ownerKey: string; completedAt: number } | null>(null);
  const localHydrationInFlightRef = useRef(false);
  const lastLocalInboxReadRef = useRef<Map<string, { loadedAt: number; records: any[] }>>(new Map());
  const localHydrationDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentUserRef = useRef<any>(null);
  const statsRef = useRef<NotificationStats | null>(null);
  const connection = useConnectionStatus(token);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);

  useEffect(() => {
    if (!inlineNotice) return;
    const timer = setTimeout(() => setInlineNotice(null), 2400);
    return () => clearTimeout(timer);
  }, [inlineNotice]);

  const loadHiddenRecentIds = useCallback(async (sessionUser: any) => {
    const key = hiddenRecentKey(sessionUser);
    if (!key) {
      setHiddenRecentIds(new Set());
      return new Set<string>();
    }
    try {
      const parsed = JSON.parse((await AsyncStorage.getItem(key)) || '[]');
      const next = new Set<string>(Array.isArray(parsed) ? parsed.map(String) : []);
      setHiddenRecentIds(next);
      return next;
    } catch {
      const empty = new Set<string>();
      setHiddenRecentIds(empty);
      return empty;
    }
  }, []);

  const persistHiddenRecentIds = useCallback(async (sessionUser: any, ids: Set<string>) => {
    const key = hiddenRecentKey(sessionUser);
    if (!key) return;
    await AsyncStorage.setItem(key, JSON.stringify(Array.from(ids)));
  }, []);

  const loadReminderPreferences = useCallback(async (sessionUser: any) => {
    await notificationSettings.initialize();
    const serviceSettings = notificationSettings.getSettings();
    const cached = sessionUser ? await readSettingsCache<any>(sessionUser) : null;
    const notificationPreferences = cached?.notificationPreferences || {};
    const next = {
      allowNotifications: notificationPreferences.allowNotifications !== false && serviceSettings.masterToggle,
      medicationReminders: notificationPreferences.medicationReminders !== false && serviceSettings.categories.medications !== false,
      hydrationReminders: notificationPreferences.hydrationReminders !== false && serviceSettings.categories.hydration !== false,
    };
    setLocalReminderPrefs(next);
    return next;
  }, []);

  useEffect(() => {
    let mounted = true;
    if (routeToken) {
      setOfflineMode(false);
      return () => {
        mounted = false;
      };
    }

    getCachedSession().then(async (session) => {
      if (!mounted) return;
      if (session?.token) {
        const context = await captureAuthSessionContext(session.token, session.user ?? null);
        if (!mounted || !(await isAuthSessionContextCurrent(context))) return;
        setCachedToken(session.token);
        setCurrentUser(session.user ?? null);
        setOfflineMode(true);
      } else {
        router.replace('/login');
      }
    });

    return () => {
      mounted = false;
    };
  }, [routeToken, router]);

  const normalizeNotifications = useCallback((payload: any): NotificationItem[] => {
    const arr = Array.isArray(payload) ? payload : payload?.data;
    if (!Array.isArray(arr)) return [];

    return arr
      .map((raw: any) => ({
        id: raw?.id ?? `${raw?.type}-${raw?.scheduled_at || raw?.scheduled_time || raw?.created_at}`,
        type: (raw?.type ?? 'general') as NotificationType,
        title: raw?.title ?? 'Notification',
        message: raw?.message ?? raw?.body ?? '',
        status: (raw?.status ?? 'scheduled') as NotificationStatus,
        scheduled_at: raw?.scheduled_at ?? raw?.scheduled_time ?? null,
        scheduled_time: raw?.scheduled_time ?? raw?.scheduled_at ?? null,
        created_at: raw?.created_at ?? null,
        delivered_at: raw?.delivered_at ?? null,
        opened_at: raw?.opened_at ?? raw?.read_at ?? null,
        read_at: raw?.read_at ?? null,
        hidden_at: raw?.hidden_at ?? null,
        cleared_at: raw?.cleared_at ?? null,
        deleted_at: raw?.deleted_at ?? null,
        metadata: raw?.metadata ?? raw?.data ?? null,
      }))
      .filter((item: NotificationItem) => !isNotificationRecordHidden(item as any));
  }, []);

  const normalizeMedicationFallbacks = useCallback((payload: any): ReminderItem[] => {
    const arr = Array.isArray(payload) ? payload : [];
    const today = new Date();
    return arr
      .map((item: any, index: number) => {
        const med = item?.medication ?? {};
        const time = item?.next_reminder ?? item?.scheduled_time ?? item?.time_string ?? '';
        return {
          id: `fallback-med-${med.id ?? index}-${time}`,
          type: 'medication' as const,
          title: med.name ? `Take ${med.name}` : 'Medication reminder',
          message: med.dosage ? `Scheduled dose | ${med.dosage}` : 'Scheduled medication reminder',
          time,
          status: 'scheduled' as const,
          fallback: true,
        };
      })
      .filter((item: ReminderItem) => isSameLocalDay(item.time, today) && getSafeTime(item.time) > Date.now());
  }, []);

  const buildLocalActivityRecords = useCallback(async (sessionUser: any): Promise<NotificationItem[]> => {
    if (!sessionUser) return [];
    const ownerKey = getUserCacheIdentifier(sessionUser);
    const clearedHistoryKey = ownerKey ? getMedicationClearedHistoryCacheKey(ownerKey) : null;
    const [hydrationCache, medicationCache, medicationHistory, pendingActions, deletedMedicationKeys, clearedHistoryRaw] = await Promise.all([
      readHydrationCache<any>(),
      readMedicationCache<any[]>(sessionUser),
      readMedicationHistoryCache<any[]>(sessionUser),
      getPendingSyncActions(),
      readDeletedMedicationTombstones(sessionUser),
      clearedHistoryKey ? AsyncStorage.getItem(clearedHistoryKey).catch(() => null) : Promise.resolve(null),
    ]);
    const deletedMedicationKeySet = new Set((deletedMedicationKeys || []).map(String));
    let parsedClearedHistoryKeys: string[] = [];
    try {
      const parsed = JSON.parse(clearedHistoryRaw || '[]');
      parsedClearedHistoryKeys = Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      parsedClearedHistoryKeys = [];
    }
    const clearedHistoryKeys = new Set<string>(parsedClearedHistoryKeys);

    const medicationById = new Map<string, any>();
    (Array.isArray(medicationCache) ? medicationCache : []).forEach((med) => {
      [med?.id, med?.local_id, med?.server_id, med?.client_uuid].filter(Boolean).forEach((id) => medicationById.set(String(id), med));
    });

    const beverageRecords: NotificationItem[] = (Array.isArray(hydrationCache?.entries) ? hydrationCache.entries : [])
      .filter((entry: any) => !entry?.deleted_at)
      .map((entry: any) => {
        const when = entry?.timestamp || entry?.created_at || new Date().toISOString();
        const label = formatBeverageLabel(entry);
        return {
          id: `beverage:${entry?.local_id || entry?.id || `${when}:${entry?.amount_ml || 0}:${label}`}`,
          type: 'hydration',
          title: `${label} logged`,
          message: `${Number(entry?.amount_ml || entry?.logged_ml || 0)} ml beverage log`,
          status: 'completed',
          created_at: when,
          scheduled_at: when,
          read_at: when,
          opened_at: when,
          metadata: {
            local_activity: true,
            source: 'hydration_log',
            local_id: entry?.local_id || entry?.id,
            client_uuid: entry?.client_uuid || entry?.local_id,
            server_id: entry?.server_id || (entry?.id && !String(entry.id).startsWith('bev_') ? entry.id : null),
            hydration_log_id: entry?.id || entry?.server_id,
            hydrationSlotKey: `hydration:${getLocalHourKey(when)}`,
            amount_ml: Number(entry?.amount_ml || entry?.logged_ml || 0),
            drink_label: entry?.drink_label || null,
            beverage_type: entry?.beverage_type || null,
            timestamp: when,
          },
        };
      });

    const medicationRecords: NotificationItem[] = (Array.isArray(medicationHistory) ? medicationHistory : [])
      .filter((entry: any) => !clearedHistoryKeys.has(String(entry?.id)) && !clearedHistoryKeys.has(medicationHistoryCompositeKey(entry)))
      .filter((entry: any) => !deletedMedicationKeySet.has(String(entry?.medId || entry?.medication_id || entry?.medicationId || '')))
      .map((entry: any) => {
        const med = medicationById.get(String(entry?.medId || entry?.medication_id || entry?.medicationId || entry?.server_id || entry?.local_id || ''));
        const status = (entry?.status === 'skipped' ? 'skipped' : entry?.status === 'missed' ? 'missed' : entry?.status === 'snoozed' ? 'snoozed' : 'completed') as NotificationStatus;
        const when = entry?.loggedAt || entry?.logged_at || entry?.created_at || entry?.time || new Date().toISOString();
        const medName = med?.name || entry?.medicationName || entry?.medication_name || 'Medication';
        const isLate = isMedicationHistoryLate(entry);
        const doseKey = entry?.dose_key || entry?.doseKey || `${entry?.medId || entry?.medication_id || entry?.server_id || med?.id || 'med'}:${entry?.time || when}`;
        return {
          id: `medication-history:${entry?.id || `${entry?.medId || entry?.medication_id}:${entry?.time}:${status}`}`,
          type: 'medication',
          title: status === 'completed' ? `${medName} ${isLate ? 'taken late' : 'taken'}` : `${medName} ${status}`,
          message: entry?.time ? `Scheduled for ${formatSafeTime(entry.time)}` : 'Medication activity recorded',
          status,
          created_at: when,
          scheduled_at: entry?.time || when,
          read_at: when,
          opened_at: when,
          metadata: {
            local_activity: true,
            source: 'medication_history',
            medicationId: med?.id || entry?.medId || entry?.medication_id,
            medication_id: med?.id || entry?.medId || entry?.medication_id,
            medicationName: medName,
            is_late: isLate,
            taken_status: isLate ? 'late' : status === 'completed' ? 'on_time' : null,
            doseTime: entry?.time || when,
            dose_time: entry?.time || when,
            doseKey,
            dose_key: doseKey,
          },
        };
      });

    const syncRecords: NotificationItem[] = pendingActions.map((item) => ({
      id: `sync:${item.id || item.local_id}`,
      type: 'general',
      title: 'Pending offline sync',
      message: 'Will sync later.',
      status: item.status === 'failed' ? 'failed' : 'needs_attention',
      created_at: item.updated_at || item.created_at,
      scheduled_at: item.updated_at || item.created_at,
      read_at: item.updated_at || item.created_at,
      opened_at: item.updated_at || item.created_at,
      metadata: { local_activity: true, source: 'sync_queue', action_type: item.action_type },
    }));

    return dedupeNotifications([...beverageRecords, ...medicationRecords, ...syncRecords]);
  }, []);

  const loadLocalReminderItems = useCallback(async (prefs = localReminderPrefs): Promise<ReminderItem[]> => {
    const refs = await getScheduledNotificationRefs();
    const now = Date.now();
    const today = new Date();

    return dedupeReminders(refs
      .filter((ref) => {
        if (!prefs.allowNotifications) return false;
        if (ref.type === 'hydration' && !prefs.hydrationReminders) return false;
        if (ref.type === 'medication' && !prefs.medicationReminders) return false;
        const when = ref.scheduledAt || ref.doseTime;
        return getSafeTime(when) > now && isSameLocalDay(when, today);
      })
      .map((ref) => {
        const amount = Number(ref.suggestedAmount || ref.amount || 0);
        const offset = Number(ref.reminderOffsetMinutes || 0);
        const time = ref.scheduledAt || ref.doseTime || '';
        return {
          id: `ref-${ref.scheduleKey || ref.doseKey || ref.notificationId}`,
          type: ref.type === 'medication' ? 'medication' : 'hydration',
          title: ref.type === 'medication'
            ? `${ref.medicationName || 'Medication'} reminder`
            : 'Beverage reminder',
          message: ref.type === 'medication'
            ? `${ref.doseTime ? `Dose at ${formatSafeTime(ref.doseTime)}` : 'Medication reminder'}${offset ? ` | ${offset} min before` : ''}`
            : amount > 0 ? `${amount} ml suggested` : 'Hydration reminder',
          time,
          status: 'scheduled',
        };
      }));
  }, [localReminderPrefs]);

  const loadNotifications = useCallback(async (showSync = false) => {
    if (!token) return;
    const context = await captureAuthSessionContext(token);
    if (!(await isAuthSessionContextCurrent(context))) return;
    const pendingActions = await getPendingSyncActions();
    setPendingSyncCount(pendingActions.length);
    const shouldShowSync = showSync || pendingActions.length > 0;
    let ownsBackendRefresh = false;
    if (shouldShowSync) setSyncing(true);
    try {
      const session = await getCachedSession();
      if (session?.token !== token || !(await isAuthSessionContextCurrent(context))) return;
      const sessionUser = currentUserRef.current || session?.user || null;
      if (sessionUser && !currentUserRef.current) {
        currentUserRef.current = sessionUser;
        setCurrentUser(sessionUser);
      }
      const owner = getCacheOwner(sessionUser);
      const ownerKey = String(owner.owner_id || owner.owner_email || token);
      const lastRefresh = lastBackendRefreshRef.current;
      if (!showSync && backendRefreshInFlightRef.current) return;
      if (!showSync && lastRefresh?.ownerKey === ownerKey && Date.now() - lastRefresh.completedAt < ACTIVITY_BACKEND_REFRESH_TTL_MS) return;
      backendRefreshInFlightRef.current = true;
      ownsBackendRefresh = true;
      const prefs = await loadReminderPreferences(sessionUser);
      await loadHiddenRecentIds(sessionUser);
      if (pendingActions.length > 0) await processSyncQueue(token);
      setPendingSyncCount((await getPendingSyncActions()).length);
      const reconcileStartedAt = perfNow();
      const localInbox = sessionUser ? await reconcileNotificationInbox(owner, { reason: showSync ? 'manual_refresh' : 'activity_backend_refresh' }) : [];
      logPerf('Activity notification reconciliation', reconcileStartedAt, {
        count: localInbox.length,
        source: 'backend_refresh',
      });
      const [notificationRes, medicationRes] = await Promise.all([
        get('/notifications', token, 5000),
        get('/medications/upcoming', token, 5000).catch(() => []),
      ]);
      if (!(await isAuthSessionContextCurrent(context))) return;
      const localActivity = await buildLocalActivityRecords(sessionUser);
      const normalized = mergeNotificationRecords([...normalizeNotifications(notificationRes), ...localInbox, ...localActivity]);
      const localReminderItems = await loadLocalReminderItems(prefs);
      const fallback = dedupeReminders([...localReminderItems, ...normalizeMedicationFallbacks(medicationRes)]);
      setNotifications(normalized);
      setMedicationFallbacks(fallback);
      await writeNotificationsCache({ notifications: normalized, stats: statsRef.current, medicationFallbacks: fallback }, sessionUser);
      lastBackendRefreshRef.current = { ownerKey, completedAt: Date.now() };
      setError(null);
      setOfflineMode(false);
    } catch (err) {
      if (!(await isAuthSessionContextCurrent(context))) return;
      if (isAuthError(err)) {
        await handleAuthFailureIfCurrent({ context, router });
        return;
      }
      if (isNetworkError(err)) {
        setOfflineMode(true);
        setPendingSyncCount((await getPendingSyncActions()).length);
        setError('Offline mode');
        const cached = await readNotificationsCache<any>(currentUserRef.current);
        const session = await getCachedSession();
        const fallbackUser = currentUserRef.current || session?.user || null;
        const reconcileStartedAt = perfNow();
        const localInbox = fallbackUser ? await readLocalNotificationInbox(getCacheOwner(fallbackUser)) : [];
        logPerf('Activity notification reconciliation', reconcileStartedAt, {
          count: localInbox.length,
          source: 'offline_fallback',
        });
        const localActivity = await buildLocalActivityRecords(fallbackUser);
        const prefs = await loadReminderPreferences(fallbackUser);
        await loadHiddenRecentIds(fallbackUser);
        const localReminderItems = await loadLocalReminderItems(prefs);
        if (cached) {
          setNotifications(mergeNotificationRecords([...(cached.notifications || []), ...localInbox, ...localActivity]));
          setStats(cached.stats || null);
          setMedicationFallbacks(dedupeReminders([...localReminderItems, ...(cached.medicationFallbacks || [])]));
        } else {
          setNotifications(mergeNotificationRecords([...localInbox, ...localActivity]));
          setMedicationFallbacks(localReminderItems);
        }
        return;
      }
      setError(getErrorMessage(err, 'Could not load notifications from the backend.'));
    } finally {
      if (shouldShowSync && await isAuthSessionContextCurrent(context)) setSyncing(false);
      if (ownsBackendRefresh) backendRefreshInFlightRef.current = false;
    }
  }, [buildLocalActivityRecords, loadHiddenRecentIds, loadLocalReminderItems, loadReminderPreferences, normalizeMedicationFallbacks, normalizeNotifications, router, token]);

  const cacheCurrentNotifications = useCallback(async (nextNotifications: NotificationItem[], nextStats = stats) => {
    await writeNotificationsCache({ notifications: nextNotifications, stats: nextStats, medicationFallbacks }, currentUser);
  }, [currentUser, medicationFallbacks, stats]);

  const hydrateLocalNotifications = useCallback(async (options: { force?: boolean; source?: string } = {}) => {
    if (localHydrationInFlightRef.current) return;
    localHydrationInFlightRef.current = true;
    const startedAt = perfNow();
    let didReadInbox = false;
    try {
      const session = await getCachedSession();
      const context = await captureAuthSessionContext(token || session?.token, session?.user ?? null);
      if ((token || session?.token) && !(await isAuthSessionContextCurrent(context))) return;
      const sessionUser = currentUserRef.current || session?.user || null;
      if (sessionUser && !currentUserRef.current) {
        currentUserRef.current = sessionUser;
        setCurrentUser(sessionUser);
      }
      const prefs = await loadReminderPreferences(sessionUser);
      await loadHiddenRecentIds(sessionUser);
      const cached = sessionUser ? await readNotificationsCache<any>(sessionUser) : null;
      if ((token || session?.token) && !(await isAuthSessionContextCurrent(context))) return;
      const owner = getCacheOwner(sessionUser);
      const ownerKey = String(owner.owner_id || owner.owner_email || token || 'unknown');
      const lastRead = lastLocalInboxReadRef.current.get(ownerKey);
      let localInbox = lastRead?.records || [];
      if (sessionUser && (options.force || !lastRead || Date.now() - lastRead.loadedAt > ACTIVITY_LOCAL_INBOX_READ_TTL_MS)) {
        const localInboxStartedAt = perfNow();
        localInbox = await readLocalNotificationInbox(owner);
        didReadInbox = true;
        lastLocalInboxReadRef.current.set(ownerKey, { loadedAt: Date.now(), records: localInbox });
        logPerf('Activity local inbox cache read', localInboxStartedAt, {
          count: localInbox.length,
          source: options.source || 'activity:local_hydration',
        });
      }
      const localActivity = await buildLocalActivityRecords(sessionUser);
      const localReminderItems = await loadLocalReminderItems(prefs);
      setNotifications(mergeNotificationRecords([...(cached?.notifications || []), ...localInbox, ...localActivity]));
      setStats(cached?.stats || null);
      setMedicationFallbacks(dedupeReminders([...localReminderItems, ...(cached?.medicationFallbacks || [])]));
      if (didReadInbox) {
        logPerf('Activity local inbox load', startedAt, {
          cacheHit: Boolean(cached),
          localInboxCount: localInbox.length,
          localActivityCount: localActivity.length,
          reminderCount: localReminderItems.length,
          source: options.source || 'activity:local_hydration',
        });
      }
    } finally {
      localHydrationInFlightRef.current = false;
    }
  }, [buildLocalActivityRecords, loadHiddenRecentIds, loadLocalReminderItems, loadReminderPreferences, token]);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      const run = async () => {
        await hydrateLocalNotifications({ source: 'activity:focus' });
        if (!mounted) return;
        await loadNotifications(false);
      };
      run();
      return () => {
        mounted = false;
        setSyncing(false);
      };
    }, [hydrateLocalNotifications, loadNotifications])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadNotifications(true);
    setRefreshing(false);
  }, [loadNotifications]);

  useEffect(() => {
    const refresh = (event?: { source?: string }) => {
      if (event?.source === 'cache') return;
      if (event?.source === 'reconciliation') return;
      if (localHydrationDebounceRef.current) clearTimeout(localHydrationDebounceRef.current);
      localHydrationDebounceRef.current = setTimeout(() => {
        hydrateLocalNotifications({ force: true, source: event?.source ? `activity:${event.source}` : 'activity:notification_event' }).catch(() => {});
      }, 250);
    };
    const notificationSub = DeviceEventEmitter.addListener(NOTIFICATIONS_UPDATED_EVENT, refresh);
    const reminderSub = DeviceEventEmitter.addListener(REMINDERS_RESCHEDULED_EVENT, refresh);
    return () => {
      notificationSub.remove();
      reminderSub.remove();
      if (localHydrationDebounceRef.current) clearTimeout(localHydrationDebounceRef.current);
    };
  }, [hydrateLocalNotifications]);

  const markOneRead = useCallback(async (item: NotificationItem) => {
    const openedAt = new Date().toISOString();
    const nextNotifications = notifications.map((current) => current.id === item.id ? { ...current, opened_at: openedAt, read_at: current.read_at || openedAt } : current);
    invalidateApiCacheGroup('notifications', token);
    setNotifications(nextNotifications);
    await cacheCurrentNotifications(nextNotifications);
    if (currentUser) await markLocalNotificationRead(getCacheOwner(currentUser), getNotificationIdentity(item));
    const backendId = backendNotificationId(item);
    if (!backendId) {
      setSelectedNotification(prev => (prev?.id === item.id ? { ...prev, opened_at: openedAt, read_at: prev.read_at || openedAt } : prev));
      return;
    }
    try {
      await put(`/notifications/${backendId}`, { opened_at: openedAt }, token);
      setSelectedNotification(prev => (prev?.id === item.id ? { ...prev, opened_at: openedAt } : prev));
      await loadNotifications();
    } catch (err) {
      if (isMissingBackendRoute(err)) {
        console.log('Notification read route unavailable; kept local update.');
        setInlineNotice('Marked read');
      } else if (isNetworkError(err)) {
        await enqueueSyncAction({ action_type: 'MARK_NOTIFICATION_READ', method: 'PUT', local_id: String(backendId), payload: { notification_id: backendId, opened_at: openedAt } });
        setOfflineMode(true);
        setInlineNotice('Will sync later');
      } else {
        setNoticeModal({ title: 'Could not update', message: getErrorMessage(err, 'Please try again.') });
      }
    }
  }, [cacheCurrentNotifications, currentUser, loadNotifications, notifications, token]);

  const completeNotification = useCallback(async (item: NotificationItem) => {
    const readAt = new Date().toISOString();
    const nextNotifications = notifications.map((current) => current.id === item.id ? { ...current, opened_at: current.opened_at || readAt, read_at: current.read_at || readAt } : current);
    invalidateApiCacheGroup('notifications', token);
    setNotifications(nextNotifications);
    setSelectedNotification(null);
    await cacheCurrentNotifications(nextNotifications);
    if (currentUser) await markLocalNotificationRead(getCacheOwner(currentUser), getNotificationIdentity(item));
    setInlineNotice('Marked read');

    if (item.type === 'medication') {
      router.push({ pathname: '/components/pages/medication/Medication', params: { token } } as any);
    } else if (item.type === 'hydration') {
      router.push({ pathname: '/components/pages/hydration/Hydration', params: { token } } as any);
    }
  }, [cacheCurrentNotifications, currentUser, notifications, router, token]);

  const snoozeNotification = useCallback(async (item: NotificationItem) => {
    const nextNotifications = notifications.map((current) => current.id === item.id ? { ...current, status: 'snoozed' as const } : current);
    invalidateApiCacheGroup('notifications', token);
    setNotifications(nextNotifications);
    setSelectedNotification(null);
    await cacheCurrentNotifications(nextNotifications);
    const backendId = backendNotificationId(item);
    if (!backendId) {
      setInlineNotice('Updated');
      return;
    }
    try {
      await post(`/notifications/${backendId}/snooze`, { minutes: 10 }, token);
      await loadNotifications();
    } catch (err) {
      if (isMissingBackendRoute(err)) {
        console.log('Notification snooze route unavailable; kept local update.');
        setInlineNotice('Updated');
      } else if (isNetworkError(err)) {
        await enqueueSyncAction({ action_type: 'SNOOZE_NOTIFICATION', method: 'POST', local_id: String(backendId), payload: { notification_id: backendId, minutes: 10 } });
        setOfflineMode(true);
        setInlineNotice('Will sync later');
      } else {
        setNoticeModal({ title: 'Could not update', message: getErrorMessage(err, 'Please try again.') });
      }
    }
  }, [cacheCurrentNotifications, loadNotifications, notifications, token]);

  const clearNotification = useCallback(async (item: NotificationItem) => {
    const backendId = backendNotificationId(item);
    if (backendId && (connection.isDeviceOffline || connection.backendReachable === false)) {
      setInlineNotice('Internet connection is required for this function.');
      return;
    }
    const nextHidden = new Set(hiddenRecentIds);
    nextHidden.add(String(item.id));
    setHiddenRecentIds(nextHidden);
    await persistHiddenRecentIds(currentUser, nextHidden);
    const now = new Date().toISOString();
    const nextNotifications = notifications.map((current) => current.id === item.id ? { ...current, status: 'cleared' as const, opened_at: current.opened_at || now, read_at: current.read_at || now, hidden_at: current.hidden_at || now, cleared_at: current.cleared_at || now, metadata: { ...(current.metadata || {}), recent_hidden: true } } : current);
    invalidateApiCacheGroup('notifications', token);
    setNotifications(nextNotifications);
    setSelectedNotification(null);
    await cacheCurrentNotifications(nextNotifications);
    if (currentUser) await markLocalNotificationCleared(getCacheOwner(currentUser), getNotificationIdentity(item));
    if (!backendId) {
      setInlineNotice('Cleared');
      return;
    }
    try {
      await del(`/notifications/${backendId}`, token);
      await loadNotifications();
    } catch (err) {
      if (isMissingBackendRoute(err)) {
        console.log('Notification clear route unavailable; kept local update.');
        setInlineNotice('Cleared');
      } else if (isNetworkError(err)) {
        setOfflineMode(true);
        setInlineNotice('Internet connection is required for this function.');
      } else {
        setNoticeModal({ title: 'Could not update', message: getErrorMessage(err, 'Please try again.') });
      }
    }
  }, [cacheCurrentNotifications, connection.backendReachable, connection.isDeviceOffline, currentUser, hiddenRecentIds, loadNotifications, notifications, persistHiddenRecentIds, token]);

  const markAllRead = useCallback(async () => {
    const readAt = new Date().toISOString();
    const targets = notifications
      .filter((item) => !isHiddenRecent(item, hiddenRecentIds))
      .filter(hasHappenedOrWasActioned)
      .filter((item) => filter === 'unread' ? isUnread(item) : filter === 'medication' || filter === 'hydration' ? item.type === filter : true);
    const targetIds = new Set(targets.map((item) => String(item.id)));
    const nextNotifications = notifications.map((item) => (
      !targetIds.has(String(item.id))
        ? item
        : { ...item, opened_at: item.opened_at || readAt, read_at: item.read_at || readAt }
    ));
    invalidateApiCacheGroup('notifications', token);
    setNotifications(nextNotifications);
    await cacheCurrentNotifications(nextNotifications);
    if (currentUser) {
      await Promise.all(notifications
        .filter((item) => targetIds.has(String(item.id)) && !isLocalActivity(item))
        .map((item) => markLocalNotificationRead(getCacheOwner(currentUser), getNotificationIdentity(item))));
    }
    setInlineNotice('Marked read');
  }, [cacheCurrentNotifications, currentUser, filter, hiddenRecentIds, notifications, token]);

  const clearRecent = useCallback(async () => {
    const targets = notifications
      .filter((item) => !isHiddenRecent(item, hiddenRecentIds))
      .filter(hasHappenedOrWasActioned)
      .filter((item) => filter === 'unread' ? isUnread(item) : filter === 'medication' || filter === 'hydration' ? item.type === filter : true);
    const hasBackendTargets = targets.some((item) => Boolean(backendNotificationId(item)));
    if ((connection.isDeviceOffline || connection.backendReachable === false) && hasBackendTargets) {
      setInlineNotice('Internet connection is required for this function.');
      return;
    }
    const nextHidden = new Set(hiddenRecentIds);
    targets.forEach((item) => nextHidden.add(String(item.id)));
    const targetIds = new Set(targets.map((item) => String(item.id)));
    const readAt = new Date().toISOString();
    const nextNotifications = notifications.map((item) => (
      nextHidden.has(String(item.id))
        ? { ...item, status: 'cleared' as const, opened_at: item.opened_at || readAt, read_at: item.read_at || readAt, hidden_at: item.hidden_at || readAt, cleared_at: item.cleared_at || readAt, metadata: { ...(item.metadata || {}), recent_hidden: true } }
        : item
    ));
    invalidateApiCacheGroup('notifications', token);
    setHiddenRecentIds(nextHidden);
    setNotifications(nextNotifications);
    await persistHiddenRecentIds(currentUser, nextHidden);
    await cacheCurrentNotifications(nextNotifications);
    if (currentUser) {
      await Promise.all(notifications
        .filter((item) => targetIds.has(String(item.id)) && !isLocalActivity(item))
        .map((item) => markLocalNotificationCleared(getCacheOwner(currentUser), getNotificationIdentity(item))));
    }
    setShowAllRecent(false);
    setInlineNotice('Recent hidden');
  }, [cacheCurrentNotifications, connection.backendReachable, connection.isDeviceOffline, currentUser, filter, hiddenRecentIds, notifications, persistHiddenRecentIds, token]);

  const upcomingReminders = useMemo<ReminderItem[]>(() => {
    const today = new Date();
    const notificationReminders = notifications
      .filter(item => isScheduledStatus(item.status))
      .filter(item => isSameLocalDay(item.scheduled_at || item.scheduled_time || item.created_at, today))
      .filter(item => getSafeTime(item.scheduled_at || item.scheduled_time || item.created_at) > Date.now())
      .map(item => ({
        id: `notification-${item.id}`,
        type: item.type,
        title: item.title,
        message: item.message,
        time: item.scheduled_at || item.scheduled_time || item.created_at || '',
        status: item.status,
        notification: item,
      }));

    return dedupeReminders([...notificationReminders, ...medicationFallbacks]);
  }, [medicationFallbacks, notifications]);

  const visibleNotifications = useMemo(
    () => notifications.filter((item) => !isHiddenRecent(item, hiddenRecentIds)),
    [hiddenRecentIds, notifications]
  );

  const recentNotifications = useMemo(
    () => visibleNotifications.filter(hasHappenedOrWasActioned),
    [visibleNotifications]
  );

  const unreadRecords = useMemo(
    () => recentNotifications.filter(isUnread),
    [recentNotifications]
  );

  const scheduledTodayRecords = useMemo(() => {
    const today = new Date();
    const completedMedicationDoseKeys = new Set(
      notifications
        .filter((item) => item.type === 'medication' && item.status === 'completed')
        .map(getMedicationDoseGroupKey)
        .filter(Boolean)
    );
    const respondedHydrationHours = new Set(
      notifications
        .filter((item) => item.type === 'hydration' && item.status === 'completed')
        .map((item) => String(item.metadata?.hydrationSlotKey || item.metadata?.hydration_slot_key || getLocalHourKey(item.created_at || item.scheduled_at || item.scheduled_time)))
        .filter(Boolean)
    );
    const records = notifications
      .filter((item) => !isNotificationRecordHidden(item as any))
      .filter((item) => !isLocalActivity(item))
      .filter((item) => item.type === 'hydration' || item.type === 'medication')
      .filter((item) => ['scheduled', 'upcoming', 'delivered'].includes(item.status))
      .filter((item) => isSameLocalDay(item.type === 'medication' ? getMedicationBaseDoseTime(item) : item.scheduled_at || item.scheduled_time || item.created_at, today))
      .filter((item) => item.type !== 'medication' || !completedMedicationDoseKeys.has(getMedicationDoseGroupKey(item)))
      .filter((item) => {
        if (item.type !== 'hydration') return true;
        const hourKey = String(item.metadata?.hydrationSlotKey || item.metadata?.hydration_slot_key || getLocalHourKey(item.scheduled_at || item.scheduled_time || item.created_at));
        return !respondedHydrationHours.has(hourKey);
      });
    return groupScheduledTodayRecords(mergeNotificationRecords(records));
  }, [notifications]);

  const alertRecords = useMemo(
    () => mergeNotificationRecords(recentNotifications.filter((item) => !isLocalActivity(item) && isAlertStatus(item.status))),
    [recentNotifications]
  );

  const filteredNotifications = useMemo(() => {
    const sorted = [...recentNotifications].sort(
      (a, b) => getSafeTime(b.scheduled_at || b.scheduled_time || b.created_at) - getSafeTime(a.scheduled_at || a.scheduled_time || a.created_at)
    );
    if (filter === 'unread') return sorted.filter(isUnread);
    if (filter === 'medication' || filter === 'hydration') return sorted.filter(item => item.type === filter);
    return sorted;
  }, [filter, recentNotifications]);

  useEffect(() => {
    setRecentRenderLimit(RECENT_NOTIFICATION_PAGE_SIZE);
  }, [filter]);

  const displayedNotifications = useMemo(() => (
    showAllRecent ? filteredNotifications.slice(0, recentRenderLimit) : filteredNotifications.slice(0, 5)
  ), [filteredNotifications, recentRenderLimit, showAllRecent]);

  const hasMoreRecent = showAllRecent ? filteredNotifications.length > displayedNotifications.length : filteredNotifications.length > 5;
  const nextReminder = useMemo<ReminderItem | null>(() => {
    const now = Date.now();
    const actionable = scheduledTodayRecords
      .map((item): ReminderItem | null => {
        const triggerTime = item.type === 'medication'
          ? item.metadata?.nextTriggerAt || item.metadata?.next_trigger_at || item.scheduled_at || item.scheduled_time || item.created_at
          : item.scheduled_at || item.scheduled_time || item.created_at;
        if (getSafeTime(triggerTime) <= now) return null;
        return {
          id: String(item.id),
          type: item.type,
          title: item.type === 'medication'
            ? String(item.title || 'Medication reminder').replace(/^Take\s+/i, '')
            : item.title,
          message: item.type === 'medication'
            ? `Dose at ${formatSafeTime(item.scheduled_at || item.scheduled_time || item.created_at)}`
            : item.message,
          time: String(triggerTime || ''),
          status: item.status,
          notification: item,
        };
      })
      .filter((item): item is ReminderItem => item !== null)
      .sort((a, b) => getSafeTime(a.time) - getSafeTime(b.time));
    return actionable[0] || upcomingReminders[0] || null;
  }, [scheduledTodayRecords, upcomingReminders]);

  const counters = useMemo(() => {
    void stats;
    return [
      { key: 'unread' as const, label: 'Unread', value: unreadRecords.length, color: '#2563EB', icon: 'mail-unread-outline' as const },
      { key: 'scheduled' as const, label: 'Scheduled Today', value: scheduledTodayRecords.length, color: '#2563EB', icon: 'time-outline' as const },
      { key: 'alerts' as const, label: 'Alerts', value: alertRecords.length, color: '#DC2626', icon: 'alert-circle-outline' as const },
    ];
  }, [alertRecords.length, scheduledTodayRecords.length, stats, unreadRecords.length]);
  const topSystemNotice = !inlineNotice && !selectedNotification && !noticeModal
    ? deriveTopNotice({
      isDeviceOffline: connection.isDeviceOffline,
      backendReachable: connection.backendReachable,
      syncing,
      pendingCount: pendingSyncCount,
    })
    : null;

  const renderNotificationCard = (item: NotificationItem) => {
    const tone = getTone(item);
    const when = item.scheduled_at || item.scheduled_time || item.created_at;
    return (
      <TouchableOpacity
        key={item.id}
        activeOpacity={0.84}
        style={[styles.notificationCard, isUnread(item) && styles.unreadCard, { borderLeftColor: tone.color }]}
        onPress={() => !isLocalActivity(item) && setSelectedNotification(item)}
      >
        <View style={[styles.iconBubble, { backgroundColor: tone.bg, borderColor: tone.border }]}>
          <Ionicons name={tone.icon} size={19} color={tone.color} />
        </View>
        <View style={styles.cardBody}>
          <View style={styles.cardTopRow}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
            {isUnread(item) ? <View style={styles.unreadDot} /> : null}
          </View>
          <Text style={styles.cardMessage} numberOfLines={2}>{item.message || 'Notification record'}</Text>
          <View style={styles.metaRow}>
            <View style={[styles.statusPill, { backgroundColor: tone.bg, borderColor: tone.border }]}>
              <Text style={[styles.statusText, { color: tone.color }]} maxFontSizeMultiplier={FONT_SCALE.chip}>{tone.label}</Text>
            </View>
            <Text style={styles.cardTime}>{formatMeta(when)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const openReminderTarget = (item: ReminderItem | null) => {
    if (!item) return;
    if (item.type === 'medication') {
      router.push({ pathname: '/components/pages/medication/Medication', params: { token } } as any);
    } else if (item.type === 'hydration') {
      router.push({ pathname: '/components/pages/hydration/Hydration', params: { token } } as any);
    } else {
      setShowAllRecent(true);
    }
  };

  const openCounterList = (key: CounterKey) => {
    if (key === 'unread') {
      setFilter('unread');
      setShowAllRecent(true);
      setRecordListModal({ title: 'Unread Notifications', records: unreadRecords });
      return;
    }
    if (key === 'scheduled') {
      setRecordListModal({ title: 'Scheduled Today', records: scheduledTodayRecords });
      return;
    }
    setRecordListModal({ title: 'Alerts', records: alertRecords });
  };

  const renderNextReminder = () => {
    if (!nextReminder) {
      return (
        <View style={styles.nextReminderCard}>
          <View style={styles.nextReminderIcon}>
            <Ionicons name="checkmark-circle-outline" size={20} color="#059669" />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.nextReminderLabel}>Next Reminder</Text>
            <Text style={styles.nextReminderTitle}>You&apos;re all set for now.</Text>
            <Text style={styles.cardMessage}>No upcoming reminders today.</Text>
          </View>
        </View>
      );
    }
    const tone = getTone(nextReminder);
    return (
      <TouchableOpacity style={styles.nextReminderCard} activeOpacity={0.84} onPress={() => openReminderTarget(nextReminder)}>
        <View style={[styles.nextReminderIcon, { backgroundColor: tone.bg, borderColor: tone.border }]}>
          <Ionicons name={tone.icon} size={20} color={tone.color} />
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.nextReminderLabel}>Next Reminder</Text>
          <Text style={styles.nextReminderTitle} numberOfLines={1}>
            {nextReminder.type === 'medication' ? 'Medication' : nextReminder.type === 'hydration' ? 'Hydration' : 'Alert'} | {formatSafeTime(nextReminder.time)}
          </Text>
          <Text style={styles.cardMessage} numberOfLines={2}>{nextReminder.title} - {nextReminder.message}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#2563EB" />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]}>
        <View style={styles.headerCopy}>
          <Text style={styles.title} maxFontSizeMultiplier={FONT_SCALE.title}>Notifications</Text>
          <Text style={styles.subtitle} maxFontSizeMultiplier={FONT_SCALE.description}>Reminders and alerts that need your attention.</Text>
        </View>
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => router.push({ pathname: '/components/pages/profile/NotificationSettings', params: { token } } as any)}
          activeOpacity={0.82}
        >
          <Ionicons name="settings-outline" size={20} color="#2563EB" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.counterRow}>
          {counters.map(counter => (
            <TouchableOpacity
              key={counter.key}
              style={styles.counterCard}
              activeOpacity={0.84}
              accessibilityRole="button"
              onPress={() => openCounterList(counter.key)}
            >
              <View style={styles.counterTopRow}>
                <View style={[styles.counterIcon, { backgroundColor: `${counter.color}14` }]}>
                  <Ionicons name={counter.icon} size={15} color={counter.color} />
                </View>
                <Text style={[styles.counterValue, { color: counter.color }]} maxFontSizeMultiplier={FONT_SCALE.stat} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{counter.value}</Text>
                <Ionicons name="chevron-forward" size={13} color="#94A3B8" />
              </View>
              <Text style={styles.counterLabel} maxFontSizeMultiplier={FONT_SCALE.chip}>{counter.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {renderNextReminder()}

        {error && !(offlineMode && error === 'Offline mode') ? (
          <View style={styles.noticeBox}>
            <Ionicons name="cloud-offline-outline" size={18} color="#B45309" />
            <Text style={styles.noticeText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.inboxHeader}>
          <View>
            <Text style={[styles.sectionTitle, styles.inboxTitle]}>Recent Notifications</Text>
            <Text style={styles.sectionSubtitle}>
              {filteredNotifications.length > 0
                ? `Showing ${Math.min(displayedNotifications.length, filteredNotifications.length)} of ${filteredNotifications.length} recent records.`
                : 'No recent notifications.'}
            </Text>
          </View>
        </View>
        <View style={styles.recentActionRow}>
          <TouchableOpacity style={styles.smallActionButton} onPress={markAllRead} activeOpacity={0.82} disabled={filteredNotifications.length === 0}>
            <Ionicons name="mail-open-outline" size={15} color="#2563EB" />
            <Text style={styles.smallActionText}>Mark all read</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.smallActionButton, styles.clearRecentButton]} onPress={clearRecent} activeOpacity={0.82} disabled={filteredNotifications.length === 0}>
            <Ionicons name="archive-outline" size={15} color="#DC2626" />
            <Text style={[styles.smallActionText, styles.clearRecentText]}>Clear recent</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.filterRow}>
          {[
            { key: 'all', label: 'All' },
            { key: 'unread', label: 'Unread' },
            { key: 'medication', label: 'Medication' },
            { key: 'hydration', label: 'Beverage' },
          ].map(item => (
            <TouchableOpacity
              key={item.key}
              style={[styles.filterChip, filter === item.key && styles.filterChipActive]}
              onPress={() => setFilter(item.key as InboxFilter)}
            >
              <Text style={[styles.filterText, filter === item.key && styles.filterTextActive]} maxFontSizeMultiplier={FONT_SCALE.chip} numberOfLines={1}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {displayedNotifications.length === 0 ? (
          <View style={styles.emptyInbox}>
            <Ionicons name="notifications-off-outline" size={32} color="#94A3B8" />
            <Text style={styles.emptyTitle}>
              {filter === 'unread'
                ? 'No unread notifications.'
                : filter === 'medication'
                  ? 'No recent medication notifications.'
                  : filter === 'hydration'
                    ? 'No recent beverage notifications.'
                    : 'No recent notifications.'}
            </Text>
            <Text style={styles.emptyText}>Delivered reminders and recent activity will appear here.</Text>
          </View>
        ) : (
          <>
            <FlatList
              data={displayedNotifications}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => renderNotificationCard(item)}
              scrollEnabled={false}
              initialNumToRender={Math.min(RECENT_NOTIFICATION_PAGE_SIZE, displayedNotifications.length)}
              maxToRenderPerBatch={RECENT_NOTIFICATION_PAGE_SIZE}
              windowSize={5}
            />
            {hasMoreRecent ? (
              <TouchableOpacity
                style={styles.viewAllButton}
                onPress={() => {
                  if (!showAllRecent) {
                    setShowAllRecent(true);
                    setRecentRenderLimit(RECENT_NOTIFICATION_PAGE_SIZE);
                    return;
                  }
                  setRecentRenderLimit((value) => Math.min(value + RECENT_NOTIFICATION_PAGE_SIZE, filteredNotifications.length));
                }}
                activeOpacity={0.82}
              >
                <Text style={styles.viewAllText}>{showAllRecent ? 'View more' : 'View all'}</Text>
                <Ionicons name="chevron-down" size={16} color="#2563EB" />
              </TouchableOpacity>
            ) : null}
            {showAllRecent ? (
              <TouchableOpacity style={styles.viewAllButton} onPress={() => setShowAllRecent(false)} activeOpacity={0.82}>
                <Text style={styles.viewAllText}>Show less</Text>
                <Ionicons name="chevron-up" size={16} color="#2563EB" />
              </TouchableOpacity>
            ) : null}
          </>
        )}

        <Text style={styles.deliveryText}>Notification delivery depends on device permissions and system settings.</Text>
      </ScrollView>

      <Modal visible={Boolean(recordListModal)} transparent animationType="fade" onRequestClose={() => setRecordListModal(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.detailModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{recordListModal?.title || ''}</Text>
              <TouchableOpacity style={styles.modalClose} onPress={() => setRecordListModal(null)} accessibilityRole="button">
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            {recordListModal?.records?.length ? (
              <ScrollView style={styles.recordList} contentContainerStyle={styles.recordListContent}>
                {recordListModal.records.map((item) => {
                  const tone = getTone(item);
                  const when = item.scheduled_at || item.scheduled_time || item.created_at;
                  return (
                    <TouchableOpacity
                      key={`${recordListModal.title}:${item.id}`}
                      style={styles.recordListRow}
                      activeOpacity={0.84}
                      onPress={() => {
                        setRecordListModal(null);
                        if (!isLocalActivity(item)) setSelectedNotification(item);
                      }}
                    >
                      <View style={[styles.iconBubble, { backgroundColor: tone.bg, borderColor: tone.border }]}>
                        <Ionicons name={tone.icon} size={18} color={tone.color} />
                      </View>
                      <View style={styles.cardBody}>
                        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                        <Text style={styles.cardMessage} numberOfLines={2}>{item.message || 'Notification record'}</Text>
                        <Text style={styles.cardTime}>{formatSafeTime(when)} | {item.status.replace(/_/g, ' ')}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={styles.emptyBox}>
                <Ionicons name="checkmark-circle-outline" size={28} color="#94A3B8" />
                <Text style={styles.emptyTitle}>{recordListModal?.title === 'Alerts' ? 'No alerts' : 'No records'}</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(selectedNotification)} transparent animationType="fade" onRequestClose={() => setSelectedNotification(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.detailModal}>
            {selectedNotification ? (
              <>
                {(() => {
                  const tone = getTone(selectedNotification);
                  const when = selectedNotification.scheduled_at || selectedNotification.scheduled_time || selectedNotification.created_at;
                  const localOnly = isLocalActivity(selectedNotification);
                  const canSnooze = !localOnly && isScheduledStatus(selectedNotification.status);
                  const canComplete = !localOnly && selectedNotification.type !== 'general' && selectedNotification.status !== 'completed' && selectedNotification.status !== 'cleared';
                  return (
                    <>
                      <View style={styles.modalHeader}>
                        <View style={[styles.modalIcon, { backgroundColor: tone.bg, borderColor: tone.border }]}>
                          <Ionicons name={tone.icon} size={22} color={tone.color} />
                        </View>
                        <TouchableOpacity style={styles.modalClose} onPress={() => setSelectedNotification(null)}>
                          <Ionicons name="close" size={20} color="#64748B" />
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.modalTitle}>{selectedNotification.title}</Text>
                      <Text style={styles.modalMessage}>{selectedNotification.message || 'Notification record'}</Text>
                      <View style={styles.badgeRow}>
                        <View style={[styles.statusPill, { backgroundColor: tone.bg, borderColor: tone.border }]}>
                          <Text style={[styles.statusText, { color: tone.color }]}>{tone.label}</Text>
                        </View>
                        <View style={styles.typePill}>
                          <Text style={styles.typePillText}>{selectedNotification.type === 'hydration' ? 'beverage' : selectedNotification.type}</Text>
                        </View>
                      </View>
                      <Text style={styles.modalMeta}>{formatMeta(when)}</Text>
                      <View style={styles.modalActions}>
                        {isUnread(selectedNotification) && !localOnly ? (
                          <TouchableOpacity style={styles.modalActionButton} onPress={() => markOneRead(selectedNotification)}>
                            <Ionicons name="mail-open-outline" size={17} color="#2563EB" />
                            <Text style={styles.modalActionText}>Mark read</Text>
                          </TouchableOpacity>
                        ) : null}
                        {canComplete ? (
                          <TouchableOpacity style={styles.modalActionButton} onPress={() => completeNotification(selectedNotification)}>
                            <Ionicons name="checkmark-circle" size={17} color="#059669" />
                            <Text style={styles.modalActionText}>Complete</Text>
                          </TouchableOpacity>
                        ) : null}
                        {canSnooze ? (
                          <TouchableOpacity style={styles.modalActionButton} onPress={() => snoozeNotification(selectedNotification)}>
                            <Ionicons name="time-outline" size={17} color="#D97706" />
                            <Text style={styles.modalActionText}>Snooze</Text>
                          </TouchableOpacity>
                        ) : null}
                        {!localOnly ? (
                          <TouchableOpacity style={styles.modalActionButton} onPress={() => clearNotification(selectedNotification)}>
                            <Ionicons name="trash-outline" size={17} color="#DC2626" />
                            <Text style={styles.modalActionText}>Clear</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </>
                  );
                })()}
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <ThemedNoticeModal
        visible={Boolean(noticeModal)}
        type="error"
        title={noticeModal?.title || ''}
        message={noticeModal?.message || ''}
        primaryText="Done"
        onPrimary={() => setNoticeModal(null)}
        onClose={() => setNoticeModal(null)}
      />
      <InlineSyncNotice
        visible={Boolean(topSystemNotice)}
        message={topSystemNotice?.message || ''}
        iconName={topSystemNotice?.iconName || 'sync-outline'}
        variant={topSystemNotice?.variant}
        top={Math.max(insets.top, 8) + 54}
      />
      <InlineNotice
        visible={Boolean(inlineNotice) && !selectedNotification && !noticeModal}
        message={inlineNotice || ''}
        top={Math.max(insets.top, 8) + 54}
      />

      <BottomNavigation currentRoute="notification" />
    </SafeAreaView>
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
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 10,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  headerCopy: {
    flex: 1,
    paddingRight: 12,
  },
  title: {
    color: '#0F172A',
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '800',
  },
  subtitle: {
    color: '#64748B',
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  settingsButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 112,
  },
  counterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 14,
    padding: 10,
    marginBottom: 10,
  },
  offlineBannerText: {
    flex: 1,
    color: '#1E3A8A',
    fontSize: 12,
    fontWeight: '800',
  },
  counterCard: {
    flex: 1,
    minWidth: 76,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 9,
    paddingVertical: 8,
    gap: 3,
  },
  counterTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  counterIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterValue: {
    fontSize: 17,
    fontWeight: '900',
    flexShrink: 1,
  },
  counterLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '800',
  },
  nextReminderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    padding: 12,
    marginBottom: 12,
  },
  nextReminderIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextReminderLabel: {
    color: '#2563EB',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  nextReminderTitle: {
    color: '#0F172A',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
    marginTop: 1,
  },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
    marginTop: 14,
    marginBottom: 7,
  },
  sectionSubtitle: {
    color: '#64748B',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    marginTop: 2,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 8,
    marginBottom: 6,
  },
  inboxHeader: {
    marginTop: 4,
    marginBottom: 8,
  },
  inboxTitle: {
    marginTop: 0,
    marginBottom: 4,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  recentActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  smallActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  smallActionText: {
    color: '#2563EB',
    fontSize: 11,
    fontWeight: '900',
  },
  clearRecentButton: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  clearRecentText: {
    color: '#DC2626',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    minHeight: 34,
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  filterText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '900',
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
    padding: 10,
    marginBottom: 10,
  },
  noticeText: {
    flex: 1,
    color: '#92400E',
    fontSize: 12,
    fontWeight: '700',
  },
  notificationCard: {
    flexDirection: 'row',
    gap: 10,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
  },
  unreadCard: {
    backgroundColor: '#F8FAFF',
    borderColor: '#BFDBFE',
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 9,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  iconBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    color: '#0F172A',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
  },
  cardMessage: {
    color: '#475569',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    marginTop: 2,
  },
  cardTime: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
  },
  reminderTime: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '900',
  },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#2563EB',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '900',
  },
  groupTitle: {
    color: '#64748B',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    marginTop: 10,
    marginBottom: 7,
    textTransform: 'uppercase',
  },
  viewAllButton: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginTop: 2,
    marginBottom: 6,
  },
  viewAllText: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '900',
  },
  loadingBox: {
    minHeight: 92,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '800',
  },
  emptyBox: {
    alignItems: 'center',
    padding: 16,
    gap: 7,
  },
  emptyInbox: {
    alignItems: 'center',
    gap: 7,
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
  },
  emptyTitle: {
    color: '#0F172A',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptyText: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  controlButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingVertical: 10,
  },
  controlText: {
    color: '#1F2937',
    fontSize: 13,
    fontWeight: '900',
  },
  helperText: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    marginTop: 8,
  },
  deliveryText: {
    color: '#64748B',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 12,
    marginBottom: 4,
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
    maxHeight: '82%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordList: {
    marginTop: 12,
    maxHeight: 420,
  },
  recordListContent: {
    gap: 8,
    paddingBottom: 4,
  },
  recordListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 10,
  },
  modalClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  modalTitle: {
    color: '#0F172A',
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '900',
    marginTop: 10,
  },
  modalMessage: {
    color: '#334155',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  typePill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
  },
  typePillText: {
    color: '#2563EB',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  modalMeta: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 12,
  },
  modalActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  modalActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
  },
  modalActionText: {
    color: '#1F2937',
    fontSize: 13,
    fontWeight: '900',
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
