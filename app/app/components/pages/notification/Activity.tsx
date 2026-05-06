import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { del, get, isAuthError, isNetworkError, post, put } from '../../../api';
import { getCachedSession, readNotificationsCache, writeNotificationsCache } from '../../../../services/offlineStorage';
import { enqueueSyncAction, processSyncQueue } from '../../../../services/syncQueue';
import BottomNavigation from '../../navigation/BottomNavigation';
import ThemedNoticeModal from '../../common/ThemedNoticeModal';
import InlineNotice from '../../common/InlineNotice';
import InlineSyncNotice from '../../common/InlineSyncNotice';

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

interface NotificationItem {
  id: number | string;
  type: NotificationType;
  title: string;
  message: string;
  status: NotificationStatus;
  scheduled_at?: string | null;
  scheduled_time?: string | null;
  created_at?: string | null;
  opened_at?: string | null;
  read_at?: string | null;
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

const formatMeta = (value?: string | null) => {
  const date = parseSafeDate(value);
  if (!date) return 'Unknown time';
  return `${date.toLocaleDateString()} | ${formatSafeTime(value)}`;
};

const getErrorMessage = (error: any, fallback: string) => {
  const message = error?.data?.message || error?.message || error?.data;
  return typeof message === 'string' && message.trim() ? message : fallback;
};

const isUnread = (item: NotificationItem) => !item.opened_at && !item.read_at;
const isAlertStatus = (status: NotificationStatus) =>
  status === 'missed' || status === 'skipped' || status === 'failed' || status === 'needs_attention';
const isScheduledStatus = (status: NotificationStatus) => status === 'scheduled' || status === 'upcoming';

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
    return { color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', label: 'Hydration', icon: 'water-outline' as const };
  }
  if (item.type === 'medication') {
    return { color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', label: 'Medication', icon: 'medical-outline' as const };
  }
  return { color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', label: 'Reminder', icon: 'notifications-outline' as const };
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNotification, setSelectedNotification] = useState<NotificationItem | null>(null);
  const [noticeModal, setNoticeModal] = useState<{ title: string; message: string } | null>(null);
  const [offlineMode, setOfflineMode] = useState(false);
  const [inlineNotice, setInlineNotice] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    if (!inlineNotice) return;
    const timer = setTimeout(() => setInlineNotice(null), 2400);
    return () => clearTimeout(timer);
  }, [inlineNotice]);

  useEffect(() => {
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
        opened_at: raw?.opened_at ?? raw?.read_at ?? null,
        read_at: raw?.read_at ?? null,
        metadata: raw?.metadata ?? raw?.data ?? null,
      }))
      .filter((item: NotificationItem) => item.status !== 'cleared');
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

  const loadNotifications = useCallback(async () => {
    if (!token) return;
    setSyncing(true);
    try {
      const session = await getCachedSession();
      const sessionUser = currentUser || session?.user || null;
      if (sessionUser && !currentUser) setCurrentUser(sessionUser);
      await processSyncQueue(token);
      const [notificationRes, statsRes, medicationRes] = await Promise.all([
        get('/notifications', token, 5000),
        get('/notifications/stats', token, 5000).catch(() => null),
        get('/medications/upcoming', token, 5000).catch(() => []),
      ]);
      const normalized = normalizeNotifications(notificationRes);
      const fallback = normalizeMedicationFallbacks(medicationRes);
      setNotifications(normalized);
      setStats(statsRes || null);
      setMedicationFallbacks(fallback);
      await writeNotificationsCache({ notifications: normalized, stats: statsRes || null, medicationFallbacks: fallback }, sessionUser);
      setError(null);
      setOfflineMode(false);
    } catch (err) {
      if (isAuthError(err)) {
        router.replace('/login');
        return;
      }
      if (isNetworkError(err)) {
        setOfflineMode(true);
        setError('Offline mode - changes will sync when connected.');
        const cached = await readNotificationsCache<any>(currentUser);
        if (cached) {
          setNotifications(cached.notifications || []);
          setStats(cached.stats || null);
          setMedicationFallbacks(cached.medicationFallbacks || []);
        }
        return;
      }
      setError(getErrorMessage(err, 'Could not load notifications from the backend.'));
    } finally {
      setSyncing(false);
    }
  }, [currentUser, normalizeMedicationFallbacks, normalizeNotifications, router, token]);

  const cacheCurrentNotifications = useCallback(async (nextNotifications: NotificationItem[], nextStats = stats) => {
    await writeNotificationsCache({ notifications: nextNotifications, stats: nextStats, medicationFallbacks }, currentUser);
  }, [currentUser, medicationFallbacks, stats]);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      const run = async () => {
        const session = await getCachedSession();
        const sessionUser = currentUser || session?.user || null;
        if (sessionUser && mounted) setCurrentUser(sessionUser);
        const cached = sessionUser ? await readNotificationsCache<any>(sessionUser) : null;
        if (!mounted) return;
        setNotifications(cached?.notifications || []);
        setStats(cached?.stats || null);
        setMedicationFallbacks(cached?.medicationFallbacks || []);
        await loadNotifications();
        if (mounted) setLoading(false);
      };
      run();
      return () => {
        mounted = false;
        setSyncing(false);
      };
    }, [currentUser, loadNotifications])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  }, [loadNotifications]);

  const markOneRead = useCallback(async (item: NotificationItem) => {
    const openedAt = new Date().toISOString();
    const nextNotifications = notifications.map((current) => current.id === item.id ? { ...current, opened_at: openedAt, read_at: current.read_at || openedAt } : current);
    setNotifications(nextNotifications);
    await cacheCurrentNotifications(nextNotifications);
    try {
      await put(`/notifications/${item.id}`, { opened_at: openedAt }, token);
      setSelectedNotification(prev => (prev?.id === item.id ? { ...prev, opened_at: openedAt } : prev));
      await loadNotifications();
    } catch (err) {
      if (isNetworkError(err)) {
        await enqueueSyncAction({ action_type: 'MARK_NOTIFICATION_READ', method: 'PUT', local_id: String(item.id), payload: { notification_id: item.id, opened_at: openedAt } });
        setOfflineMode(true);
        setInlineNotice('Saved offline. Will sync when connected.');
      } else {
        setNoticeModal({ title: 'Could not mark read', message: getErrorMessage(err, 'Please try again.') });
      }
    }
  }, [cacheCurrentNotifications, loadNotifications, notifications, token]);

  const completeNotification = useCallback(async (item: NotificationItem) => {
    const nextNotifications = notifications.map((current) => current.id === item.id ? { ...current, status: 'completed' as const } : current);
    setNotifications(nextNotifications);
    setSelectedNotification(null);
    await cacheCurrentNotifications(nextNotifications);
    try {
      await post(`/notifications/${item.id}/complete`, {}, token);
      await loadNotifications();
    } catch (err) {
      if (isNetworkError(err)) {
        await enqueueSyncAction({ action_type: 'COMPLETE_NOTIFICATION', method: 'POST', local_id: String(item.id), payload: { notification_id: item.id } });
        setOfflineMode(true);
        setInlineNotice('Saved offline. Will sync when connected.');
      } else {
        setNoticeModal({ title: 'Could not complete', message: getErrorMessage(err, 'Please try again.') });
      }
    }
  }, [cacheCurrentNotifications, loadNotifications, notifications, token]);

  const snoozeNotification = useCallback(async (item: NotificationItem) => {
    const nextNotifications = notifications.map((current) => current.id === item.id ? { ...current, status: 'snoozed' as const } : current);
    setNotifications(nextNotifications);
    setSelectedNotification(null);
    await cacheCurrentNotifications(nextNotifications);
    try {
      await post(`/notifications/${item.id}/snooze`, { minutes: 10 }, token);
      await loadNotifications();
    } catch (err) {
      if (isNetworkError(err)) {
        await enqueueSyncAction({ action_type: 'SNOOZE_NOTIFICATION', method: 'POST', local_id: String(item.id), payload: { notification_id: item.id, minutes: 10 } });
        setOfflineMode(true);
        setInlineNotice('Saved offline. Will sync when connected.');
      } else {
        setNoticeModal({ title: 'Could not snooze', message: getErrorMessage(err, 'Please try again.') });
      }
    }
  }, [cacheCurrentNotifications, loadNotifications, notifications, token]);

  const clearNotification = useCallback(async (item: NotificationItem) => {
    const nextNotifications = notifications.filter((current) => current.id !== item.id);
    setNotifications(nextNotifications);
    setSelectedNotification(null);
    await cacheCurrentNotifications(nextNotifications);
    try {
      await del(`/notifications/${item.id}`, token);
      await loadNotifications();
    } catch (err) {
      if (isNetworkError(err)) {
        await enqueueSyncAction({ action_type: 'CLEAR_NOTIFICATION', method: 'DELETE', local_id: String(item.id), payload: { notification_id: item.id } });
        setOfflineMode(true);
        setInlineNotice('Saved offline. Will sync when connected.');
      } else {
        setNoticeModal({ title: 'Could not clear', message: getErrorMessage(err, 'Please try again.') });
      }
    }
  }, [cacheCurrentNotifications, loadNotifications, notifications, token]);

  const alertNotifications = useMemo(
    () => notifications.filter(item => isAlertStatus(item.status) || (isUnread(item) && isAlertStatus(item.status))),
    [notifications]
  );

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

    const seen = new Set<string>();
    return [...notificationReminders, ...medicationFallbacks]
      .sort((a, b) => getSafeTime(a.time) - getSafeTime(b.time))
      .filter(item => {
        const key = `${item.type}-${item.title}-${formatSafeTime(item.time)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 8);
  }, [medicationFallbacks, notifications]);

  const filteredNotifications = useMemo(() => {
    const sorted = [...notifications].sort(
      (a, b) => getSafeTime(b.scheduled_at || b.scheduled_time || b.created_at) - getSafeTime(a.scheduled_at || a.scheduled_time || a.created_at)
    );
    if (filter === 'unread') return sorted.filter(isUnread);
    if (filter === 'medication' || filter === 'hydration') return sorted.filter(item => item.type === filter);
    return sorted;
  }, [filter, notifications]);

  const todayNotifications = filteredNotifications.filter(item => isSameLocalDay(item.scheduled_at || item.scheduled_time || item.created_at, new Date()));
  const earlierNotifications = filteredNotifications.filter(item => !isSameLocalDay(item.scheduled_at || item.scheduled_time || item.created_at, new Date()));

  const counters = useMemo(() => {
    const today = new Date();
    const unread = Number(stats?.unread ?? notifications.filter(isUnread).length);
    const scheduledToday = Number(
      stats?.scheduled_today ??
      notifications.filter(item => isScheduledStatus(item.status) && isSameLocalDay(item.scheduled_at || item.scheduled_time || item.created_at, today) && getSafeTime(item.scheduled_at || item.scheduled_time || item.created_at) > Date.now()).length
    );
    const alerts = Number(stats?.alerts ?? notifications.filter(item => isAlertStatus(item.status)).length);
    return [
      { key: 'unread', label: 'Unread', value: unread, color: '#2563EB', icon: 'mail-unread-outline' as const },
      { key: 'scheduled', label: 'Scheduled Today', value: scheduledToday, color: '#2563EB', icon: 'time-outline' as const },
      { key: 'alerts', label: 'Alerts', value: alerts, color: '#DC2626', icon: 'alert-circle-outline' as const },
    ];
  }, [notifications, stats]);

  const renderNotificationCard = (item: NotificationItem) => {
    const tone = getTone(item);
    const when = item.scheduled_at || item.scheduled_time || item.created_at;
    return (
      <TouchableOpacity
        key={item.id}
        activeOpacity={0.84}
        style={[styles.notificationCard, isUnread(item) && styles.unreadCard, { borderLeftColor: tone.color }]}
        onPress={() => setSelectedNotification(item)}
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
              <Text style={[styles.statusText, { color: tone.color }]}>{tone.label}</Text>
            </View>
            <Text style={styles.cardTime}>{formatMeta(when)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderReminder = (item: ReminderItem) => {
    const tone = getTone(item);
    return (
      <TouchableOpacity
        key={item.id}
        activeOpacity={item.notification ? 0.84 : 1}
        style={styles.reminderRow}
        onPress={() => item.notification && setSelectedNotification(item.notification)}
      >
        <View style={[styles.iconBubble, { backgroundColor: tone.bg, borderColor: tone.border }]}>
          <Ionicons name={tone.icon} size={19} color={tone.color} />
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.cardMessage} numberOfLines={2}>
            {item.message}{item.fallback ? ' | from medication schedule' : ''}
          </Text>
        </View>
        <Text style={styles.reminderTime}>{formatSafeTime(item.time)}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Notifications</Text>
          <Text style={styles.subtitle}>Reminders and alerts that need your attention.</Text>
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
        {offlineMode ? (
          <View style={styles.offlineBanner}>
            <Ionicons name="cloud-offline-outline" size={17} color="#2563EB" />
            <Text style={styles.offlineBannerText}>Offline mode - changes will sync when connected.</Text>
          </View>
        ) : null}

        <View style={styles.counterRow}>
          {counters.map(counter => (
            <View key={counter.key} style={styles.counterCard}>
              <View style={[styles.counterIcon, { backgroundColor: `${counter.color}14` }]}>
                <Ionicons name={counter.icon} size={16} color={counter.color} />
              </View>
              <Text style={[styles.counterValue, { color: counter.color }]}>{counter.value}</Text>
              <Text style={styles.counterLabel}>{counter.label}</Text>
            </View>
          ))}
        </View>

        {error ? (
          <View style={styles.noticeBox}>
            <Ionicons name="cloud-offline-outline" size={18} color="#B45309" />
            <Text style={styles.noticeText}>{error}</Text>
          </View>
        ) : null}

        {alertNotifications.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Needs Attention</Text>
            <View style={styles.sectionCard}>
              {alertNotifications.slice(0, 4).map(renderNotificationCard)}
            </View>
          </>
        ) : null}

        <Text style={styles.sectionTitle}>Upcoming Reminders</Text>
        <View style={styles.sectionCard}>
          {upcomingReminders.length > 0 ? (
            upcomingReminders.map(renderReminder)
          ) : (
            <View style={styles.emptyBox}>
              <Ionicons name="calendar-clear-outline" size={26} color="#94A3B8" />
              <Text style={styles.emptyTitle}>No reminders scheduled later today.</Text>
              <Text style={styles.emptyText}>Medication and hydration reminders will appear here when scheduled.</Text>
            </View>
          )}
        </View>

        <View style={styles.inboxHeader}>
          <View>
            <Text style={[styles.sectionTitle, styles.inboxTitle]}>Recent Notifications</Text>
            <Text style={styles.sectionSubtitle}>Notification records from reminders and alerts.</Text>
          </View>
        </View>
        <View style={styles.filterRow}>
          {[
            { key: 'all', label: 'All' },
            { key: 'unread', label: 'Unread' },
            { key: 'medication', label: 'Medication' },
            { key: 'hydration', label: 'Hydration' },
          ].map(item => (
            <TouchableOpacity
              key={item.key}
              style={[styles.filterChip, filter === item.key && styles.filterChipActive]}
              onPress={() => setFilter(item.key as InboxFilter)}
            >
              <Text style={[styles.filterText, filter === item.key && styles.filterTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? null : filteredNotifications.length === 0 ? (
          <View style={styles.emptyInbox}>
            <Ionicons name="notifications-off-outline" size={32} color="#94A3B8" />
            <Text style={styles.emptyTitle}>No notification records yet</Text>
            <Text style={styles.emptyText}>Reminder alerts will appear here after they are created by the backend.</Text>
          </View>
        ) : (
          <>
            {todayNotifications.length > 0 ? (
              <>
                <Text style={styles.groupTitle}>Today</Text>
                {todayNotifications.map(renderNotificationCard)}
              </>
            ) : null}
            {earlierNotifications.length > 0 ? (
              <>
                <Text style={styles.groupTitle}>Earlier</Text>
                {earlierNotifications.map(renderNotificationCard)}
              </>
            ) : null}
          </>
        )}

        <Text style={styles.deliveryText}>Notification delivery depends on device permissions and system settings.</Text>
      </ScrollView>

      <Modal visible={Boolean(selectedNotification)} transparent animationType="fade" onRequestClose={() => setSelectedNotification(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.detailModal}>
            {selectedNotification ? (
              <>
                {(() => {
                  const tone = getTone(selectedNotification);
                  const when = selectedNotification.scheduled_at || selectedNotification.scheduled_time || selectedNotification.created_at;
                  const canSnooze = isScheduledStatus(selectedNotification.status);
                  const canComplete = selectedNotification.type !== 'general' && selectedNotification.status !== 'completed' && selectedNotification.status !== 'cleared';
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
                          <Text style={styles.typePillText}>{selectedNotification.type}</Text>
                        </View>
                      </View>
                      <Text style={styles.modalMeta}>{formatMeta(when)}</Text>
                      <View style={styles.modalActions}>
                        {isUnread(selectedNotification) ? (
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
                        <TouchableOpacity style={styles.modalActionButton} onPress={() => clearNotification(selectedNotification)}>
                          <Ionicons name="trash-outline" size={17} color="#DC2626" />
                          <Text style={styles.modalActionText}>Clear</Text>
                        </TouchableOpacity>
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
        visible={syncing && !inlineNotice && !selectedNotification && !noticeModal}
        message="Syncing..."
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
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    gap: 4,
  },
  counterIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterValue: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
  },
  counterLabel: {
    color: '#64748B',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
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
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
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
