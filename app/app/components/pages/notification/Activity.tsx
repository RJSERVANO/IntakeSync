/**
 * Activity Tab - Advanced Analytics & History
 * ==========================================
 * Displays comprehensive medication/notification history with analytics
 * Features: Real stats, PDF export, adherence trends, charts
 * 
 * Note: All notification SETTINGS are now in Profile > Notifications Settings
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import BottomNavigation from '../../navigation/BottomNavigation';
import { del, get, post } from '../../../api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Types
export type NotificationStatus = 'upcoming' | 'completed' | 'missed' | 'snoozed' | 'delivered' | 'scheduled' | 'taken' | 'skipped';
export type NotificationType = 'hydration' | 'medication' | 'general';

export interface NotificationItem {
  id: number | string;
  title: string;
  message?: string;
  body?: string;
  type: NotificationType;
  status: NotificationStatus;
  scheduled_at?: string | null;
  scheduled_time?: string | null;
  created_at?: string | null;
  medication_name?: string;
  time?: string;
}

export interface NotificationStats {
  completed: number;
  upcoming: number;
  missed: number;
}

export interface MedicationHistory {
  id: number;
  medication_id: number;
  user_id: number;
  status: 'completed' | 'skipped' | 'taken' | 'missed';
  time: string;
  scheduled_time?: string;
  taken_time?: string;
  created_at: string;
  medication?: {
    id: number;
    name: string;
    dosage?: string;
    icon?: string;
  };
}

export interface AdherenceTrend {
  date: string;
  completed: number;
  total: number;
  percentage: number;
}

export interface HydrationEntry {
  id?: number | string;
  amount_ml?: number;
  logged_ml?: number;
  timestamp?: string;
  created_at?: string;
  source?: string;
  beverage_type?: string;
  notes?: string | null;
  drink_label?: string | null;
}

type ActivityFeedItem = {
  id: string;
  kind: NotificationType;
  title: string;
  message: string;
  status: NotificationStatus;
  time: string;
  icon: keyof typeof Ionicons.glyphMap;
  notification?: NotificationItem;
};

const escapeHtml = (value: string | number | null | undefined) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const isSameLocalDay = (iso: string | null | undefined, date: Date) => {
  if (!iso) return false;
  const parsed = new Date(iso);
  return (
    parsed.getFullYear() === date.getFullYear() &&
    parsed.getMonth() === date.getMonth() &&
    parsed.getDate() === date.getDate()
  );
};

const isCompletedStatus = (status: NotificationStatus | MedicationHistory['status']) =>
  status === 'completed' || status === 'taken';

const isMissedStatus = (status: NotificationStatus | MedicationHistory['status']) =>
  status === 'missed' || status === 'skipped';

const parseSafeDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getSafeTime = (value?: string | null) => parseSafeDate(value)?.getTime() ?? 0;

const formatSafeDate = (value?: string | null) =>
  parseSafeDate(value)?.toLocaleDateString() ?? 'Unknown';

const formatSafeTime = (value?: string | null) =>
  parseSafeDate(value)?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) ??
  'Unknown';

const getErrorMessage = (error: any, fallback: string) => {
  const message = error?.data?.message || error?.message || error?.data;
  return typeof message === 'string' && message.trim() ? message : fallback;
};

export default function Activity() {
  const params = useLocalSearchParams();
  const token = (params?.token as string) || undefined;
  const insets = useSafeAreaInsets();

  // State
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [medicationHistory, setMedicationHistory] = useState<MedicationHistory[]>([]);
  const [hydrationEntries, setHydrationEntries] = useState<HydrationEntry[]>([]);
  const [stats, setStats] = useState<NotificationStats>({ completed: 0, upcoming: 0, missed: 0 });
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [adherencePeriod, setAdherencePeriod] = useState<'7' | '30'>('7');
  const [adherenceTrends, setAdherenceTrends] = useState<AdherenceTrend[]>([]);
  const [exporting, setExporting] = useState<boolean>(false);

  // Helper: Get status text
  const getStatusText = useCallback((status: NotificationStatus) => {
    switch (status) {
      case 'completed':
      case 'taken':
        return 'Taken';
      case 'missed':
      case 'skipped':
        return 'Missed';
      case 'snoozed':
        return 'Snoozed';
      case 'delivered':
        return 'Delivered';
      case 'scheduled':
      case 'upcoming':
        return 'Upcoming';
      default:
        return 'Upcoming';
    }
  }, []);

  const getActivityIcon = useCallback((type: NotificationType, status?: NotificationStatus) => {
    if (type === 'hydration') return 'water-outline' as const;
    if (status === 'missed' || status === 'skipped') return 'alert-circle-outline' as const;
    if (status === 'snoozed') return 'time-outline' as const;
    if (type === 'medication') return 'medical-outline' as const;
    return 'notifications-outline' as const;
  }, []);

  // Helper: Format time to 12-hour format
  const formatTime = (iso?: string | null) => {
    const d = parseSafeDate(iso);
    if (!d) return 'Unknown';
    const h = d.getHours();
    const m = d.getMinutes().toString().padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${m} ${ampm}`;
  };

  // Helper: Format date
  const formatDate = (iso?: string | null) => {
    return formatSafeDate(iso);
  };

  const formatMeta = (iso?: string | null) => {
    if (!iso) return 'Unknown';
    return `${formatDate(iso)} | ${formatTime(iso)}`;
  };

  const getBeverageLabel = useCallback((entry: HydrationEntry) => {
    const note = typeof entry.notes === 'string' ? entry.notes.trim() : '';
    const base =
      typeof entry.drink_label === 'string' && entry.drink_label.trim()
        ? entry.drink_label.trim()
        : entry.beverage_type === 'caffeinated'
          ? 'Caffeinated beverage'
          : entry.beverage_type === 'sugar_sweetened'
            ? 'Sugar-sweetened drink'
            : entry.beverage_type === 'other_non_alcoholic'
              ? 'Other beverage'
              : 'Beverage';
    const label = note ? `${base} (${note})` : base;
    return label.trim() || 'Beverage';
  }, []);

  const getFeedAccent = useCallback(
    (item: Pick<ActivityFeedItem, 'kind' | 'status'>) => {
      if (item.kind === 'hydration') {
        return {
          color: '#2563EB',
          bg: '#EFF6FF',
          border: '#BFDBFE',
          label: item.status === 'missed' ? 'Missed' : 'Logged',
        };
      }

      if (item.status === 'missed' || item.status === 'skipped') {
        return { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', label: 'Missed' };
      }

      if (item.status === 'snoozed') {
        return { color: '#D97706', bg: '#FFF7ED', border: '#FED7AA', label: 'Snoozed' };
      }

      if (item.kind === 'medication') {
        return {
          color: item.status === 'completed' || item.status === 'taken' ? '#059669' : '#EA580C',
          bg: item.status === 'completed' || item.status === 'taken' ? '#ECFDF5' : '#FFF7ED',
          border: item.status === 'completed' || item.status === 'taken' ? '#A7F3D0' : '#FED7AA',
          label: getStatusText(item.status),
        };
      }

      return { color: '#475569', bg: '#F8FAFC', border: '#E2E8F0', label: getStatusText(item.status) };
    },
    [getStatusText]
  );

  // Normalize API response to NotificationItem[]
  const normalizeList = useCallback((payload: any): NotificationItem[] => {
    const arr = Array.isArray(payload) ? payload : payload?.data;
    if (!Array.isArray(arr)) return [];

    const seen = new Set<string | number>();
    const unique: NotificationItem[] = [];

    for (const raw of arr) {
      const id =
        raw?.id ??
        `${raw?.type}-${raw?.scheduled_at || raw?.scheduled_time || raw?.created_at || Math.random()}`;
      if (seen.has(id)) continue;

      seen.add(id);
      unique.push({
        id,
        title: raw?.title ?? raw?.medication?.name ?? 'Notification',
        message: raw?.message ?? raw?.body ?? '',
        body: raw?.body,
        type: (raw?.type ?? 'general') as NotificationType,
        status: (raw?.status ?? 'scheduled') as NotificationStatus,
        scheduled_at: raw?.scheduled_at ?? null,
        scheduled_time: raw?.scheduled_time ?? raw?.time ?? null,
        created_at: raw?.created_at ?? null,
        medication_name: raw?.medication?.name,
        time: raw?.time,
      });
    }

    return unique;
  }, []);

  // Normalize medication history from API
  const normalizeMedicationHistory = useCallback((payload: any): MedicationHistory[] => {
    const arr = Array.isArray(payload) ? payload : payload?.data;
    if (!Array.isArray(arr)) return [];
    return arr.map((item: any) => ({
      id: item.id,
      medication_id: item.medication_id,
      user_id: item.user_id,
      status: item.status,
      time: item.time,
      scheduled_time: item.scheduled_time,
      taken_time: item.taken_time,
      created_at: item.created_at,
      medication: item.medication,
    }));
  }, []);

  // Normalize stats response
  const normalizeStats = useCallback((payload: any): NotificationStats => {
    const s = payload?.data ?? payload ?? {};
    const upcoming = Number(s?.upcoming ?? s?.scheduled ?? 0) || 0;
    return {
      completed: Number(s?.completed ?? s?.taken ?? 0) || 0,
      upcoming,
      missed: Number(s?.missed ?? s?.skipped ?? 0) || 0,
    };
  }, []);

  // Fetch notifications from API
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await get('/notifications', token);
      const list = normalizeList(res);
      setNotifications(list);
    } catch {
      setNotifications([]);
    }
  }, [normalizeList, token]);

  const fetchHydrationEntries = useCallback(async () => {
    if (!token) return;
    try {
      const res = await get('/hydration?scope=activity&limit=60', token);
      setHydrationEntries(Array.isArray(res?.entries) ? res.entries : []);
    } catch {
      setHydrationEntries([]);
    }
  }, [token]);

  // Fetch medication history from all medications
  const fetchMedicationHistory = useCallback(async () => {
    if (!token) return;
    try {
      // Get all medications first
      const medications: any[] = await get('/medications', token);
      
      // Fetch history for each medication
      const historyPromises = medications.map(async (med) => {
        try {
          const history = await get(`/medications/${med.id}/history`, token);
          // Attach medication info to each history entry
          return Array.isArray(history) ? history.map((h: any) => ({
            ...h,
            medication: {
              id: med.id,
              name: med.name,
              dosage: med.dosage,
              icon: med.icon,
            },
          })) : [];
        } catch {
          return [];
        }
      });

      const allHistory = (await Promise.all(historyPromises)).flat();
      const normalized = normalizeMedicationHistory(allHistory);
      setMedicationHistory(normalized);

      // Calculate real stats from medication history
      const today = new Date().toISOString().split('T')[0];
      const todayHistory = normalized.filter(h => h.time?.startsWith(today));
      
      const completed = todayHistory.filter(h => h.status === 'completed' || h.status === 'taken').length;
      const missed = todayHistory.filter(h => h.status === 'missed' || h.status === 'skipped').length;
      
      // Get upcoming from medications with scheduled times
      const upcoming = medications.filter(m => {
        const times = m.times || [];
        return times.some((t: string) => {
          const scheduledTime = new Date(`${today}T${t}`);
          return scheduledTime > new Date();
        });
      }).length;

      setStats({ completed, upcoming, missed });
    } catch (error) {
      console.error('Error fetching medication history:', error);
      setMedicationHistory([]);
    }
  }, [token, normalizeMedicationHistory]);

  // Calculate adherence trends
  const calculateAdherenceTrends = useCallback(() => {
    const days = adherencePeriod === '7' ? 7 : 30;
    const trends: AdherenceTrend[] = [];
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayHistory = medicationHistory.filter(h => isSameLocalDay(h.time || h.created_at, date));
      const dayBeverages = hydrationEntries.filter(entry =>
        isSameLocalDay(entry.timestamp || entry.created_at, date)
      );
      const completed = dayHistory.filter(h => isCompletedStatus(h.status)).length + dayBeverages.length;
      const total = dayHistory.length + dayBeverages.length;
      const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
      
      trends.push({
        date: dateStr,
        completed,
        total,
        percentage,
      });
    }
    
    setAdherenceTrends(trends);
  }, [medicationHistory, hydrationEntries, adherencePeriod]);

  // Fetch stats from API (fallback)
  const fetchStats = useCallback(async () => {
    try {
      const res = await get('/notifications/stats', token);
      const apiStats = normalizeStats(res);
      // Only use if we don't have medication history stats
      if (medicationHistory.length === 0) {
        setStats(apiStats);
      }
    } catch {
      // Stats already calculated from medication history
    }
  }, [normalizeStats, token, medicationHistory.length]);

  // Initial load on mount - replaced with useFocusEffect
  useFocusEffect(
    useCallback(() => {
      const loadData = async () => {
        setLoading(true);
        await Promise.all([
          fetchNotifications(),
          fetchMedicationHistory(),
          fetchHydrationEntries(),
          fetchStats(),
        ]);
        setLoading(false);
      };
      
      loadData();
    }, [fetchNotifications, fetchMedicationHistory, fetchHydrationEntries, fetchStats])
  );

  // Calculate adherence trends when medication history changes
  useEffect(() => {
    calculateAdherenceTrends();
  }, [medicationHistory, hydrationEntries, adherencePeriod, calculateAdherenceTrends]);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    try {
      await post('/notifications/mark-all-read', {}, token);
      await Promise.all([fetchNotifications(), fetchStats()]);
      Alert.alert('Success', 'Notifications marked as read');
    } catch (error) {
      console.log('mark notifications read error', error);
      Alert.alert(
        'Error',
        getErrorMessage(error, 'Could not mark notifications as read. Please try again.')
      );
    }
  }, [fetchNotifications, fetchStats, token]);

  // Clear all notifications
  const clearAllNotifications = useCallback(async () => {
    Alert.alert(
      'Clear Notifications?',
      'This will remove reminder notifications only. Medication history and beverage logs will remain.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await post('/notifications/clear', {}, token);
              setNotifications([]);
              await fetchStats();
              Alert.alert('Success', 'Notifications cleared');
            } catch (error) {
              console.log('clear notifications error', error);
              Alert.alert(
                'Error',
                getErrorMessage(error, 'Could not clear notifications. Please try again.')
              );
            }
          },
        },
      ]
    );
  }, [fetchStats, token]);

  // Complete a notification
  const completeNotification = useCallback(
    async (id: number | string) => {
      try {
        await post(`/notifications/${id}/complete`, {}, token);
      } catch {}
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, status: 'completed' } : n))
      );
      await fetchStats();
    },
    [fetchStats, token]
  );

  // Snooze a notification
  const snoozeNotification = useCallback(
    async (id: number | string) => {
      try {
        await post(`/notifications/${id}/snooze`, { minutes: 10 }, token);
      } catch {}
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, status: 'snoozed' } : n))
      );
      await fetchStats();
    },
    [fetchStats, token]
  );

  // Delete a notification
  const deleteNotification = useCallback(
    async (id: number | string) => {
      try {
        await del(`/notifications/${id}`, token);
      } catch {}
      setNotifications(prev => prev.filter(n => n.id !== id));
      await fetchStats();
    },
    [fetchStats, token]
  );

  // Handle refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      fetchNotifications(),
      fetchMedicationHistory(),
      fetchHydrationEntries(),
      fetchStats(),
    ]);
    setRefreshing(false);
  }, [fetchNotifications, fetchMedicationHistory, fetchHydrationEntries, fetchStats]);

  // Export to PDF
  const exportToPDF = useCallback(async () => {
    if (exporting) return;
    
    setExporting(true);
    try {
      const medicationRows = [...medicationHistory]
        .sort((a, b) => getSafeTime(b.time || b.created_at) - getSafeTime(a.time || a.created_at))
        .slice(0, 40);
      const beverageRows = [...hydrationEntries]
        .filter(entry => Boolean(entry.timestamp || entry.created_at))
        .sort(
          (a, b) =>
            getSafeTime(b.timestamp || b.created_at) -
            getSafeTime(a.timestamp || a.created_at)
        )
        .slice(0, 40);
      const allTimes = [
        ...medicationRows.map(row => row.time || row.created_at),
        ...beverageRows.map(row => row.timestamp || row.created_at || ''),
      ].filter(time => Boolean(parseSafeDate(time)));

      if (medicationRows.length === 0 && beverageRows.length === 0) {
        Alert.alert('No Data', 'No beverage or medication activity available to export.');
        setExporting(false);
        return;
      }

      const newest = allTimes.length
        ? formatSafeDate(
            new Date(Math.max(...allTimes.map(time => getSafeTime(time)))).toISOString()
          )
        : 'Recent';
      const oldest = allTimes.length
        ? formatSafeDate(
            new Date(Math.min(...allTimes.map(time => getSafeTime(time)))).toISOString()
          )
        : 'Recent';

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>IntakeSync Activity Report</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
              padding: 28px;
              color: #0F172A;
              background: #F8FAFC;
            }
            .shell {
              background: #FFFFFF;
              border: 1px solid #DBEAFE;
              border-radius: 18px;
              padding: 22px;
            }
            .brand {
              color: #2563EB;
              font-size: 13px;
              font-weight: 800;
              letter-spacing: 0.08em;
              text-transform: uppercase;
            }
            h1 { margin: 6px 0 4px; font-size: 28px; }
            .muted { color: #64748B; font-size: 13px; }
            .summary {
              display: flex;
              gap: 10px;
              margin: 18px 0;
            }
            .summary div {
              flex: 1;
              border: 1px solid #E2E8F0;
              border-radius: 12px;
              padding: 12px;
              background: #F8FAFC;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 12px;
              background: #FFFFFF;
            }
            th {
              background-color: #EFF6FF;
              color: #1E3A8A;
              padding: 10px;
              text-align: left;
              font-size: 12px;
            }
            td {
              padding: 10px;
              border-bottom: 1px solid #E5E7EB;
              font-size: 12px;
            }
            h2 { margin: 22px 0 8px; font-size: 17px; }
            .completed { color: #059669; font-weight: 800; }
            .missed { color: #DC2626; font-weight: 800; }
            .beverage { color: #2563EB; font-weight: 800; }
            .footer {
              margin-top: 26px;
              text-align: center;
              color: #6B7280;
              font-size: 12px;
            }
          </style>
        </head>
        <body>
          <div class="shell">
            <div class="brand">IntakeSync</div>
            <h1>Routine Activity Report</h1>
            <div class="muted">Generated ${escapeHtml(new Date().toLocaleString())} | Range: ${escapeHtml(oldest)} - ${escapeHtml(newest)}</div>
            <div class="summary">
              <div><strong>${medicationRows.length}</strong><br><span class="muted">Medication records</span></div>
              <div><strong>${beverageRows.length}</strong><br><span class="muted">Beverage logs</span></div>
            </div>

            <h2>Beverage Activity</h2>
            <table>
              <thead>
                <tr><th>Date</th><th>Time</th><th>Beverage</th><th>Amount</th><th>Source</th></tr>
              </thead>
              <tbody>
                ${beverageRows.map(entry => {
                  const time = entry.timestamp || entry.created_at || '';
                  const label = getBeverageLabel(entry) || 'Beverage';
                  const amount = Number(entry.amount_ml || entry.logged_ml || 0);
                  return `
                    <tr>
                      <td>${escapeHtml(formatSafeDate(time))}</td>
                      <td>${escapeHtml(formatSafeTime(time))}</td>
                      <td class="beverage">${escapeHtml(label.trim() || 'Beverage')}</td>
                      <td>${escapeHtml(Number.isFinite(amount) ? amount : 0)} ml</td>
                      <td>${escapeHtml(entry.source || 'manual')}</td>
                    </tr>
                  `;
                }).join('') || '<tr><td colspan="5" class="muted">No beverage activity</td></tr>'}
              </tbody>
            </table>

            <h2>Medication Activity</h2>
            <table>
              <thead>
                <tr><th>Date</th><th>Time</th><th>Medication</th><th>Dosage</th><th>Status</th></tr>
              </thead>
              <tbody>
                ${medicationRows.map(entry => {
                  const time = entry.time || entry.created_at;
                  const statusClass = isCompletedStatus(entry.status) ? 'completed' : 'missed';
                  const statusText = getStatusText(entry.status as NotificationStatus) || 'Activity';
                  return `
                    <tr>
                      <td>${escapeHtml(formatSafeDate(time))}</td>
                      <td>${escapeHtml(formatSafeTime(time))}</td>
                      <td>${escapeHtml(entry.medication?.name || 'Medication')}</td>
                      <td>${escapeHtml(entry.medication?.dosage || '-')}</td>
                      <td class="${statusClass}">${escapeHtml(statusText)}</td>
                    </tr>
                  `;
                }).join('') || '<tr><td colspan="5" class="muted">No medication activity</td></tr>'}
              </tbody>
            </table>

            <div class="footer">IntakeSync Routine Activity Report</div>
          </div>
        </body>
        </html>
      `;

      // Generate PDF
      const { uri } = await Print.printToFileAsync({ html });
      
      // Share PDF
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'IntakeSync Activity Report',
        });
      } else {
        Alert.alert('Success', `PDF saved to: ${uri}`);
      }
    } catch (err) {
      console.error('PDF generation error:', err);
      Alert.alert('Error', getErrorMessage(err, 'Failed to generate PDF report.'));
    } finally {
      setExporting(false);
    }
  }, [exporting, getBeverageLabel, getStatusText, hydrationEntries, medicationHistory]);

  // Memoized stats list
  const derivedStats = useMemo(() => {
    const today = new Date();
    const todayMedication = medicationHistory.filter(entry =>
      isSameLocalDay(entry.time || entry.created_at, today)
    );
    const todayBeverage = hydrationEntries.filter(entry =>
      isSameLocalDay(entry.timestamp || entry.created_at, today)
    );
    const todayNotifications = notifications.filter(item =>
      isSameLocalDay(item.scheduled_at || item.scheduled_time || item.created_at, today)
    );
    const notificationUpcoming = todayNotifications.filter(item =>
      (item.status === 'scheduled' || item.status === 'upcoming') &&
      new Date(item.scheduled_at || item.scheduled_time || item.created_at || '').getTime() > Date.now()
    ).length;

    return {
      completed:
        todayMedication.filter(entry => isCompletedStatus(entry.status)).length +
        todayBeverage.length,
      upcoming: Math.max(stats.upcoming, notificationUpcoming),
      missed:
        todayMedication.filter(entry => isMissedStatus(entry.status)).length +
        todayNotifications.filter(item => item.status === 'missed').length,
    };
  }, [hydrationEntries, medicationHistory, notifications, stats.upcoming]);

  const statsList = useMemo(
    () => [
      {
        key: 'completed',
        label: 'Completed',
        value: derivedStats.completed,
        color: '#22c55e',
        icon: 'checkmark-done-outline' as const,
      },
      {
        key: 'upcoming',
        label: 'Upcoming',
        value: derivedStats.upcoming,
        color: '#3b82f6',
        icon: 'time-outline' as const,
      },
      {
        key: 'missed',
        label: 'Missed',
        value: derivedStats.missed,
        color: '#f97316',
        icon: 'alert-circle-outline' as const,
      },
    ],
    [derivedStats]
  );

  const activityFeed = useMemo<ActivityFeedItem[]>(() => {
    const medicationItems = medicationHistory.map(entry => ({
      id: `med-${entry.id}`,
      kind: 'medication' as const,
      title: entry.status === 'missed' || entry.status === 'skipped' ? 'Medication missed' : 'Medication taken',
      message: `${entry.medication?.name || 'Medication'}${entry.medication?.dosage ? ` | ${entry.medication.dosage}` : ''}`,
      status: entry.status as NotificationStatus,
      time: entry.time || entry.created_at,
      icon: getActivityIcon('medication', entry.status as NotificationStatus),
    }));

    const beverageItems = hydrationEntries.map((entry, index) => {
      const amount = Number(entry.amount_ml || entry.logged_ml || 0);
      return {
        id: `bev-${entry.id ?? entry.timestamp ?? index}`,
        kind: 'hydration' as const,
        title: 'Beverage logged',
        message: `${getBeverageLabel(entry)}${amount ? ` | ${amount} ml` : ''}`,
        status: 'completed' as NotificationStatus,
        time: entry.timestamp || entry.created_at || '',
        icon: getActivityIcon('hydration'),
      };
    });

    const notificationItems = notifications.map(n => ({
      id: `note-${n.id}`,
      kind: n.type,
      title:
        n.status === 'snoozed'
          ? 'Snoozed reminder'
          : n.type === 'hydration'
            ? 'Beverage reminder'
            : n.type === 'medication'
              ? getStatusText(n.status) === 'Missed'
                ? 'Medication missed'
                : 'Medication reminder'
              : 'Reminder activity',
      message: n.message || n.body || n.title,
      status: n.status,
      time: n.scheduled_at || n.scheduled_time || n.created_at || '',
      icon: getActivityIcon(n.type, n.status),
      notification: n,
    }));

    return [...medicationItems, ...beverageItems, ...notificationItems]
      .filter(item => item.time)
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 30);
  }, [getActivityIcon, getBeverageLabel, getStatusText, hydrationEntries, medicationHistory, notifications]);

  return (
    <SafeAreaView style={styles.container}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) }]}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Routine Activity</Text>
          <Text style={styles.subtitle}>Your recent routine activity and reminders.</Text>
        </View>
        <TouchableOpacity
          style={styles.exportBtn}
          onPress={exportToPDF}
          disabled={exporting || (medicationHistory.length === 0 && hydrationEntries.length === 0)}
        >
          {exporting ? (
            <ActivityIndicator size="small" color="#2563EB" />
          ) : (
            <>
              <Ionicons name="download-outline" size={16} color="#2563EB" />
              <Text style={styles.exportText}>Export</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Stats Cards - Real Data */}
        <View style={styles.statsRow}>
          {statsList.map(s => (
            <View
              key={s.key}
              style={[styles.statBox, { borderTopColor: s.color }]}
            >
              <View style={[styles.statIconBubble, { backgroundColor: `${s.color}18` }]}>
                <Ionicons name={s.icon} size={17} color={s.color} />
              </View>
              <Text style={[styles.statValue, { color: s.color }]}>{s.value ?? 0}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Adherence Trends Section */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Adherence Trends</Text>
          <View style={styles.periodToggle}>
            <TouchableOpacity
              style={[styles.periodBtn, adherencePeriod === '7' && styles.periodBtnActive]}
              onPress={() => setAdherencePeriod('7')}
            >
              <Text style={[styles.periodText, adherencePeriod === '7' && styles.periodTextActive]}>
                7 Days
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.periodBtn, adherencePeriod === '30' && styles.periodBtnActive]}
              onPress={() => setAdherencePeriod('30')}
            >
              <Text style={[styles.periodText, adherencePeriod === '30' && styles.periodTextActive]}>
                30 Days
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Adherence Chart */}
        <View style={styles.chartContainer}>
          <View style={styles.chartTopRow}>
            <Text style={styles.chartHint}>Medication adherence plus beverage logs</Text>
            <Text style={styles.chartCount}>{adherenceTrends.filter(day => day.total > 0).length} active days</Text>
          </View>
          {adherenceTrends.length > 0 ? (
            <View style={styles.chart}>
              <ScrollView
                horizontal={adherencePeriod === '30'}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={[
                  styles.chartBars,
                  adherencePeriod === '30' && styles.chartBarsScrollable,
                ]}
              >
                {adherenceTrends.map((trend, idx) => {
                  const barColor = trend.percentage >= 80 ? '#10B981' : trend.percentage >= 50 ? '#F59E0B' : '#EF4444';
                  const showLabel = adherencePeriod === '7' || idx % 5 === 0 || idx === adherenceTrends.length - 1;

                  return (
                  <View
                    key={trend.date}
                    style={[
                      styles.barColumn,
                      adherencePeriod === '30' && styles.barColumnCompact,
                    ]}
                  >
                    <View style={styles.barContainer}>
                      <View
                        style={[
                          styles.bar,
                          {
                            height: `${Math.max(trend.percentage, trend.total > 0 ? 6 : 0)}%`,
                            backgroundColor: trend.total > 0 ? barColor : '#E2E8F0',
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.barLabel}>
                      {showLabel ? new Date(trend.date).getDate() : ''}
                    </Text>
                  </View>
                  );
                })}
              </ScrollView>
              <View style={styles.chartLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
                  <Text style={styles.legendText}>Good (80%+)</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
                  <Text style={styles.legendText}>Fair (50-79%)</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
                  <Text style={styles.legendText}>Poor (&lt;50%)</Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.emptyChart}>
              <Text style={styles.emptyChartText}>No data available for the selected period</Text>
            </View>
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Reminder Controls</Text>
        </View>
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={markAllAsRead}>
            <Ionicons name="checkmark-done" size={17} color="#059669" />
            <Text style={styles.actionText}>Mark All Read</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={clearAllNotifications}>
            <Ionicons name="trash-outline" size={17} color="#DC2626" />
            <Text style={styles.actionText}>Clear Notifications</Text>
          </TouchableOpacity>
        </View>

        {/* Recent Activity Section */}
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitle}>Recent Timeline</Text>
            <Text style={styles.sectionSubtitle}>Newest beverage, medication, and reminder events.</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#2563EB" />
            <Text style={styles.loadingText}>Loading routine activity...</Text>
          </View>
        ) : activityFeed.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="pulse-outline" size={34} color="#94A3B8" />
            <Text style={styles.emptyTitle}>No activity yet</Text>
            <Text style={styles.emptyText}>Beverage logs, medication actions, and reminders will appear here.</Text>
          </View>
        ) : (
          <View style={styles.timelineList}>
            {activityFeed.map(item => {
                const tone = getFeedAccent(item);
                const isNotification = Boolean(item.notification);
                return (
              <View key={item.id} style={[styles.listItem, { borderLeftColor: tone.color }]}>
                <View style={[styles.listIconWrap, { backgroundColor: tone.bg, borderColor: tone.border }]}>
                  <Ionicons
                    name={item.icon}
                    size={20}
                    color={tone.color}
                  />
                </View>
                <View style={styles.itemBody}>
                  <View style={styles.itemHeaderRow}>
                    <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                    <View style={[styles.statusPill, { backgroundColor: tone.bg, borderColor: tone.border }]}>
                      <Text style={[styles.statusText, { color: tone.color }]}>{tone.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.itemMessage} numberOfLines={2}>{item.message}</Text>
                  <Text style={styles.itemMeta}>{formatMeta(item.time)}</Text>
                  {isNotification && item.notification ? (
                    <View style={styles.itemActionsRow}>
                      <TouchableOpacity
                        style={styles.itemActionBtn}
                        onPress={() => completeNotification(item.notification!.id)}
                      >
                        <Ionicons name="checkmark-circle" size={16} color="#059669" />
                        <Text style={styles.itemActionText}>Complete</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.itemActionBtn}
                        onPress={() => snoozeNotification(item.notification!.id)}
                      >
                        <Ionicons name="time-outline" size={16} color="#D97706" />
                        <Text style={styles.itemActionText}>Snooze</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.itemActionBtn}
                        onPress={() => deleteNotification(item.notification!.id)}
                      >
                        <Ionicons name="trash-outline" size={16} color="#DC2626" />
                        <Text style={styles.itemActionText}>Clear</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              </View>
                );
              })}
          </View>
        )}
      </ScrollView>
      <BottomNavigation currentRoute="notification" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 112,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerCopy: {
    flex: 1,
    paddingRight: 12,
  },
  title: {
    color: '#0F172A',
    fontSize: 28,
    fontWeight: '900',
  },
  subtitle: {
    color: '#64748B',
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  exportBtn: {
    minWidth: 88,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  exportText: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '900',
  },
  sectionHeaderRow: {
    marginTop: 8,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 17,
    fontWeight: '900',
  },
  sectionSubtitle: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  statBox: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderTopWidth: 3,
    padding: 12,
    alignItems: 'center',
    gap: 6,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  statIconBubble: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '900',
  },
  statLabel: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  periodToggle: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  periodBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: 'white',
  },
  periodBtnActive: {
    backgroundColor: '#2563EB',
  },
  periodText: {
    color: '#6B7280',
    fontWeight: '600',
    fontSize: 13,
  },
  periodTextActive: {
    color: 'white',
  },
  chartContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 16,
    minHeight: 200,
    position: 'relative',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  chartTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  chartHint: {
    flex: 1,
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  chartCount: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '900',
  },
  chart: {
    flex: 1,
  },
  chartBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 136,
    marginBottom: 8,
    gap: 7,
    minWidth: '100%',
  },
  chartBarsScrollable: {
    minWidth: 650,
    paddingRight: 4,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  barColumnCompact: {
    width: 18,
    flex: 0,
  },
  barContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    minHeight: 4,
  },
  barLabel: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '600',
  },
  chartLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    justifyContent: 'space-between',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    color: '#6B7280',
  },
  emptyChart: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyChartText: {
    color: '#6B7280',
    fontSize: 14,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  actionText: {
    color: '#1F2937',
    fontWeight: '700',
    fontSize: 14,
  },
  timelineList: {
    marginTop: 2,
  },
  listItem: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: 'white',
    borderWidth: 1,
    borderLeftWidth: 4,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  listIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  itemBody: {
    flex: 1,
    minWidth: 0,
  },
  itemHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '900',
    flex: 1,
    paddingRight: 8,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '900',
  },
  itemMessage: {
    color: '#475569',
    marginTop: 3,
    fontSize: 13,
    fontWeight: '700',
  },
  itemMeta: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 4,
  },
  itemActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  itemActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
  },
  itemActionText: {
    color: '#1F2937',
    fontWeight: '600',
  },
  emptyBox: {
    alignItems: 'center',
    gap: 8,
    padding: 24,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
  },
  loadingBox: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
  },
  loadingText: {
    color: '#64748B',
    fontWeight: '800',
    fontSize: 13,
  },
  emptyTitle: {
    color: '#1F2937',
    fontWeight: '800',
    fontSize: 18,
  },
  emptyText: {
    color: '#6B7280',
  },
});
