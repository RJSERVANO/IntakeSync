import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as api from './api';
import ScreenHeader from './components/common/ScreenHeader';
import InlineSyncNotice from './components/common/InlineSyncNotice';
import {
  getCachedSession,
  readHydrationCache,
  readMedicationCache,
  readMedicationHistoryCache,
  writeHydrationCache,
  writeMedicationCache,
  writeMedicationHistoryCache,
} from '../services/offlineStorage';

type BeverageLevel = 'none' | 'low' | 'medium' | 'high';
type MedicationStatus = 'completed' | 'skipped' | 'missed' | 'snoozed';
type DayStatus = 'good' | 'warning' | 'attention' | 'empty';

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
  deleted_at?: string | null;
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
  historyByDose: Map<string, MedicationEvent>;
  now: Date;
};

const MISSED_DOSE_GRACE_MS = 60 * 1000;
const SCORE_COLORS = {
  empty: '#64748B',
  attention: '#EF4444',
  warning: '#F59E0B',
  good: '#10B981',
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

const getStatusForScore = (score: number | null): DayStatus => {
  if (score === null) return 'empty';
  if (score <= 39) return 'attention';
  if (score <= 69) return 'warning';
  return 'good';
};

const getScoreMessage = (score: number | null) => {
  if (score === null) return 'No score yet';
  if (score <= 39) return 'Needs attention';
  if (score <= 69) return 'Some progress';
  if (score <= 89) return 'Good routine progress';
  return 'Strong routine consistency';
};

const getScoreColor = (score: number | null) => {
  if (score === null) return SCORE_COLORS.empty;
  return SCORE_COLORS[getStatusForScore(score)];
};

const normalizeHistoryEntry = (entry: any, medId?: string | number): MedicationEvent => ({
  ...entry,
  id: entry?.id?.toString?.() || entry?.local_id || `${medId || getMedicationId(entry)}:${getMedicationDoseTime(entry)}:${entry?.status || 'recorded'}`,
  medId: entry?.medId || entry?.medication_id || medId,
  time: entry?.time || entry?.scheduled_time || entry?.scheduled_at,
  status: entry?.status,
  loggedAt: entry?.loggedAt || entry?.logged_at || entry?.taken_time || entry?.taken_at || entry?.completed_at || entry?.created_at || entry?.updated_at,
});

const isMedicationScheduledOnDate = (med: MedicationItem, date: Date) => {
  if (!med.times?.length || med.deleted_at || med.reminder === false) return false;
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  if (med.start_date && parseDateStringLocal(med.start_date).getTime() > dayStart.getTime()) return false;
  if (med.end_date) {
    const end = parseDateStringLocal(med.end_date);
    end.setHours(23, 59, 59, 999);
    if (end.getTime() < dayStart.getTime()) return false;
  }
  if (med.frequency === 'weekly' && med.days_of_week?.length) return med.days_of_week.includes(date.getDay());
  return true;
};

const getMedicationDoseOccurrencesForDate = (med: MedicationItem, date: Date) => {
  if (!isMedicationScheduledOnDate(med, date)) return [];
  return (med.times || [])
    .map((time) => {
      const source = new Date(time);
      if (Number.isNaN(source.getTime())) return null;
      const occurrence = new Date(date);
      occurrence.setHours(source.getHours(), source.getMinutes(), source.getSeconds(), 0);
      return occurrence;
    })
    .filter((item): item is Date => !!item)
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
  const reasons: string[] = [];
  if (day.beverage.hasData) {
    if (day.beverage.percent < 50) reasons.push(`beverage intake reached only ${day.beverage.percent}% of the hydration goal`);
    else if (day.beverage.percent < 80) reasons.push(`beverage intake was below goal at ${day.beverage.percent}%`);
    if (day.beverage.caffeineLevel === 'high') reasons.push('high caffeine was logged');
    if (day.beverage.sugarLevel === 'high') reasons.push('high sugar was logged');
  }
  if (day.medication.missed > 0) reasons.push(`${day.medication.missed} medication dose${day.medication.missed === 1 ? '' : 's'} missed`);
  if (day.medication.skipped > 0) reasons.push(`${day.medication.skipped} medication dose${day.medication.skipped === 1 ? '' : 's'} skipped`);
  if (reasons.length === 0) return 'Score is strong because logged beverage progress and medication check-ins were consistent.';
  return `Score reduced because ${reasons.join(' and ')}.`;
};

const buildDailyInsightForDate = (date: Date, context: DailyInsightContext): DailyInsight => {
  const { beverageLogs, goal, meds, medicationEvents, historyByDose, now } = context;
  const dateKey = getDateKey(date);
  const logs = beverageLogs.filter((entry) => getDateKey(getEntryTime(entry)) === dateKey);
  const totalMl = logs.reduce((sum, entry) => sum + Number(entry?.amount_ml || entry?.logged_ml || 0), 0);
  const percent = goal > 0 ? clampScore((totalMl / goal) * 100) : 0;
  const sugarLevel = highestLevel(logs, 'sugar_level');
  const caffeineLevel = highestLevel(logs, 'caffeine_level');
  const beverageScore = logs.length > 0 ? Math.max(0, percent - levelPenalty(sugarLevel) - levelPenalty(caffeineLevel)) : null;

  const dayEvents: MedicationEvent[] = [];
  meds.forEach((med) => {
    getMedicationDoseOccurrencesForDate(med, date).forEach((occurrence) => {
      const occurrenceIso = occurrence.toISOString();
      const key = getDoseMinuteKey({ medId: med.id, time: occurrenceIso });
      const existing = historyByDose.get(key);
      const isDue = occurrence.getTime() + MISSED_DOSE_GRACE_MS < now.getTime();
      if (existing) {
        dayEvents.push(existing);
      } else if (isDue) {
        dayEvents.push({ id: key, medId: med.id, time: occurrenceIso, status: 'missed' });
      } else if (getDateKey(now) === dateKey) {
        dayEvents.push({ id: key, medId: med.id, time: occurrenceIso, status: 'snoozed' });
      }
    });
  });
  medicationEvents
    .filter((entry) => getDateKey(getMedicationDoseTime(entry)) === dateKey)
    .forEach((entry) => {
      if (!dayEvents.some((item) => getDoseMinuteKey(item) === getDoseMinuteKey(entry))) dayEvents.push(entry);
    });

  const finalDayEvents = dedupeMedicationEvents(dayEvents);
  const scheduled = finalDayEvents.filter((entry) => String(entry.status).toLowerCase() !== 'snoozed').length;
  const completed = finalDayEvents.filter((entry) => String(entry.status).toLowerCase() === 'completed').length;
  const missed = finalDayEvents.filter((entry) => String(entry.status).toLowerCase() === 'missed').length;
  const skipped = finalDayEvents.filter((entry) => String(entry.status).toLowerCase() === 'skipped').length;
  const adherence = scheduled > 0 ? clampScore((completed / scheduled) * 100) : null;
  const medicationScore = adherence === null ? null : Math.max(0, adherence - missed * 8 - skipped * 5);
  const availableScores = [beverageScore, medicationScore].filter((score): score is number => score !== null);
  const score = availableScores.length ? clampScore(availableScores.reduce((sum, value) => sum + value, 0) / availableScores.length) : null;
  const hasData = logs.length > 0 || scheduled > 0;

  const day: DailyInsight = {
    day: date.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 1),
    date: dateKey,
    title: date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }),
    score,
    status: getStatusForScore(score),
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
      hasData: scheduled > 0,
      scheduled,
      completed,
      missed,
      skipped,
      adherence,
      score: medicationScore,
      events: finalDayEvents,
    },
  };
  day.reason = buildReason(day);
  return day;
};

const getDayStatusMeta = (day: DailyInsight) => {
  if (!day.hasData || day.score === null) {
    return { label: 'No data', color: '#94A3B8', bg: '#F8FAFC', border: '#E2E8F0', icon: 'ellipse-outline' as const };
  }
  if (day.score >= 85 && day.medication.missed === 0 && day.medication.skipped === 0) {
    return { label: 'Excellent', color: '#10B981', bg: '#ECFDF5', border: '#BBF7D0', icon: 'checkmark-circle' as const };
  }
  if (day.score >= 70 && day.medication.missed === 0 && day.medication.skipped === 0) {
    return { label: 'Good', color: '#10B981', bg: '#ECFDF5', border: '#BBF7D0', icon: 'checkmark-circle-outline' as const };
  }
  if (day.score <= 39 || day.medication.missed > 0 || day.medication.skipped > 0 || (day.beverage.hasData && day.beverage.percent < 50)) {
    return { label: 'Needs attention', color: '#EF4444', bg: '#FEF2F2', border: '#FECACA', icon: 'warning-outline' as const };
  }
  return { label: 'Warning', color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A', icon: 'alert-circle-outline' as const };
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
  selectedMonthDate,
  sourceLabel,
}: {
  hydrationCache?: any;
  medicationCache?: MedicationItem[] | null;
  medicationHistoryCache?: MedicationEvent[] | null;
  backendHydration?: any;
  backendMedications?: MedicationItem[] | null;
  backendMedicationHistory?: MedicationEvent[] | null;
  selectedMonthDate?: Date;
  sourceLabel: string;
}): InsightsData => {
  const hydration = backendHydration || hydrationCache || {};
  const cachedEntries = Array.isArray(hydrationCache?.entries) ? hydrationCache.entries : [];
  const serverEntries = Array.isArray(backendHydration?.entries) ? backendHydration.entries : [];
  const pendingEntries = cachedEntries.filter((entry: any) => entry?.sync_status === 'pending' || entry?.sync_status === 'failed');
  const beverageLogs = dedupeBeverageLogs([...serverEntries, ...cachedEntries, ...pendingEntries]);
  const goal = Math.max(1, Number(hydration?.goal || hydration?.daily_goal_ml || hydration?.hydration_goal || hydration?.daily_hydration_goal || 2000));

  const meds = (backendMedications?.length ? backendMedications : medicationCache || []).map((med) => ({
    ...med,
    id: med.id?.toString?.() || med.local_id?.toString?.() || String(med.id),
  }));
  const medicationEvents = dedupeMedicationEvents([...(backendMedicationHistory || []), ...(medicationHistoryCache || [])].map((entry) => normalizeHistoryEntry(entry)));
  const historyByDose = new Map(medicationEvents.map((entry) => [getDoseMinuteKey(entry), entry]));
  const now = new Date();
  const dailyContext: DailyInsightContext = { beverageLogs, goal, meds, medicationEvents, historyByDose, now };
  const weeklyData = buildWeekDays().map((date) => buildDailyInsightForDate(date, dailyContext));
  const monthDate = selectedMonthDate || now;
  const monthlyData = buildCalendarDays(monthDate).map((date) => buildDailyInsightForDate(date, dailyContext));

  const beverageDays = weeklyData.filter((day) => day.beverage.hasData);
  const beverageScore = beverageDays.length
    ? clampScore((beverageDays.reduce((sum, day) => sum + (day.beverage.score || 0), 0) / beverageDays.length) - (7 - beverageDays.length) * 3)
    : null;
  const scheduledDoses = weeklyData.reduce((sum, day) => sum + day.medication.scheduled, 0);
  const completedDoses = weeklyData.reduce((sum, day) => sum + day.medication.completed, 0);
  const missedDoses = weeklyData.reduce((sum, day) => sum + day.medication.missed, 0);
  const skippedDoses = weeklyData.reduce((sum, day) => sum + day.medication.skipped, 0);
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
      text: `Review medication reminder times. You missed ${missedDoses} dose${missedDoses === 1 ? '' : 's'}${skippedDoses ? ` and skipped ${skippedDoses}` : ''} this week.`,
      color: '#EF4444',
      icon: 'time-outline',
      severity: 1,
    });
  }
  if (veryLowHydrationDays > 0 || lowHydrationDays >= Math.max(2, Math.ceil(beverageDays.length / 2))) {
    const averagePercent = beverageDays.length ? Math.round(beverageDays.reduce((sum, day) => sum + day.beverage.percent, 0) / beverageDays.length) : 0;
    actionTips.push({
      label: 'Beverage',
      text: `Increase water intake earlier in the day. You averaged ${averagePercent}% of your hydration goal on logged days.`,
      color: '#2563EB',
      icon: 'water-outline',
      severity: 2,
    });
  }
  if (highCaffeineDays > 0) {
    actionTips.push({
      label: 'Caffeine',
      text: `Monitor caffeine intake. High caffeine was logged on ${highCaffeineDays} day${highCaffeineDays === 1 ? '' : 's'}.`,
      color: '#B45309',
      icon: 'cafe-outline',
      severity: 3,
    });
  }
  if (highSugarDays > 0) {
    actionTips.push({
      label: 'Sugar',
      text: `Reduce high-sugar drinks. Your beverage logs show high sugar intake on ${highSugarDays} day${highSugarDays === 1 ? '' : 's'}.`,
      color: '#DB2777',
      icon: 'nutrition-outline',
      severity: 4,
    });
  }
  if (beverageDays.length > 0 && beverageDays.length < 4) {
    actionTips.push({
      label: 'Consistency',
      text: `Log beverages more consistently. This week has beverage logs on ${beverageDays.length} of 7 days.`,
      color: '#64748B',
      icon: 'calendar-outline',
      severity: 5,
    });
  }
  if (actionTips.length === 0 && medicationScore !== null && medicationScore >= 85) {
    actionTips.push({
      label: 'Medication',
      text: 'Medication adherence is consistent. Keep marking doses as taken.',
      color: '#10B981',
      icon: 'checkmark-circle-outline',
      severity: 6,
    });
  }
  if (actionTips.length === 0 && healthScore !== null) {
    actionTips.push({
      label: 'Consistency',
      text: 'Your routine looks consistent this week. Keep logging beverages and medication check-ins.',
      color: '#10B981',
      icon: 'checkmark-circle-outline',
      severity: 7,
    });
  }
  if (actionTips.length === 0) {
    actionTips.push({
      label: 'Consistency',
      text: 'Log beverages and medication check-ins for a few days to unlock personalized insights.',
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
    const sessionMatchesToken = !token || session?.token === activeToken || session?.token === token;
    const user = sessionMatchesToken ? session?.user : null;
    const [hydrationCache, medicationCache, medicationHistoryCache] = await Promise.all([
      sessionMatchesToken ? readHydrationCache<any>() : Promise.resolve(null),
      user ? readMedicationCache<MedicationItem[]>(user) : Promise.resolve(null),
      user ? readMedicationHistoryCache<MedicationEvent[]>(user) : Promise.resolve(null),
    ]);
    const data = deriveInsights({
      hydrationCache,
      medicationCache,
      medicationHistoryCache,
      selectedMonthDate,
      sourceLabel: hydrationCache || medicationCache?.length || medicationHistoryCache?.length ? 'Cached on this device' : 'No cache yet',
    });
    setInsightsData(data);
    return { session, user, hydrationCache, medicationCache, medicationHistoryCache, data };
  }, [selectedMonthDate, token]);

  const refreshOnline = useCallback(async (local: Awaited<ReturnType<typeof loadLocalInsights>>) => {
    const activeToken = String(token || local.session?.token || '');
    if (!activeToken) return;
    setSyncing(true);
    setOfflineNotice(null);
    try {
      const [hydrationResult, medsResult] = await Promise.allSettled([
        api.get('/hydration', activeToken, 5000),
        api.get('/medications', activeToken, 5000),
      ]);
      const backendHydration = hydrationResult.status === 'fulfilled' ? hydrationResult.value : null;
      const backendMeds: MedicationItem[] = medsResult.status === 'fulfilled' && Array.isArray(medsResult.value) ? medsResult.value : [];
      const refreshFailures = [hydrationResult, medsResult].filter((result) => result.status === 'rejected');
      if (refreshFailures.some((result: any) => api.isNetworkError(result.reason))) {
        setOfflineNotice('Offline mode - showing routine insights saved on this device.');
      }
      const historyResults = await Promise.allSettled(
        backendMeds.map(async (med) => {
          const history = await api.get(`/medications/${med.server_id || med.id}/history`, activeToken, 4000);
          return (history || []).map((entry: any) => normalizeHistoryEntry(entry, med.id));
        })
      );
      const backendHistory = historyResults.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
      if (local.user && backendMeds.length > 0) await writeMedicationCache(local.user, backendMeds);
      if (local.user && backendHistory.length > 0) await writeMedicationHistoryCache(local.user, dedupeMedicationEvents([...backendHistory, ...(local.medicationHistoryCache || [])]));
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
        backendMedications: backendMeds,
        backendMedicationHistory: backendHistory,
        selectedMonthDate,
        sourceLabel: backendHydration || backendMeds.length || backendHistory.length ? 'Refreshed online' : local.data.sourceLabel,
      }));
    } catch (err) {
      if (api.isNetworkError(err)) setOfflineNotice('Offline mode - showing routine insights saved on this device.');
    } finally {
      setSyncing(false);
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

  const insights = insightsData;
  const scoreColor = getScoreColor(insights?.healthScore ?? null);
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
  const hasMedicationData = insights.scheduledDoses > 0;

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
            <Text style={[insights.healthScore === null ? styles.scoreEmptyText : styles.scoreValue, { color: scoreColor }]}>
              {insights.healthScore === null ? 'No score' : insights.healthScore}
            </Text>
            {insights.healthScore !== null && <Text style={styles.scoreMax}>/100</Text>}
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroKicker}>Routine Score</Text>
            <Text style={styles.heroTitle}>{getScoreMessage(insights.healthScore)}</Text>
            <Text style={styles.heroSubtitle}>
              {insights.healthScore === null
                ? 'No routine insights yet. Log beverages and medication activity to build your routine summary.'
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
            <Text style={[styles.highlightValue, { color: '#2563EB' }]}>{hasBeverageData ? `${formatNumber(insights.hydrationAvg || 0)} ml` : '-'}</Text>
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
            <Text style={[styles.highlightValue, { color: '#EF4444' }]}>{insights.medicationAdherence !== null ? `${insights.medicationAdherence}%` : '-'}</Text>
            <Text style={styles.highlightLabel}>adherence</Text>
            <Text style={styles.missedText}>{hasMedicationData ? `${insights.completedDoses}/${insights.scheduledDoses} taken, ${insights.missedDoses} missed` : 'No schedule data yet.'}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.patternCard, { borderColor: routineTips[0]?.color || '#2563EB', backgroundColor: routineTips[0]?.color === '#EF4444' ? '#FEF2F2' : '#EFF6FF' }]}>
          <View style={styles.patternHeader}>
            <View style={[styles.tipIconCircle, { backgroundColor: `${routineTips[0]?.color || '#2563EB'}18` }]}>
              <Ionicons name={(routineTips[0]?.icon || 'list-circle-outline') as any} size={20} color={routineTips[0]?.color || '#2563EB'} />
            </View>
            <Text style={[styles.patternTitle, { color: routineTips[0]?.color || '#2563EB' }]}>Action Plan</Text>
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
                      <Text style={[styles.monthCellDate, !inDisplayedMonth && styles.monthCellDateMuted]}>{date.getDate()}</Text>
                      <View style={[styles.monthStatusDot, { backgroundColor: meta.color }]} />
                      <Text style={[styles.monthCellScore, { color: meta.color }]}>{day.score === null ? '-' : day.score}</Text>
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
                        <Text style={[styles.weekTileScore, { color: meta.color }]}>{day.score === null ? '-' : day.score}</Text>
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
        <Text style={styles.modalRecommendation}>Routine Score combines Beverage and Medication when both are available. If only one exists, the score is normalized from that component and marked as partial.</Text>
        <View style={styles.modalStatGrid}>
          <View style={styles.modalStatBox}>
            <Text style={styles.modalStatValue}>{insights.beverageScore === null ? '-' : insights.beverageScore}</Text>
            <Text style={styles.modalStatLabel}>Beverage score</Text>
          </View>
          <View style={styles.modalStatBox}>
            <Text style={styles.modalStatValue}>{insights.medicationScore === null ? '-' : insights.medicationScore}</Text>
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
            <Text style={styles.modalStatValue}>{formatNumber(insights.weeklyBeverageTotal)} ml</Text>
            <Text style={styles.modalStatLabel}>weekly total</Text>
          </View>
          <View style={styles.modalStatBox}>
            <Text style={styles.modalStatValue}>{insights.hydrationAvg === null ? '-' : `${formatNumber(insights.hydrationAvg)} ml`}</Text>
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
            <Text style={styles.modalStatValue}>{insights.completedDoses}/{insights.scheduledDoses}</Text>
            <Text style={styles.modalStatLabel}>taken</Text>
          </View>
          <View style={styles.modalStatBox}>
            <Text style={styles.modalStatValue}>{insights.missedDoses + insights.skippedDoses}</Text>
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

      <DetailModal visible={!!selectedDay} onClose={() => setSelectedDay(null)} title={selectedDay?.title || 'Daily Summary'} color={selectedDay ? getScoreColor(selectedDay.score) : '#2563EB'} icon="calendar-outline">
        {selectedDay && (
          <>
            {!selectedDay.hasData ? (
              <Text style={styles.modalEmptyText}>No routine data logged for this day.</Text>
            ) : (
              <>
                <View style={styles.modalListRow}>
                  <Ionicons name="water-outline" size={16} color="#2563EB" />
                  <Text style={styles.modalListText}>Beverage intake: {formatNumber(selectedDay.beverage.totalMl)} / {formatNumber(selectedDay.beverage.goalMl)} ml - {selectedDay.beverage.percent}%</Text>
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
                  <Text style={styles.modalListText}>Medication: {selectedDay.medication.completed} taken, {selectedDay.medication.missed} missed, {selectedDay.medication.skipped} skipped of {selectedDay.medication.scheduled} scheduled</Text>
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
  weekTileHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 6, marginBottom: 6 },
  weekTileDay: { color: '#0F172A', fontSize: 12, fontWeight: '900' },
  weekTileDate: { color: '#64748B', fontSize: 11, fontWeight: '800', marginTop: 1 },
  weekTileScoreWrap: { alignItems: 'center', minWidth: 30, gap: 2 },
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
  modalStatGrid: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  modalStatBox: { flex: 1, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  modalStatValue: { fontSize: 16, fontWeight: '800', color: '#1F2937', marginBottom: 4 },
  modalStatLabel: { fontSize: 12, color: '#64748B', fontWeight: '700' },
  modalListRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  modalListText: { fontSize: 13, color: '#475569', fontWeight: '600', lineHeight: 18 },
  modalSpacer: { marginTop: 8, marginBottom: 8 },
  modalEmptyText: { fontSize: 13, color: '#64748B', lineHeight: 19, marginBottom: 8 },
  modalButton: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', marginTop: 12 },
  modalButtonText: { fontSize: 16, fontWeight: '600', color: 'white' },
});
