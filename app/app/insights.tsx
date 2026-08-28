import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as api from './api';
import { captureAuthSessionContext, isAuthSessionContextCurrent } from '../services/authSession';
import ScreenHeader from './components/common/ScreenHeader';
import InlineSyncNotice from './components/common/InlineSyncNotice';
import {
  getCachedSession,
  readHydrationCache,
  readDeletedMedicationTombstones,
  readMedicationCache,
  readMedicationHistoryCache,
  writeHydrationCache,
  writeMedicationCache,
  writeMedicationHistoryCache,
} from '../services/offlineStorage';
import { subscribeHomeRefresh } from '../services/homeEvents';
import {
  deriveMedicationSummaryForDate,
  getMedicationIdentityValues,
  sameMedication,
  type MedicationSummaryHistoryEntry,
  type MedicationSummaryMedication,
} from '../utils/medicationSummary';
import { FONT_SCALE } from '../utils/fontScaling';
import { useFontScaleVersion } from './accessibility/FontScaleProvider';

type BeverageLevel = 'none' | 'low' | 'medium' | 'high';
type MedicationStatus = 'completed' | 'skipped' | 'missed' | 'snoozed' | 'pending';
type DayStatus = 'good' | 'warning' | 'attention' | 'none';

type MedicationItem = {
  id: string | number;
  server_id?: string | number | null;
  local_id?: string | number | null;
  name?: string;
  dosage?: string;
  times?: string[];
  reminder?: boolean;
  start_date?: string;
  end_date?: string | null;
  frequency?: 'daily' | 'weekly' | 'monthly' | 'custom';
  days_of_week?: number[];
  active?: boolean;
  deleted_at?: string | null;
  created_at?: string;
  local_created_at?: string;
  schedule_created_at?: string;
  client_created_at?: string;
  client_uuid?: string | number | null;
  sync_status?: 'pending' | 'synced' | 'failed' | 'syncing';
};

type MedicationEvent = {
  id?: string | number;
  medId?: string | number;
  medication_id?: string | number;
  time?: string;
  scheduled_time?: string;
  scheduled_at?: string;
  status?: MedicationStatus | string;
  loggedAt?: string;
  logged_at?: string;
  created_at?: string;
  updated_at?: string;
  medication_name_snapshot?: string;
  dosage_snapshot?: string;
  medication?: {
    id?: string | number;
    name?: string;
    dosage?: string;
    deleted_at?: string | null;
  } | null;
};

type DailyInsight = {
  day: string;
  date: string;
  title: string;
  score: number | null;
  status: DayStatus;
  summary: string;
  reason: string;
  hasData: boolean;
  beverage: {
    hasData: boolean;
    totalMl: number;
    goalMl: number;
    percent: number;
    score: number | null;
    sugarLevel: BeverageLevel;
    caffeineLevel: BeverageLevel;
    highSugar: number;
    highCaffeine: number;
    logs: any[];
  };
  medication: {
    hasData: boolean;
    scheduled: number;
    completed: number;
    missed: number;
    skipped: number;
    adherence: number | null;
    score: number | null;
    events: MedicationEvent[];
  };
};

type ActionTip = { label: string; text: string; color: string; icon: keyof typeof Ionicons.glyphMap; severity: number };

type InsightsData = {
  healthScore: number | null;
  hasData: boolean;
  partialLabel: string;
  hydrationAvg: number | null;
  weeklyBeverageTotal: number;
  beverageDaysWithLogs: number;
  medicationAdherence: number | null;
  scheduledDoses: number;
  completedDoses: number;
  missedDoses: number;
  skippedDoses: number;
  beverageScore: number | null;
  medicationScore: number | null;
  highSugarDays: number;
  highCaffeineDays: number;
  bestBeverageDay: DailyInsight | null;
  lowestBeverageDay: DailyInsight | null;
  beverageLogs: any[];
  medicationEvents: MedicationEvent[];
  weeklyData: DailyInsight[];
  monthlyData: DailyInsight[];
  actionTips: ActionTip[];
  sourceLabel: string;
};

type DailyInsightContext = {
  beverageLogs: any[];
  goal: number;
  meds: MedicationItem[];
  medicationEvents: MedicationEvent[];
  now: Date;
};

const MISSED_DOSE_GRACE_MS = 30 * 60 * 1000;
const SCORE_COLORS = {
  none: '#94A3B8',
  attention: '#EF4444',
  warning: '#F59E0B',
  good: '#10B981',
};

const DAY_STATUS_META: Record<DayStatus, { label: string; color: string; bg: string; border: string; icon: keyof typeof Ionicons.glyphMap }> = {
  good: { label: 'Good', color: SCORE_COLORS.good, bg: '#ECFDF5', border: '#BBF7D0', icon: 'checkmark-circle-outline' },
  warning: { label: 'Warning', color: SCORE_COLORS.warning, bg: '#FFFBEB', border: '#FDE68A', icon: 'alert-circle-outline' },
  attention: { label: 'Needs attention', color: SCORE_COLORS.attention, bg: '#FEF2F2', border: '#FECACA', icon: 'warning-outline' },
  none: { label: 'No data', color: SCORE_COLORS.none, bg: '#F8FAFC', border: '#E2E8F0', icon: 'ellipse-outline' },
};

const clampScore = (score: number) => Math.max(0, Math.min(100, Math.round(Number(score) || 0)));

const getWeekStart = (date = new Date()) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return start;
};

const getDateKey = (date: Date | string) => {
  const value = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return '';
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateStringLocal = (dateString?: string | null) => {
  if (!dateString) return new Date();
  const [year, month, day] = dateString.slice(0, 10).split('-').map(Number);
  return new Date(year || new Date().getFullYear(), (month || 1) - 1, day || 1);
};

const formatNumber = (value: number) => {
  try {
    return value.toLocaleString();
  } catch {
    return String(value);
  }
};

const formatShortDate = (value?: string) => {
  if (!value) return 'Recent';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recent';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};

const getEntryTime = (entry: any) => entry?.timestamp || entry?.date || entry?.created_at || entry?.scheduled_at || entry?.time || '';
const getMedicationDoseTime = (entry: any) => entry?.scheduled_time || entry?.scheduled_at || entry?.time || entry?.timestamp || entry?.created_at || '';
const getMedicationId = (entry: any) => entry?.medId || entry?.medication_id || entry?.medicationId || entry?.med_id || entry?.id || 'medication';

const getDoseMinuteKey = (entry: any) => {
  const date = new Date(getMedicationDoseTime(entry));
  if (Number.isNaN(date.getTime())) return `${getMedicationId(entry)}:${entry?.id || JSON.stringify(entry)}`;
  date.setSeconds(0, 0);
  return `${getMedicationId(entry)}:${date.toISOString().slice(0, 16)}`;
};

const getMedicationStatusPriority = (entry: any) => {
  const status = String(entry?.status || '').toLowerCase();
  if (status === 'completed') return 4;
  if (status === 'snoozed') return 3;
  if (status === 'missed' || status === 'skipped') return 2;
  return 1;
};

const dedupeMedicationEvents = (entries: any[]) => {
  const byDose = new Map<string, any>();
  entries.forEach((entry) => {
    const key = getDoseMinuteKey(entry);
    const existing = byDose.get(key);
    const entryTime = new Date(entry?.loggedAt || entry?.logged_at || entry?.updated_at || getMedicationDoseTime(entry)).getTime() || 0;
    const existingTime = new Date(existing?.loggedAt || existing?.logged_at || existing?.updated_at || getMedicationDoseTime(existing)).getTime() || 0;
    if (
      !existing ||
      getMedicationStatusPriority(entry) > getMedicationStatusPriority(existing) ||
      (getMedicationStatusPriority(entry) === getMedicationStatusPriority(existing) && entryTime > existingTime)
    ) {
      byDose.set(key, entry);
    }
  });
  return Array.from(byDose.values()).sort((a, b) => {
    const bTime = new Date(b?.loggedAt || b?.logged_at || getMedicationDoseTime(b)).getTime() || 0;
    const aTime = new Date(a?.loggedAt || a?.logged_at || getMedicationDoseTime(a)).getTime() || 0;
    return bTime - aTime;
  });
};

const dedupeBeverageLogs = (entries: any[]) => {
  const byKey = new Map<string, any>();
  entries.forEach((entry) => {
    const key = String(entry?.id ?? entry?.local_id ?? `${getEntryTime(entry)}:${entry?.amount_ml ?? entry?.logged_ml ?? ''}:${entry?.drink_label ?? ''}`);
    byKey.set(key, { ...byKey.get(key), ...entry });
  });
  return Array.from(byKey.values()).sort((a, b) => (new Date(getEntryTime(b)).getTime() || 0) - (new Date(getEntryTime(a)).getTime() || 0));
};

const normalizeMedicationForInsights = (med: MedicationItem): MedicationItem => ({
  ...med,
  id: med.id?.toString?.() || med.local_id?.toString?.() || med.server_id?.toString?.() || med.client_uuid?.toString?.() || String(med.id),
});

const isPendingLocalMedication = (med: MedicationItem) => (
  med.sync_status === 'pending' ||
  med.sync_status === 'failed' ||
  (!med.server_id && typeof med.id === 'string' && med.id.startsWith('med_'))
);

const medicationMatchesDeletedKey = (med: MedicationItem, deletedKeys?: Set<string>) => {
  if (!deletedKeys?.size) return false;
  return getMedicationIdentityValues(med).some((identity) => deletedKeys.has(identity));
};

const findMedicationMergeKey = (
  med: MedicationItem,
  identityToKey: Map<string, string>,
  merged: Map<string, MedicationItem>,
) => {
  const identities = getMedicationIdentityValues(med);
  const identityKey = identities.map((identity) => identityToKey.get(identity)).find(Boolean);
  if (identityKey) return identityKey;

  const similar = Array.from(merged.entries()).find(([, existing]) => sameMedication(existing, med));
  if (similar) return similar[0];

  return `med:${identities[0] || med.id || med.local_id || med.client_uuid || merged.size}`;
};

const mergeMedicationRowsForInsights = ({
  backendMedications,
  localMedications,
  deletedMedicationKeys,
}: {
  backendMedications?: MedicationItem[] | null;
  localMedications?: MedicationItem[] | null;
  deletedMedicationKeys?: Set<string>;
}) => {
  const merged = new Map<string, MedicationItem>();
  const identityToKey = new Map<string, string>();

  const putMedication = (rawMed: MedicationItem, preferIncoming: boolean) => {
    if (!rawMed || rawMed.deleted_at) return;
    const med = normalizeMedicationForInsights(rawMed);
    if (medicationMatchesDeletedKey(med, deletedMedicationKeys)) return;

    const key = findMedicationMergeKey(med, identityToKey, merged);
    const existing = merged.get(key);
    const next = existing
      ? preferIncoming
        ? { ...existing, ...med, times: med.times?.length ? med.times : existing.times }
        : { ...med, ...existing, times: existing.times?.length ? existing.times : med.times }
      : med;
    merged.set(key, next);
    getMedicationIdentityValues(next).forEach((identity) => identityToKey.set(identity, key));
  };

  (backendMedications || []).forEach((med) => putMedication(med, true));
  (localMedications || []).forEach((med) => putMedication(med, isPendingLocalMedication(med)));

  return Array.from(merged.values());
};

const levelRank = (level?: string): BeverageLevel => {
  const normalized = String(level || 'none').toLowerCase();
  if (normalized === 'high' || normalized === 'medium' || normalized === 'low') return normalized;
  return 'none';
};

const highestLevel = (entries: any[], field: 'sugar_level' | 'caffeine_level') => {
  const order: BeverageLevel[] = ['none', 'low', 'medium', 'high'];
  return entries.reduce<BeverageLevel>((highest, entry) => {
    const value = levelRank(entry?.[field]);
    return order.indexOf(value) > order.indexOf(highest) ? value : highest;
  }, 'none');
};

const levelPenalty = (level: BeverageLevel) => {
  if (level === 'high') return 5;
  if (level === 'medium') return 2;
  return 0;
};

const classifyRoutineDay = (score: number | null, hasData: boolean): DayStatus => {
  if (!hasData) return 'none';
  if (score === null) return 'attention';
  if (score >= 80) return 'good';
  if (score >= 60) return 'warning';
  return 'attention';
};

const getScoreMessage = (score: number | null, hasData = score !== null) => {
  const status = classifyRoutineDay(score, hasData);
  if (status === 'none') return 'No data yet';
  if (status === 'attention') return 'Needs attention';
  if (status === 'warning') return 'Warning';
  return 'Good';
};

const getScoreColor = (score: number | null, hasData = score !== null) => {
  return DAY_STATUS_META[classifyRoutineDay(score, hasData)].color;
};

const normalizeHistoryEntry = (entry: any, medId?: string | number): MedicationEvent => ({
  ...entry,
  id: entry?.id?.toString?.() || entry?.local_id || `${medId || entry?.medication?.id || getMedicationId(entry)}:${getMedicationDoseTime(entry)}:${entry?.status || 'recorded'}`,
  medId: entry?.medId || entry?.medication_id || entry?.medication?.id || medId,
  time: entry?.time || entry?.scheduled_time || entry?.scheduled_at,
  status: entry?.status,
  loggedAt: entry?.loggedAt || entry?.logged_at || entry?.taken_time || entry?.taken_at || entry?.completed_at || entry?.created_at || entry?.updated_at,
  medication_name_snapshot: entry?.medication_name_snapshot || entry?.medication?.name,
  dosage_snapshot: entry?.dosage_snapshot || entry?.medication?.dosage,
});

const isMedicationScheduledOnDate = (med: MedicationItem, date: Date) => {
  if (!med.times?.length || med.deleted_at || med.active === false || med.reminder === false) return false;
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const scheduleStart = med.start_date ? parseDateStringLocal(med.start_date) : null;
  if (scheduleStart && scheduleStart.getTime() > dayStart.getTime()) return false;
  if (med.end_date) {
    const end = parseDateStringLocal(med.end_date);
    end.setHours(23, 59, 59, 999);
    if (end.getTime() < dayStart.getTime()) return false;
  }
  if ((med.frequency === 'weekly' || med.frequency === 'custom') && med.days_of_week?.length) return med.days_of_week.includes(date.getDay());
  if (med.frequency === 'monthly' && scheduleStart) return date.getDate() === scheduleStart.getDate();
  return true;
};

const getMedicationScheduleCreatedAt = (med: MedicationItem) => {
  const raw = med.schedule_created_at || med.client_created_at || med.local_created_at || med.created_at;
  if (!raw) return null;
  const created = new Date(raw);
  if (Number.isNaN(created.getTime())) return null;
  created.setSeconds(0, 0);
  return created.getTime();
};

const getMedicationDoseOccurrencesForDate = (med: MedicationItem, date: Date) => {
  if (!isMedicationScheduledOnDate(med, date)) return [];
  const scheduleCreatedAt = getMedicationScheduleCreatedAt(med);
  return (med.times || [])
    .map((time) => {
      const source = new Date(time);
      if (Number.isNaN(source.getTime())) return null;
      const occurrence = new Date(date);
      occurrence.setHours(source.getHours(), source.getMinutes(), source.getSeconds(), 0);
      return occurrence;
    })
    .filter((item): item is Date => !!item)
    .filter((item) => !scheduleCreatedAt || item.getTime() >= scheduleCreatedAt)
    .sort((a, b) => a.getTime() - b.getTime());
};

const buildWeekDays = () => {
  const start = getWeekStart();
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
};

const buildCalendarDays = (monthDate: Date) => {
  const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const firstGridDay = new Date(firstOfMonth);
  firstGridDay.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstGridDay);
    date.setDate(firstGridDay.getDate() + index);
    return date;
  });
};

const buildReason = (day: DailyInsight) => {
  if (!day.hasData) return 'No routine data logged for this day.';
  const statusLabel = DAY_STATUS_META[classifyRoutineDay(day.score, day.hasData)].label;
  const contextNotes: string[] = [];
  if (!day.beverage.hasData && day.medication.hasData) {
    contextNotes.push('Score based on medication records only');
    contextNotes.push('no beverage entries logged for this day');
  } else if (day.beverage.hasData && !day.medication.hasData) {
    contextNotes.push('Score based on beverage entries only');
    contextNotes.push('no medication check-ins logged for this day');
  }
  const reasons: string[] = [];
  if (day.beverage.hasData) {
    if (day.beverage.percent < 50) reasons.push(`beverage intake reached only ${day.beverage.percent}% of the hydration goal`);
    else if (day.beverage.percent < 80) reasons.push(`beverage intake was below goal at ${day.beverage.percent}%`);
    if (day.beverage.caffeineLevel === 'high') reasons.push('high caffeine was logged');
    if (day.beverage.sugarLevel === 'high') reasons.push('high sugar was logged');
  }
  if (day.medication.missed > 0) reasons.push(`${day.medication.missed} medication dose${day.medication.missed === 1 ? '' : 's'} missed`);
  if (day.medication.skipped > 0) reasons.push(`${day.medication.skipped} medication dose${day.medication.skipped === 1 ? '' : 's'} skipped`);
  if (reasons.length === 0) {
    return `${statusLabel}: Based on your logged entries, routine check-ins were consistent.${contextNotes.length ? ` ${contextNotes.join('; ')}.` : ''} Not medical advice.`;
  }
  return `${statusLabel}: Based on your logged entries, score reduced because ${reasons.join(' and ')}.${contextNotes.length ? ` ${contextNotes.join('; ')}.` : ''} Not medical advice.`;
};

const buildDailyInsightForDate = (date: Date, context: DailyInsightContext): DailyInsight => {
  const { beverageLogs, goal, meds, medicationEvents, now } = context;
  const dateKey = getDateKey(date);
  const logs = beverageLogs.filter((entry) => getDateKey(getEntryTime(entry)) === dateKey);
  const totalMl = logs.reduce((sum, entry) => sum + Number(entry?.amount_ml || entry?.logged_ml || 0), 0);
  const percent = goal > 0 ? clampScore((totalMl / goal) * 100) : 0;
  const sugarLevel = highestLevel(logs, 'sugar_level');
  const caffeineLevel = highestLevel(logs, 'caffeine_level');
  const beverageScore = logs.length > 0 ? Math.max(0, percent - levelPenalty(sugarLevel) - levelPenalty(caffeineLevel)) : null;

  const medicationSummary = deriveMedicationSummaryForDate({
    meds: meds as MedicationSummaryMedication[],
    rawHistory: medicationEvents as MedicationSummaryHistoryEntry[],
    date,
    now,
  });
  const finalDayEvents: MedicationEvent[] = medicationSummary.doses.map((dose) => ({
    id: dose.key,
    medId: dose.medId,
    time: dose.time,
    status: dose.status,
    medication_name_snapshot: dose.medicationName,
    dosage_snapshot: dose.dosage,
  }));
  const scheduled = medicationSummary.total;
  const completed = medicationSummary.taken;
  const missed = medicationSummary.missed;
  const skipped = medicationSummary.skipped;
  const adherence = medicationSummary.relevantToday ? medicationSummary.percent : null;
  const loggedMedicationEvents = medicationEvents.filter((entry) => (
    getDateKey(getMedicationDoseTime(entry)) === dateKey &&
    ['completed', 'missed', 'skipped', 'snoozed'].includes(String(entry.status || '').toLowerCase())
  ));
  const medicationScore = adherence === null || loggedMedicationEvents.length === 0 ? null : Math.max(0, adherence - missed * 8 - skipped * 5);
  const availableScores = [beverageScore, medicationScore].filter((score): score is number => score !== null);
  const score = availableScores.length ? clampScore(availableScores.reduce((sum, value) => sum + value, 0) / availableScores.length) : null;
  const hasData = logs.length > 0 || loggedMedicationEvents.length > 0;

  const day: DailyInsight = {
    day: date.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 1),
    date: dateKey,
    title: date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }),
    score,
    status: classifyRoutineDay(score, hasData),
    summary: hasData
      ? [
          logs.length > 0 ? `Beverage ${formatNumber(totalMl)} / ${formatNumber(goal)} ml` : null,
          scheduled > 0 ? `Medication ${completed}/${scheduled} taken${missed ? `, ${missed} missed` : ''}${skipped ? `, ${skipped} skipped` : ''}` : null,
        ].filter(Boolean).join(' | ')
      : 'No routine data logged',
    reason: '',
    hasData,
    beverage: {
      hasData: logs.length > 0,
      totalMl,
      goalMl: goal,
      percent,
      score: beverageScore,
      sugarLevel,
      caffeineLevel,
      highSugar: logs.filter((entry) => levelRank(entry?.sugar_level) === 'high').length,
      highCaffeine: logs.filter((entry) => levelRank(entry?.caffeine_level) === 'high').length,
      logs,
    },
    medication: {
      hasData: loggedMedicationEvents.length > 0,
      scheduled,
      completed,
      missed,
      skipped,
      adherence,
      score: medicationScore,
      events: loggedMedicationEvents.length > 0 ? finalDayEvents : [],
    },
  };
  day.reason = buildReason(day);
  return day;
};

const getDayStatusMeta = (day: DailyInsight) => {
  return DAY_STATUS_META[classifyRoutineDay(day.score, day.hasData)];
};

const getMedicationSummary = (day: DailyInsight) => {
  if (!day.medication.hasData) return 'Med -';
  const issueParts = [
    day.medication.missed > 0 ? `${day.medication.missed} missed` : null,
    day.medication.skipped > 0 ? `${day.medication.skipped} skipped` : null,
  ].filter(Boolean);
  return `Med ${day.medication.completed}/${day.medication.scheduled} taken${issueParts.length ? `, ${issueParts.join(', ')}` : ''}`;
};

const deriveInsights = ({
  hydrationCache,
  medicationCache,
  medicationHistoryCache,
  backendHydration,
  backendMedications,
  backendMedicationHistory,
  deletedMedicationKeys,
  selectedMonthDate,
  sourceLabel,
}: {
  hydrationCache?: any;
  medicationCache?: MedicationItem[] | null;
  medicationHistoryCache?: MedicationEvent[] | null;
  backendHydration?: any;
  backendMedications?: MedicationItem[] | null;
  backendMedicationHistory?: MedicationEvent[] | null;
  deletedMedicationKeys?: Set<string>;
  selectedMonthDate?: Date;
  sourceLabel: string;
}): InsightsData => {
  const hydration = backendHydration || hydrationCache || {};
  const cachedEntries = Array.isArray(hydrationCache?.entries) ? hydrationCache.entries : [];
  const serverEntries = Array.isArray(backendHydration?.entries) ? backendHydration.entries : [];
  const pendingEntries = cachedEntries.filter((entry: any) => entry?.sync_status === 'pending' || entry?.sync_status === 'failed');
  const beverageLogs = dedupeBeverageLogs([...serverEntries, ...cachedEntries, ...pendingEntries]);
  const goal = Math.max(1, Number(hydration?.goal || hydration?.daily_goal_ml || hydration?.hydration_goal || hydration?.daily_hydration_goal || 2000));

  const meds = mergeMedicationRowsForInsights({
    backendMedications,
    localMedications: medicationCache,
    deletedMedicationKeys,
  });
  const medicationEvents = dedupeMedicationEvents([...(backendMedicationHistory || []), ...(medicationHistoryCache || [])].map((entry) => normalizeHistoryEntry(entry)));
  const now = new Date();
  const dailyContext: DailyInsightContext = { beverageLogs, goal, meds, medicationEvents, now };
  const weeklyData = buildWeekDays().map((date) => buildDailyInsightForDate(date, dailyContext));
  const monthDate = selectedMonthDate || now;
  const monthlyData = buildCalendarDays(monthDate).map((date) => buildDailyInsightForDate(date, dailyContext));

  const beverageDays = weeklyData.filter((day) => day.beverage.hasData);
  const beverageScore = beverageDays.length
    ? clampScore((beverageDays.reduce((sum, day) => sum + (day.beverage.score || 0), 0) / beverageDays.length) - (7 - beverageDays.length) * 3)
    : null;
  const medicationDays = weeklyData.filter((day) => day.medication.hasData);
  const scheduledDoses = medicationDays.reduce((sum, day) => sum + day.medication.scheduled, 0);
  const completedDoses = medicationDays.reduce((sum, day) => sum + day.medication.completed, 0);
  const missedDoses = medicationDays.reduce((sum, day) => sum + day.medication.missed, 0);
  const skippedDoses = medicationDays.reduce((sum, day) => sum + day.medication.skipped, 0);
  const medicationAdherence = scheduledDoses > 0 ? clampScore((completedDoses / scheduledDoses) * 100) : null;
  const medicationScore = medicationAdherence === null ? null : Math.max(0, clampScore(medicationAdherence - missedDoses * 4 - skippedDoses * 3));
  const scoreParts = [beverageScore, medicationScore].filter((score): score is number => score !== null);
  const healthScore = scoreParts.length ? clampScore(scoreParts.reduce((sum, score) => sum + score, 0) / scoreParts.length) : null;
  const weeklyBeverageTotal = weeklyData.reduce((sum, day) => sum + day.beverage.totalMl, 0);
  const highSugarDays = weeklyData.filter((day) => day.beverage.sugarLevel === 'high').length;
  const highCaffeineDays = weeklyData.filter((day) => day.beverage.caffeineLevel === 'high').length;
  const lowHydrationDays = beverageDays.filter((day) => day.beverage.percent < 60).length;
  const veryLowHydrationDays = beverageDays.filter((day) => day.beverage.percent < 50).length;
  const actionTips: ActionTip[] = [];

  if (missedDoses > 0 || skippedDoses > 0) {
    actionTips.push({
      label: 'Medication',
      text: `Based on your logged entries, review your medication routine for ${missedDoses} missed dose${missedDoses === 1 ? '' : 's'}${skippedDoses ? ` and ${skippedDoses} skipped` : ''} this week.`,
      color: '#EF4444',
      icon: 'time-outline',
      severity: 1,
    });
  }
  if (veryLowHydrationDays > 0 || lowHydrationDays >= Math.max(2, Math.ceil(beverageDays.length / 2))) {
    const averagePercent = beverageDays.length ? Math.round(beverageDays.reduce((sum, day) => sum + day.beverage.percent, 0) / beverageDays.length) : 0;
    actionTips.push({
      label: 'Beverage',
      text: `Based on your logged entries, consider reviewing your beverage routine. Logged days averaged ${averagePercent}% of your hydration goal.`,
      color: '#2563EB',
      icon: 'water-outline',
      severity: 2,
    });
  }
  if (highCaffeineDays > 0) {
    actionTips.push({
      label: 'Caffeine',
      text: `Based on your logged entries, caffeine was marked high on ${highCaffeineDays} day${highCaffeineDays === 1 ? '' : 's'}.`,
      color: '#B45309',
      icon: 'cafe-outline',
      severity: 3,
    });
  }
  if (highSugarDays > 0) {
    actionTips.push({
      label: 'Sugar',
      text: `Based on your logged entries, sugar was marked high on ${highSugarDays} day${highSugarDays === 1 ? '' : 's'}. Consider reviewing your beverage routine.`,
      color: '#DB2777',
      icon: 'nutrition-outline',
      severity: 4,
    });
  }
  if (beverageDays.length > 0 && beverageDays.length < 4) {
    actionTips.push({
      label: 'Consistency',
      text: `You may want to log beverages more consistently. This week has beverage logs on ${beverageDays.length} of 7 days.`,
      color: '#64748B',
      icon: 'calendar-outline',
      severity: 5,
    });
  }
  if (actionTips.length === 0 && medicationScore !== null && medicationScore >= 85) {
    actionTips.push({
      label: 'Medication',
      text: 'Your medication check-ins look consistent based on logged entries.',
      color: '#10B981',
      icon: 'checkmark-circle-outline',
      severity: 6,
    });
  }
  if (actionTips.length === 0 && healthScore !== null) {
    actionTips.push({
      label: 'Consistency',
      text: 'Your logged routine looks consistent this week. This is a self-monitoring summary and not medical advice.',
      color: '#10B981',
      icon: 'checkmark-circle-outline',
      severity: 7,
    });
  }
  if (actionTips.length === 0) {
    actionTips.push({
      label: 'Consistency',
      text: 'Log beverages and medication check-ins for a few days to build a self-monitoring summary.',
      color: '#2563EB',
      icon: 'sparkles-outline',
      severity: 8,
    });
  }

  const sortedBeverageDays = [...beverageDays].sort((a, b) => b.beverage.totalMl - a.beverage.totalMl);
  return {
    healthScore,
    hasData: scoreParts.length > 0,
    partialLabel: scoreParts.length === 1 ? (beverageScore !== null ? 'Partial score from Beverage data only' : 'Partial score from Medication data only') : 'Beverage and Medication data included',
    hydrationAvg: beverageDays.length ? Math.round(weeklyBeverageTotal / 7) : null,
    weeklyBeverageTotal,
    beverageDaysWithLogs: beverageDays.length,
    medicationAdherence,
    scheduledDoses,
    completedDoses,
    missedDoses,
    skippedDoses,
    beverageScore,
    medicationScore,
    highSugarDays,
    highCaffeineDays,
    bestBeverageDay: sortedBeverageDays[0] || null,
    lowestBeverageDay: sortedBeverageDays[sortedBeverageDays.length - 1] || null,
    beverageLogs: beverageLogs.filter((entry) => weeklyData.some((day) => day.date === getDateKey(getEntryTime(entry)))),
    medicationEvents,
    weeklyData,
    monthlyData,
    actionTips: actionTips.sort((a, b) => a.severity - b.severity).slice(0, 4),
    sourceLabel,
  };
};

interface DetailModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
}

const DetailModal: React.FC<DetailModalProps> = ({ visible, onClose, title, color, icon, children }) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.modalOverlay}>
      <View style={[styles.modalContent, { borderTopColor: color }]}>
        <View style={styles.modalHeader}>
          <View style={[styles.modalIconCircle, { backgroundColor: `${color}20` }]}>
            <Ionicons name={icon} size={30} color={color} />
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#6B7280" />
          </TouchableOpacity>
        </View>
        <Text style={[styles.modalTitle, { color }]}>{title}</Text>
        <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalBodyContent}>
          {children}
        </ScrollView>
        <TouchableOpacity style={[styles.modalButton, { backgroundColor: color }]} onPress={onClose}>
          <Text style={styles.modalButtonText}>Got it</Text>
        </TouchableOpacity>
      </View>
    </View>
  </Modal>
);

export default function InsightsScreen() {
  useFontScaleVersion();
  const { token } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);
  const [insightsData, setInsightsData] = useState<InsightsData | null>(null);
  const [summaryPeriod, setSummaryPeriod] = useState<'weekly' | 'monthly'>('weekly');
  const [selectedMonthDate, setSelectedMonthDate] = useState(new Date());
  const [detailModal, setDetailModal] = useState<'score' | 'beverage' | 'medication' | null>(null);
  const [selectedDay, setSelectedDay] = useState<DailyInsight | null>(null);

  const loadLocalInsights = useCallback(async () => {
    const session = await getCachedSession();
    const activeToken = String(token || session?.token || '');
    const context = await captureAuthSessionContext(activeToken || undefined, session?.user ?? null);
    if (activeToken && !(await isAuthSessionContextCurrent(context))) {
      return {
        session,
        user: null,
        hydrationCache: null,
        medicationCache: null,
        medicationHistoryCache: null,
        deletedMedicationKeys: new Set<string>(),
        data: deriveInsights({ selectedMonthDate, sourceLabel: 'No cache yet' }),
      };
    }
    const sessionMatchesToken = !token || session?.token === activeToken || session?.token === token;
    const user = sessionMatchesToken ? session?.user : null;
    const [hydrationCache, medicationCache, medicationHistoryCache, deletedMedicationKeyList] = await Promise.all([
      sessionMatchesToken ? readHydrationCache<any>() : Promise.resolve(null),
      user ? readMedicationCache<MedicationItem[]>(user) : Promise.resolve(null),
      user ? readMedicationHistoryCache<MedicationEvent[]>(user) : Promise.resolve(null),
      user ? readDeletedMedicationTombstones(user) : Promise.resolve([]),
    ]);
    const deletedMedicationKeys = new Set(deletedMedicationKeyList || []);
    const data = deriveInsights({
      hydrationCache,
      medicationCache,
      medicationHistoryCache,
      deletedMedicationKeys,
      selectedMonthDate,
      sourceLabel: hydrationCache || medicationCache?.length || medicationHistoryCache?.length ? 'Cached on this device' : 'No cache yet',
    });
    setInsightsData(data);
    return { session, user, hydrationCache, medicationCache, medicationHistoryCache, deletedMedicationKeys, data };
  }, [selectedMonthDate, token]);

  const refreshOnline = useCallback(async (local: Awaited<ReturnType<typeof loadLocalInsights>>) => {
    const activeToken = String(token || local.session?.token || '');
    if (!activeToken) return;
    const context = await captureAuthSessionContext(activeToken, local.user ?? null);
    if (!(await isAuthSessionContextCurrent(context))) return;
    setSyncing(true);
    setOfflineNotice(null);
    try {
      const [hydrationResult, medsResult] = await Promise.allSettled([
        api.get('/hydration/history?include_entries=1', activeToken, 5000),
        api.get('/medications', activeToken, 5000),
      ]);
      const backendHydration = hydrationResult.status === 'fulfilled' ? hydrationResult.value : null;
      if (!(await isAuthSessionContextCurrent(context))) return;
      const backendMeds: MedicationItem[] = medsResult.status === 'fulfilled' && Array.isArray(medsResult.value) ? medsResult.value : [];
      const mergedMeds = mergeMedicationRowsForInsights({
        backendMedications: backendMeds,
        localMedications: local.medicationCache,
        deletedMedicationKeys: local.deletedMedicationKeys,
      });
      const refreshFailures = [hydrationResult, medsResult].filter((result) => result.status === 'rejected');
      if (refreshFailures.some((result: any) => api.isNetworkError(result.reason))) {
        setOfflineNotice('Offline mode');
      }
      let backendHistory: MedicationEvent[] = [];
      try {
        const allHistory = await api.get('/medications/history/all', activeToken, 5000);
        if (!(await isAuthSessionContextCurrent(context))) return;
        backendHistory = Array.isArray(allHistory)
          ? allHistory.map((entry: any) => normalizeHistoryEntry(entry, entry?.medication_id || entry?.medication?.id))
          : [];
      } catch (historyError) {
        if (api.isNetworkError(historyError)) {
          setOfflineNotice('Offline mode');
        }
        const historyResults = await Promise.allSettled(
          backendMeds.map(async (med) => {
            const history = await api.get(`/medications/${med.server_id || med.id}/history`, activeToken, 4000);
            return (history || []).map((entry: any) => normalizeHistoryEntry(entry, med.id));
          })
        );
        backendHistory = historyResults.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
      }
      if (!(await isAuthSessionContextCurrent(context))) return;
      if (local.user && (backendMeds.length > 0 || mergedMeds.length > 0)) await writeMedicationCache(local.user, mergedMeds);
      if (local.user) await writeMedicationHistoryCache(local.user, dedupeMedicationEvents([...backendHistory, ...(local.medicationHistoryCache || [])]));
      if (backendHydration) {
        const pendingEntries = Array.isArray(local.hydrationCache?.entries)
          ? local.hydrationCache.entries.filter((entry: any) => entry?.sync_status === 'pending' || entry?.sync_status === 'failed')
          : [];
        await writeHydrationCache({
          ...backendHydration,
          goal: backendHydration.goal || backendHydration.daily_goal_ml || local.hydrationCache?.goal,
          entries: dedupeBeverageLogs([...(backendHydration.entries || []), ...pendingEntries]),
        });
      }
      setInsightsData(deriveInsights({
        hydrationCache: local.hydrationCache,
        medicationCache: local.medicationCache,
        medicationHistoryCache: local.medicationHistoryCache,
        backendHydration,
        backendMedications: mergedMeds,
        backendMedicationHistory: backendHistory,
        deletedMedicationKeys: local.deletedMedicationKeys,
        selectedMonthDate,
        sourceLabel: backendHydration || backendMeds.length || backendHistory.length ? 'Refreshed online' : local.data.sourceLabel,
      }));
    } catch (err) {
      if (!(await isAuthSessionContextCurrent(context))) return;
      if (api.isNetworkError(err)) setOfflineNotice('Offline mode');
    } finally {
      if (await isAuthSessionContextCurrent(context)) setSyncing(false);
    }
  }, [selectedMonthDate, token]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const local = await loadLocalInsights();
        if (cancelled) return;
        setLoading(false);
        void refreshOnline(local);
      } catch {
        if (!cancelled) {
          setInsightsData(deriveInsights({ selectedMonthDate, sourceLabel: 'No cache yet' }));
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [loadLocalInsights, refreshOnline, selectedMonthDate]);

  useEffect(() => {
    const subscription = subscribeHomeRefresh((event) => {
      if (!event?.reason || ['hydration', 'medication', 'history', 'home'].includes(event.reason)) {
        void loadLocalInsights();
      }
    });
    return () => subscription.remove();
  }, [loadLocalInsights]);

  const insights = insightsData;
  const scoreColor = getScoreColor(insights?.healthScore ?? null, insights?.hasData ?? false);
  const routineTips = useMemo(() => insights?.actionTips || [], [insights]);
  const monthTitle = selectedMonthDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const navigateMonth = (direction: 'prev' | 'next') => {
    setSelectedMonthDate((current) => {
      const next = new Date(current);
      next.setMonth(current.getMonth() + (direction === 'next' ? 1 : -1), 1);
      return next;
    });
  };

  if (loading && !insights) {
    return (
      <SafeAreaView edges={[]} style={styles.container}>
        <ScreenHeader title="Routine Insights" subtitle="Patterns from your routine data" showBackButton />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1E3A8A" />
          <Text style={styles.loadingText}>Loading insights...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!insights) return null;

  const hasBeverageData = insights.hydrationAvg !== null;
  const hasMedicationData = insights.medicationEvents.length > 0;

  return (
    <SafeAreaView edges={[]} style={styles.container}>
      <ScreenHeader title="Routine Insights" subtitle="Patterns from your routine data" showBackButton />
      {syncing && <InlineSyncNotice message="Syncing..." top={8} />}
      {!!offlineNotice && (
        <View style={styles.offlineNotice}>
          <Ionicons name="cloud-offline-outline" size={15} color="#1E3A8A" />
          <Text style={styles.offlineNoticeText}>{offlineNotice}</Text>
        </View>
      )}

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <TouchableOpacity activeOpacity={0.82} style={styles.heroCard} onPress={() => setDetailModal('score')}>
          <View style={[styles.scoreCircle, { borderColor: insights.healthScore === null ? '#CBD5E1' : scoreColor }]}>
            <Text
              style={[insights.healthScore === null ? styles.scoreEmptyText : styles.scoreValue, { color: scoreColor }]}
              maxFontSizeMultiplier={FONT_SCALE.stat}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {insights.healthScore === null ? 'No score' : insights.healthScore}
            </Text>
            {insights.healthScore !== null && <Text style={styles.scoreMax} maxFontSizeMultiplier={FONT_SCALE.stat}>/100</Text>}
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroKicker}>Routine Score</Text>
            <Text style={styles.heroTitle}>{getScoreMessage(insights.healthScore, insights.hasData)}</Text>
            <Text style={styles.heroSubtitle}>
              {insights.healthScore === null
                ? 'No routine insights yet. Log beverages and medication activity to build a self-monitoring summary.'
                : `${insights.partialLabel}. ${insights.sourceLabel}.`}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
        </TouchableOpacity>

        <View style={styles.segmentedControl}>
          <TouchableOpacity style={[styles.segmentButton, summaryPeriod === 'weekly' && styles.segmentButtonActive]} onPress={() => setSummaryPeriod('weekly')}>
            <Text style={[styles.segmentText, summaryPeriod === 'weekly' && styles.segmentTextActive]}>Weekly</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.segmentButton, summaryPeriod === 'monthly' && styles.segmentButtonActive]} onPress={() => setSummaryPeriod('monthly')}>
            <Text style={[styles.segmentText, summaryPeriod === 'monthly' && styles.segmentTextActive]}>Monthly</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.highlightsGrid}>
          <TouchableOpacity activeOpacity={0.78} style={[styles.highlightCard, styles.beverageHighlight]} onPress={() => setDetailModal('beverage')}>
            <View style={styles.highlightHeader}>
              <View style={[styles.highlightIconCircle, styles.beverageIconCircle]}>
                <Ionicons name="water" size={18} color="#2563EB" />
              </View>
              <Text style={styles.highlightTitle} numberOfLines={2}>Beverage Intake</Text>
            </View>
            <Text style={[styles.highlightValue, { color: '#2563EB' }]} maxFontSizeMultiplier={FONT_SCALE.stat} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{hasBeverageData ? `${formatNumber(insights.hydrationAvg || 0)} ml` : '-'}</Text>
            <Text style={styles.highlightLabel}>Daily average</Text>
            <Text style={styles.notEnoughText}>{hasBeverageData ? `${insights.beverageDaysWithLogs} of 7 days logged` : 'Not enough data yet'}</Text>
          </TouchableOpacity>

          <TouchableOpacity activeOpacity={0.78} style={[styles.highlightCard, styles.medicationHighlight]} onPress={() => setDetailModal('medication')}>
            <View style={styles.highlightHeader}>
              <View style={[styles.highlightIconCircle, styles.medicationIconCircle]}>
                <Ionicons name="medkit-outline" size={17} color="#EF4444" />
              </View>
              <Text style={styles.highlightTitle} numberOfLines={2}>Medication Adherence</Text>
            </View>
            <Text style={[styles.highlightValue, { color: '#EF4444' }]} maxFontSizeMultiplier={FONT_SCALE.stat} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{insights.medicationAdherence !== null ? `${insights.medicationAdherence}%` : '-'}</Text>
            <Text style={styles.highlightLabel}>adherence</Text>
            <Text style={styles.missedText}>{hasMedicationData ? `${insights.completedDoses}/${insights.scheduledDoses} taken, ${insights.missedDoses} missed` : 'No schedule data yet.'}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.patternCard, { borderColor: routineTips[0]?.color || '#2563EB', backgroundColor: routineTips[0]?.color === '#EF4444' ? '#FEF2F2' : '#EFF6FF' }]}>
          <View style={styles.patternHeader}>
            <View style={[styles.tipIconCircle, { backgroundColor: `${routineTips[0]?.color || '#2563EB'}18` }]}>
              <Ionicons name={(routineTips[0]?.icon || 'list-circle-outline') as any} size={20} color={routineTips[0]?.color || '#2563EB'} />
            </View>
            <Text style={[styles.patternTitle, { color: routineTips[0]?.color || '#2563EB' }]}>Routine Notes</Text>
          </View>
          <View style={styles.tipsList}>
            {routineTips.map((tip) => (
              <View key={tip.text} style={styles.tipRow}>
                <View style={[styles.tipBadge, { backgroundColor: `${tip.color}14`, borderColor: `${tip.color}33` }]}>
                  <Ionicons name={tip.icon as any} size={14} color={tip.color} />
                  <Text style={[styles.tipBadgeText, { color: tip.color }]}>{tip.label}</Text>
                </View>
                <Text style={styles.tipText}>{tip.text}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>{summaryPeriod === 'weekly' ? 'Weekly Summary' : 'Monthly Summary'}</Text>
          {summaryPeriod === 'monthly' ? (
            <>
              <View style={styles.monthHeader}>
                <TouchableOpacity style={styles.monthNavButton} onPress={() => navigateMonth('prev')} activeOpacity={0.78}>
                  <Ionicons name="chevron-back" size={18} color="#1E3A8A" />
                </TouchableOpacity>
                <Text style={styles.monthTitle}>{monthTitle}</Text>
                <TouchableOpacity style={styles.monthNavButton} onPress={() => navigateMonth('next')} activeOpacity={0.78}>
                  <Ionicons name="chevron-forward" size={18} color="#1E3A8A" />
                </TouchableOpacity>
              </View>
              <View style={styles.monthWeekdayRow}>
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, index) => (
                  <Text key={`${label}-${index}`} style={styles.monthWeekday}>{label}</Text>
                ))}
              </View>
              <View style={styles.monthGrid}>
                {insights.monthlyData.map((day) => {
                  const meta = getDayStatusMeta(day);
                  const date = parseDateStringLocal(day.date);
                  const inDisplayedMonth = date.getMonth() === selectedMonthDate.getMonth() && date.getFullYear() === selectedMonthDate.getFullYear();
                  return (
                    <TouchableOpacity
                      key={day.date}
                      style={[
                        styles.monthCell,
                        { backgroundColor: meta.bg, borderColor: meta.border },
                        !inDisplayedMonth && styles.monthCellMuted,
                      ]}
                      activeOpacity={0.78}
                      onPress={() => setSelectedDay(day)}
                    >
                      <Text style={[styles.monthCellDate, !inDisplayedMonth && styles.monthCellDateMuted]} maxFontSizeMultiplier={FONT_SCALE.chip} numberOfLines={1}>{date.getDate()}</Text>
                      <View style={[styles.monthStatusDot, { backgroundColor: meta.color }]} />
                      <Text style={[styles.monthCellScore, { color: meta.color }]} maxFontSizeMultiplier={FONT_SCALE.chip} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{day.score === null ? '-' : day.score}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={styles.legendRow}>
                {[
                  { label: 'Good', color: '#10B981' },
                  { label: 'Warning', color: '#F59E0B' },
                  { label: 'Needs attention', color: '#EF4444' },
                  { label: 'No data', color: '#94A3B8' },
                ].map((item) => (
                  <View key={item.label} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                    <Text style={styles.legendText}>{item.label}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <View style={styles.weeklyTileGrid}>
              {insights.weeklyData.map((day) => {
                const meta = getDayStatusMeta(day);
                const date = parseDateStringLocal(day.date);
                return (
                  <TouchableOpacity
                    key={day.date}
                    style={[styles.weekTile, { backgroundColor: meta.bg, borderColor: meta.border }]}
                    activeOpacity={0.82}
                    onPress={() => setSelectedDay(day)}
                  >
                    <View style={styles.weekTileHeader}>
                      <View>
                        <Text style={styles.weekTileDay}>{day.title.split(',')[0]}</Text>
                        <Text style={styles.weekTileDate}>{date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text>
                      </View>
                      <View style={styles.weekTileScoreWrap}>
                        <Ionicons name={meta.icon as any} size={15} color={meta.color} />
                        <Text style={[styles.weekTileScore, { color: meta.color }]} maxFontSizeMultiplier={FONT_SCALE.stat} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{day.score === null ? '-' : day.score}</Text>
                      </View>
                    </View>
                    <Text style={[styles.weekTileStatus, { color: meta.color }]} numberOfLines={1}>{meta.label}</Text>
                    <View style={styles.weekMetricPill}>
                      <Ionicons name="water-outline" size={13} color="#2563EB" />
                      <Text style={styles.weekMetricText}>Beverage {day.beverage.hasData ? `${day.beverage.percent}%` : '-'}</Text>
                    </View>
                    <View style={[styles.weekMetricPill, styles.weekMedicationPill]}>
                      <Ionicons name="medkit-outline" size={13} color="#EF4444" />
                      <Text style={[styles.weekMetricText, styles.weekMedicationText]} numberOfLines={2}>{getMedicationSummary(day)}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <DetailModal visible={detailModal === 'score'} onClose={() => setDetailModal(null)} title="Routine Score" color={scoreColor} icon="analytics-outline">
        <Text style={styles.modalRecommendation}>Routine Score combines Beverage and Medication when both are available. If only one exists, the score is normalized from that component and marked as partial. This is a self-monitoring summary and not medical advice.</Text>
        <View style={styles.modalStatGrid}>
          <View style={styles.modalStatBox}>
            <Text style={styles.modalStatValue} maxFontSizeMultiplier={FONT_SCALE.stat} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{insights.beverageScore === null ? '-' : insights.beverageScore}</Text>
            <Text style={styles.modalStatLabel}>Beverage score</Text>
          </View>
          <View style={styles.modalStatBox}>
            <Text style={styles.modalStatValue} maxFontSizeMultiplier={FONT_SCALE.stat} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{insights.medicationScore === null ? '-' : insights.medicationScore}</Text>
            <Text style={styles.modalStatLabel}>Medication score</Text>
          </View>
        </View>
        <Text style={styles.modalSectionLabel}>Contributors</Text>
        <Text style={styles.modalListText}>Beverage: hydration progress capped at 100%, minus sugar/caffeine penalties.</Text>
        <Text style={styles.modalListText}>Medication: completed doses divided by scheduled doses, reduced by missed/skipped doses.</Text>
        <Text style={[styles.modalListText, styles.modalSpacer]}>{insights.partialLabel}.</Text>
      </DetailModal>

      <DetailModal visible={detailModal === 'beverage'} onClose={() => setDetailModal(null)} title="Beverage Intake" color="#2563EB" icon="water">
        <View style={styles.modalStatGrid}>
          <View style={styles.modalStatBox}>
            <Text style={styles.modalStatValue} maxFontSizeMultiplier={FONT_SCALE.stat} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{formatNumber(insights.weeklyBeverageTotal)} ml</Text>
            <Text style={styles.modalStatLabel}>weekly total</Text>
          </View>
          <View style={styles.modalStatBox}>
            <Text style={styles.modalStatValue} maxFontSizeMultiplier={FONT_SCALE.stat} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{insights.hydrationAvg === null ? '-' : `${formatNumber(insights.hydrationAvg)} ml`}</Text>
            <Text style={styles.modalStatLabel}>daily average</Text>
          </View>
        </View>
        <Text style={styles.modalSectionLabel}>Weekly detail</Text>
        <Text style={styles.modalListText}>Best day: {insights.bestBeverageDay ? `${insights.bestBeverageDay.title} (${formatNumber(insights.bestBeverageDay.beverage.totalMl)} ml)` : 'No data yet'}</Text>
        <Text style={styles.modalListText}>Lowest logged day: {insights.lowestBeverageDay ? `${insights.lowestBeverageDay.title} (${formatNumber(insights.lowestBeverageDay.beverage.totalMl)} ml)` : 'No data yet'}</Text>
        <Text style={styles.modalListText}>High sugar days: {insights.highSugarDays}</Text>
        <Text style={[styles.modalListText, styles.modalSpacer]}>High caffeine days: {insights.highCaffeineDays}</Text>
      </DetailModal>

      <DetailModal visible={detailModal === 'medication'} onClose={() => setDetailModal(null)} title="Medication Adherence" color="#EF4444" icon="medkit-outline">
        <View style={styles.modalStatGrid}>
          <View style={styles.modalStatBox}>
            <Text style={styles.modalStatValue} maxFontSizeMultiplier={FONT_SCALE.stat} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{insights.completedDoses}/{insights.scheduledDoses}</Text>
            <Text style={styles.modalStatLabel}>taken</Text>
          </View>
          <View style={styles.modalStatBox}>
            <Text style={styles.modalStatValue} maxFontSizeMultiplier={FONT_SCALE.stat} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{insights.missedDoses + insights.skippedDoses}</Text>
            <Text style={styles.modalStatLabel}>missed/skipped</Text>
          </View>
        </View>
        <Text style={styles.modalSectionLabel}>Recent missed or skipped</Text>
        {insights.medicationEvents.filter((entry) => ['missed', 'skipped'].includes(String(entry.status))).slice(0, 4).length > 0 ? (
          insights.medicationEvents.filter((entry) => ['missed', 'skipped'].includes(String(entry.status))).slice(0, 4).map((entry) => (
            <View key={String(entry.id || getDoseMinuteKey(entry))} style={styles.modalListRow}>
              <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
              <Text style={styles.modalListText}>{String(entry.status)} | {formatShortDate(getMedicationDoseTime(entry))}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.modalEmptyText}>No missed or skipped medication entries available for this week.</Text>
        )}
      </DetailModal>

      <DetailModal visible={!!selectedDay} onClose={() => setSelectedDay(null)} title={selectedDay?.title || 'Daily Summary'} color={selectedDay ? getScoreColor(selectedDay.score, selectedDay.hasData) : '#2563EB'} icon="calendar-outline">
        {selectedDay && (
          <>
            {!selectedDay.hasData ? (
              <Text style={styles.modalEmptyText}>No routine data logged for this day.</Text>
            ) : (
              <>
                <View style={styles.modalListRow}>
                  <Ionicons name="water-outline" size={16} color="#2563EB" />
                  <Text style={styles.modalListText}>
                    {selectedDay.beverage.hasData
                      ? `Beverage intake: ${formatNumber(selectedDay.beverage.totalMl)} / ${formatNumber(selectedDay.beverage.goalMl)} ml - ${selectedDay.beverage.percent}%`
                      : 'Beverage intake: no entries logged'}
                  </Text>
                </View>
                <View style={styles.modalListRow}>
                  <Ionicons name="nutrition-outline" size={16} color="#DB2777" />
                  <Text style={styles.modalListText}>Sugar level: {selectedDay.beverage.hasData ? selectedDay.beverage.sugarLevel : 'No data yet'}</Text>
                </View>
                <View style={styles.modalListRow}>
                  <Ionicons name="cafe-outline" size={16} color="#B45309" />
                  <Text style={styles.modalListText}>Caffeine level: {selectedDay.beverage.hasData ? selectedDay.beverage.caffeineLevel : 'No data yet'}</Text>
                </View>
                <View style={styles.modalListRow}>
                  <Ionicons name="medkit-outline" size={16} color="#EF4444" />
                  <Text style={styles.modalListText}>
                    {selectedDay.medication.hasData
                      ? `Medication: ${selectedDay.medication.completed} taken, ${selectedDay.medication.missed} missed, ${selectedDay.medication.skipped} skipped of ${selectedDay.medication.scheduled} scheduled`
                      : 'Medication: no check-ins logged'}
                  </Text>
                </View>
                <Text style={styles.modalSectionLabel}>Score reason</Text>
                <Text style={styles.modalListText}>{selectedDay.reason}</Text>
                <Text style={styles.modalSectionLabel}>Beverage entries</Text>
                {selectedDay.beverage.logs.length > 0 ? (
                  selectedDay.beverage.logs.slice(0, 5).map((entry, index) => (
                    <View key={`${getEntryTime(entry)}-${index}`} style={styles.modalListRow}>
                      <Ionicons name="water-outline" size={16} color="#2563EB" />
                      <Text style={styles.modalListText}>
                        {formatNumber(Number(entry?.amount_ml || entry?.logged_ml || 0))} ml
                        {entry?.drink_label ? ` - ${entry.drink_label}` : ''}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.modalEmptyText}>No beverage entries logged for this day.</Text>
                )}
                <Text style={styles.modalSectionLabel}>Medication check-ins</Text>
                {selectedDay.medication.events.filter((entry) => String(entry.status).toLowerCase() !== 'snoozed').length > 0 ? (
                  selectedDay.medication.events
                    .filter((entry) => String(entry.status).toLowerCase() !== 'snoozed')
                    .slice(0, 6)
                    .map((entry) => {
                      const status = String(entry.status || 'recorded').toLowerCase();
                      const isIssue = status === 'missed' || status === 'skipped';
                      return (
                        <View key={String(entry.id || getDoseMinuteKey(entry))} style={styles.modalListRow}>
                          <Ionicons name={isIssue ? 'alert-circle-outline' : 'checkmark-circle-outline'} size={16} color={isIssue ? '#EF4444' : '#10B981'} />
                          <Text style={styles.modalListText}>{status} | {formatShortDate(getMedicationDoseTime(entry))}</Text>
                        </View>
                      );
                    })
                ) : (
                  <Text style={styles.modalEmptyText}>No medication check-ins logged for this day.</Text>
                )}
              </>
            )}
          </>
        )}
      </DetailModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#6B7280', fontSize: 14 },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8 },
  offlineNotice: { flexDirection: 'row', alignItems: 'center', gap: 7, marginHorizontal: 20, marginTop: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' },
  offlineNoticeText: { flex: 1, color: '#1E3A8A', fontSize: 12, fontWeight: '800', lineHeight: 17 },
  heroCard: { backgroundColor: 'white', borderRadius: 18, padding: 16, marginBottom: 14, alignItems: 'center', flexDirection: 'row', borderWidth: 1, borderColor: '#DBEAFE', shadowColor: '#1E3A8A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  scoreCircle: { width: 96, height: 96, borderRadius: 48, borderWidth: 6, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  scoreValue: { fontSize: 36, fontWeight: '800' },
  scoreEmptyText: { fontSize: 16, lineHeight: 20, fontWeight: '900', textAlign: 'center' },
  scoreMax: { fontSize: 16, fontWeight: '600', color: '#6B7280' },
  heroCopy: { flex: 1 },
  heroKicker: { fontSize: 12, fontWeight: '800', color: '#2563EB', marginBottom: 4 },
  heroTitle: { fontSize: 18, fontWeight: '800', color: '#1F2937', marginBottom: 6 },
  heroSubtitle: { fontSize: 13, color: '#6B7280', lineHeight: 18 },
  segmentedControl: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 999, padding: 5, marginBottom: 16, borderWidth: 1, borderColor: '#DBEAFE', shadowColor: '#1E3A8A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  segmentButton: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 999 },
  segmentButtonActive: { backgroundColor: '#2563EB', shadowColor: '#2563EB', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 2 },
  segmentText: { fontSize: 13, fontWeight: '800', color: '#64748B' },
  segmentTextActive: { color: '#FFFFFF' },
  highlightsGrid: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  highlightCard: { flex: 1, backgroundColor: 'white', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#DBEAFE', shadowColor: '#1E3A8A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, minHeight: 126, overflow: 'hidden' },
  beverageHighlight: { borderLeftWidth: 4, borderLeftColor: '#2563EB' },
  medicationHighlight: { borderLeftWidth: 4, borderLeftColor: '#EF4444', borderColor: '#FECACA', shadowColor: '#EF4444' },
  highlightHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  highlightIconCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  beverageIconCircle: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  medicationIconCircle: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  highlightTitle: { flex: 1, fontSize: 12, fontWeight: '800', color: '#6B7280', lineHeight: 16 },
  highlightValue: { fontSize: 24, fontWeight: '800', marginBottom: 2 },
  highlightLabel: { fontSize: 12, color: '#9CA3AF', marginBottom: 6 },
  missedText: { fontSize: 12, color: '#B91C1C', fontWeight: '700', lineHeight: 16, flexShrink: 1 },
  notEnoughText: { fontSize: 12, color: '#64748B', fontWeight: '700', lineHeight: 16 },
  patternCard: { borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderLeftWidth: 4, shadowColor: '#1E3A8A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 },
  patternHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  tipIconCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  patternTitle: { fontSize: 17, fontWeight: '800' },
  tipsList: { gap: 9, marginBottom: 4 },
  tipRow: { gap: 7, paddingVertical: 2 },
  tipBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  tipBadgeText: { fontSize: 11, fontWeight: '900' },
  tipText: { fontSize: 13, color: '#475569', lineHeight: 19, fontWeight: '600' },
  chartCard: { backgroundColor: 'white', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#DBEAFE', shadowColor: '#1E3A8A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  chartTitle: { fontSize: 17, fontWeight: '800', color: '#1F2937', marginBottom: 14 },
  weeklyTileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  weekTile: { width: '31.5%', minHeight: 142, borderRadius: 14, borderWidth: 1, padding: 9 },
  weekTileHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 6, marginBottom: 6, flexWrap: 'wrap' },
  weekTileDay: { color: '#0F172A', fontSize: 12, fontWeight: '900' },
  weekTileDate: { color: '#64748B', fontSize: 11, fontWeight: '800', marginTop: 1 },
  weekTileScoreWrap: { alignItems: 'center', minWidth: 30, maxWidth: '100%', gap: 2 },
  weekTileScore: { fontSize: 16, fontWeight: '900' },
  weekTileStatus: { fontSize: 10, fontWeight: '900', marginBottom: 7 },
  weekMetricPill: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', paddingHorizontal: 6, paddingVertical: 5, marginTop: 5 },
  weekMetricText: { flex: 1, color: '#1E3A8A', fontSize: 10, lineHeight: 13, fontWeight: '900' },
  weekMedicationPill: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  weekMedicationText: { color: '#B91C1C' },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  monthNavButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', alignItems: 'center', justifyContent: 'center' },
  monthTitle: { color: '#0F172A', fontSize: 16, fontWeight: '900' },
  monthWeekdayRow: { flexDirection: 'row', marginBottom: 6 },
  monthWeekday: { flex: 1, textAlign: 'center', color: '#64748B', fontSize: 11, fontWeight: '900' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  monthCell: { width: '12.9%', aspectRatio: 0.86, borderRadius: 10, borderWidth: 1, padding: 4, alignItems: 'center', justifyContent: 'space-between' },
  monthCellMuted: { opacity: 0.46 },
  monthCellDate: { color: '#0F172A', fontSize: 11, fontWeight: '900' },
  monthCellDateMuted: { color: '#94A3B8' },
  monthStatusDot: { width: 7, height: 7, borderRadius: 4 },
  monthCellScore: { fontSize: 10, fontWeight: '900' },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12, alignItems: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: '#64748B', fontSize: 11, fontWeight: '800' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 20, padding: 24, width: '100%', maxWidth: 380, maxHeight: '86%', borderTopWidth: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 10 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalIconCircle: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  closeButton: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  modalBody: { maxHeight: 430 },
  modalBodyContent: { paddingBottom: 4 },
  modalRecommendation: { fontSize: 14, color: '#4B5563', lineHeight: 21, marginBottom: 16 },
  modalSectionLabel: { fontSize: 12, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },
  modalStatGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  modalStatBox: { flex: 1, minWidth: 130, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  modalStatValue: { fontSize: 16, fontWeight: '800', color: '#1F2937', marginBottom: 4 },
  modalStatLabel: { fontSize: 12, color: '#64748B', fontWeight: '700' },
  modalListRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  modalListText: { fontSize: 13, color: '#475569', fontWeight: '600', lineHeight: 18 },
  modalSpacer: { marginTop: 8, marginBottom: 8 },
  modalEmptyText: { fontSize: 13, color: '#64748B', lineHeight: 19, marginBottom: 8 },
  modalButton: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', marginTop: 12 },
  modalButtonText: { fontSize: 16, fontWeight: '600', color: 'white' },
});
