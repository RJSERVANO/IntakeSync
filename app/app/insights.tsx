import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View, Modal } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as api from './api';

interface DetailModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  color: string;
  icon: string;
  children: React.ReactNode;
}

const DetailModal: React.FC<DetailModalProps> = ({
  visible,
  onClose,
  title,
  color,
  icon,
  children,
}) => {
  return (
    <Modal visible={visible} transparent={true} animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { borderTopColor: color }]}>
          <View style={styles.modalHeader}>
            <View style={[styles.modalIconCircle, { backgroundColor: `${color}20` }]}>
              <Ionicons name={icon as any} size={32} color={color} />
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>
          
          <Text style={[styles.modalTitle, { color }]}>{title}</Text>
          {children}
          
          <TouchableOpacity
            style={[styles.modalButton, { backgroundColor: color }]}
            onPress={onClose}
          >
            <Text style={styles.modalButtonText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

interface InsightsData {
  healthScore: number | null;
  hasData: boolean;
  hydrationAvg: number | null;
  medicationAdherence: number | null;
  missedDoses: number;
  missedPattern: string;
  scheduledDoses: number;
  completedDoses: number;
  beverageDaysWithLogs: number;
  beverageLogs: any[];
  medicationEvents: any[];
  weeklyData: { day: string; date?: string; score: number | null; hasData: boolean; status: 'good' | 'warning' | 'empty' }[];
}

const clampScore = (score: number) => Math.max(0, Math.min(100, Math.round(Number(score) || 0)));

const getWeekStart = (date = new Date()) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return start;
};

const isCurrentWeek = (value?: string) => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const start = getWeekStart();
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return date >= start && date < end;
};

const getEntryTime = (entry: any) => entry?.timestamp || entry?.date || entry?.created_at || entry?.scheduled_at || entry?.time || '';

const getMedicationDoseTime = (entry: any) => entry?.scheduled_time || entry?.scheduled_at || entry?.time || entry?.timestamp || entry?.created_at || '';

const getMedicationDoseKey = (entry: any) => {
  const medId = entry?.medication_id || entry?.medicationId || entry?.med_id || entry?.id || 'medication';
  const date = new Date(getMedicationDoseTime(entry));
  if (Number.isNaN(date.getTime())) return `${medId}:${entry?.id || JSON.stringify(entry)}`;
  date.setSeconds(0, 0);
  return `${medId}:${date.toISOString().slice(0, 16)}`;
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
    const key = getMedicationDoseKey(entry);
    const existing = byDose.get(key);
    if (!existing) {
      byDose.set(key, entry);
      return;
    }

    const entryPriority = getMedicationStatusPriority(entry);
    const existingPriority = getMedicationStatusPriority(existing);
    const entryTime = new Date(getEntryTime(entry)).getTime() || 0;
    const existingTime = new Date(getEntryTime(existing)).getTime() || 0;
    if (entryPriority > existingPriority || (entryPriority === existingPriority && entryTime > existingTime)) {
      byDose.set(key, entry);
    }
  });

  return Array.from(byDose.values()).sort((a, b) => {
    const bTime = new Date(getEntryTime(b)).getTime() || 0;
    const aTime = new Date(getEntryTime(a)).getTime() || 0;
    return bTime - aTime;
  });
};

const formatShortDate = (value?: string) => {
  if (!value) return 'Recent';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recent';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};

const formatMissedDoses = (missed: number, scheduled: number) => {
  const safeMissed = Math.max(0, Math.min(Math.round(Number(missed) || 0), Math.max(0, Math.round(Number(scheduled) || 0))));
  if (scheduled <= 0) return 'No schedule data yet.';
  if (safeMissed === 0) return 'No missed doses';
  if (safeMissed > 7) return 'Multiple missed doses';
  return `${safeMissed} missed dose${safeMissed === 1 ? '' : 's'}`;
};

const getScoreMessage = (score: number | null) => {
  if (score === null) return 'No score yet';
  if (score <= 39) return 'Needs attention';
  if (score <= 69) return 'Some progress';
  if (score <= 89) return 'Good routine progress';
  return 'Strong routine consistency';
};

const buildEmptyWeek = (): InsightsData['weeklyData'] => {
  const start = getWeekStart();
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      day: ['S', 'M', 'T', 'W', 'T', 'F', 'S'][index],
      date: date.toISOString().slice(0, 10),
      score: null,
      hasData: false,
      status: 'empty' as const,
    };
  });
};

const getScoreColor = (score: number | null) => {
  if (score === null) return '#64748B';
  if (score <= 39) return '#EF4444';
  if (score <= 69) return '#F59E0B';
  if (score <= 89) return '#2563EB';
  return '#10B981';
};

const getRoutineTips = (
  hydrationAvg: number | null,
  medicationAdherence: number | null,
  missedDoses: number,
  scheduledDoses: number,
) => {
  const hasBeverageData = hydrationAvg !== null;
  const hasMedicationData = scheduledDoses > 0 && medicationAdherence !== null;
  const beverageLow = hasBeverageData && hydrationAvg < 1200;
  const medicationNeedsAttention = hasMedicationData && (medicationAdherence < 70 || missedDoses > 0);
  const tips: { label: string; text: string; color: string; icon: string }[] = [];

  if (!hasBeverageData && !hasMedicationData) {
    return {
      color: '#2563EB',
      bg: '#FFFBEB',
      icon: 'sparkles',
      tips: [
        { label: 'Beverage', text: 'Log beverages for a few days to unlock trends.', color: '#2563EB', icon: 'water-outline' },
        { label: 'Medication', text: 'Add medication reminders to track adherence.', color: '#EF4444', icon: 'medkit-outline' },
      ],
    };
  }

  if (!hasBeverageData) {
    tips.push({ label: 'Beverage', text: 'Log beverages after meals or routine breaks.', color: '#2563EB', icon: 'water-outline' });
  }
  if (beverageLow) {
    tips.push({ label: 'Beverage', text: 'Use the Beverage tab to record water, coffee, juice, or other drinks.', color: '#2563EB', icon: 'water-outline' });
  }
  if (!hasMedicationData) {
    tips.push({ label: 'Medication', text: 'Medication insights appear after reminders are scheduled.', color: '#EF4444', icon: 'medkit-outline' });
  }
  if (missedDoses > 0) {
    tips.push({ label: 'Medication', text: 'Review reminder times and check off doses when taken.', color: '#EF4444', icon: 'time-outline' });
  } else if (medicationNeedsAttention) {
    tips.push({ label: 'Medication', text: 'Mark doses as taken when completed.', color: '#EF4444', icon: 'checkmark-circle-outline' });
  }
  if (tips.length === 0) {
    tips.push({ label: 'Consistency', text: 'Your routine looks consistent this week. Keep logging regularly.', color: '#10B981', icon: 'checkmark-circle-outline' });
  }

  return {
    color: tips.some((tip) => tip.color === '#EF4444') ? '#EF4444' : '#2563EB',
    bg: tips.some((tip) => tip.color === '#EF4444') ? '#FEF2F2' : '#EFF6FF',
    icon: tips.some((tip) => tip.color === '#EF4444') ? 'alert-circle-outline' : 'list-circle-outline',
    tips: tips.slice(0, 4),
  };
};

export default function InsightsScreen() {
  const { token } = useLocalSearchParams();
  const [loading, setLoading] = useState<boolean>(true);
  const [insightsData, setInsightsData] = useState<InsightsData | null>(null);
  const [summaryPeriod, setSummaryPeriod] = useState<'weekly' | 'monthly'>('weekly');
  const [detailModal, setDetailModal] = useState<'score' | 'beverage' | 'medication' | null>(null);

  const fetchInsightsData = useCallback(async () => {
    try {
      const [weeklyReport, patterns, hydrationData] = await Promise.all([
        api.get('/insights/weekly-report', String(token), 5000).catch(() => null),
        api.get('/insights/patterns', String(token), 5000).catch(() => null),
        api.get('/hydration', String(token), 3000).catch(() => null),
      ]);

      if (weeklyReport) {
        const hasReportData = Boolean(weeklyReport.has_data);
        const overallScore = weeklyReport.overall_score !== null && weeklyReport.overall_score !== undefined
          ? clampScore(weeklyReport.overall_score)
          : null;
        const hasMedicationRate = weeklyReport.medications?.adherence_rate !== undefined && weeklyReport.medications?.adherence_rate !== null;
        const medicationAdherence = hasMedicationRate ? clampScore(weeklyReport.medications.adherence_rate) : null;
        const scheduledDoses = Math.max(0, Number(weeklyReport.medications?.scheduled ?? 0));
        const completedDoses = Math.max(0, Number(weeklyReport.medications?.completed ?? 0));
        const missedDoses = scheduledDoses > 0
          ? Math.max(0, Number(weeklyReport.medications?.missed ?? scheduledDoses - completedDoses))
          : 0;
        const rawBeverageLogs = Array.isArray(weeklyReport.hydration?.logs)
          ? weeklyReport.hydration.logs
          : Array.isArray(hydrationData?.entries) ? hydrationData.entries : [];
        const beverageLogs = rawBeverageLogs.filter((entry: any) => isCurrentWeek(getEntryTime(entry)));
        const beverageTotal = beverageLogs.reduce((sum: number, entry: any) => sum + Number(entry?.amount_ml || entry?.logged_ml || 0), 0);
        const beverageDaysWithLogs = Number(weeklyReport.hydration?.days_with_logs ?? new Set(beverageLogs.map((entry: any) => new Date(getEntryTime(entry)).toDateString())).size);
        const hydrationAvg = weeklyReport.hydration?.daily_average_ml !== undefined && weeklyReport.hydration?.daily_average_ml !== null
          ? Math.round(Number(weeklyReport.hydration.daily_average_ml))
          : beverageLogs.length > 0
          ? Math.round(beverageTotal / 7)
          : null;
        const medicationSources = [
          weeklyReport.medications?.events,
          weeklyReport.medications?.recent,
          weeklyReport.medications?.history,
          weeklyReport.medications?.entries,
          weeklyReport.medications?.logs,
        ];
        const medicationEvents = dedupeMedicationEvents(
          medicationSources.find(Array.isArray)?.filter((entry: any) => isCurrentWeek(getEntryTime(entry))) || []
        );
        
        // Extract pattern message
        let missedPattern = 'Routine patterns will appear as more activity is logged.';
        if (patterns?.patterns && patterns.patterns.length > 0) {
          missedPattern = patterns.patterns[0].pattern || missedPattern;
        }

        const rawDailyData = weeklyReport.daily_scores || weeklyReport.daily_data || weeklyReport.days || [];
        const weeklyData = Array.isArray(rawDailyData)
          ? rawDailyData
              .map((item: any) => {
                const rawScore = item?.score ?? item?.overall_score ?? item?.routine_score;
                const score = rawScore !== null && rawScore !== undefined ? clampScore(rawScore) : null;
                const entryTime = getEntryTime(item);
                if (entryTime && !isCurrentWeek(entryTime)) return null;
                const label = String(item?.day ?? item?.label ?? item?.date ?? '').slice(0, 3) || '';
                return label ? {
                  day: label.slice(0, 1).toUpperCase(),
                  date: item?.date,
                  score,
                  hasData: Boolean(item?.has_data ?? score !== null),
                  status: score === null ? ('empty' as const) : score >= 75 ? ('good' as const) : ('warning' as const),
                } : null;
              })
              .filter(Boolean)
          : [];

        setInsightsData({
          healthScore: overallScore,
          hasData: hasReportData || overallScore !== null,
          hydrationAvg,
          medicationAdherence,
          missedDoses,
          missedPattern,
          scheduledDoses,
          completedDoses,
          beverageDaysWithLogs,
          beverageLogs,
          medicationEvents,
          weeklyData: weeklyData.length ? weeklyData as InsightsData['weeklyData'] : buildEmptyWeek(),
        });
      } else {
        const rawBeverageLogs = Array.isArray(hydrationData?.entries) ? hydrationData.entries : [];
        const beverageLogs = rawBeverageLogs.filter((entry: any) => isCurrentWeek(getEntryTime(entry)));
        const beverageTotal = beverageLogs.reduce((sum: number, entry: any) => sum + Number(entry?.amount_ml || entry?.logged_ml || 0), 0);
        setInsightsData({
          healthScore: null,
          hasData: beverageLogs.length > 0,
          hydrationAvg: beverageLogs.length > 0 ? Math.round(beverageTotal / 7) : null,
          medicationAdherence: null,
          missedDoses: 0,
          missedPattern: 'Routine patterns will appear as more activity is logged.',
          scheduledDoses: 0,
          completedDoses: 0,
          beverageDaysWithLogs: new Set(beverageLogs.map((entry: any) => new Date(getEntryTime(entry)).toDateString())).size,
          beverageLogs,
          medicationEvents: [],
          weeklyData: buildEmptyWeek(),
        });
      }
    } catch (err) {
      console.error('Error fetching insights:', err);
      // Set fallback data on error
      setInsightsData({
        healthScore: null,
        hasData: false,
        hydrationAvg: null,
        medicationAdherence: null,
        missedDoses: 0,
        missedPattern: 'Unable to load insights data.',
        scheduledDoses: 0,
        completedDoses: 0,
        beverageDaysWithLogs: 0,
        beverageLogs: [],
        medicationEvents: [],
        weeklyData: buildEmptyWeek(),
      });
    }
  }, [token]);

  useEffect(() => {
    const load = async () => {
      try {
        if (!token) {
          setLoading(false);
          return;
        }

        await fetchInsightsData();
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [fetchInsightsData, token]);

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1E3A8A" />
          <Text style={styles.loadingText}>Loading insights...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!insightsData) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1E3A8A" />
          <Text style={styles.loadingText}>Loading your routine data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const insights = insightsData;
  const scoreColor = getScoreColor(insights.healthScore);
  const hasMedicationSchedule = insights.scheduledDoses > 0;
  const hasBeverageData = insights.hydrationAvg !== null;
  const hasMedicationData = hasMedicationSchedule && insights.medicationAdherence !== null;
  const routineTips = getRoutineTips(insights.hydrationAvg, insights.medicationAdherence, insights.missedDoses, insights.scheduledDoses);
  const weeklyHasData = insights.weeklyData.some((item) => item.hasData);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Routine Insights</Text>
          <Text style={styles.headerSubtitle}>Patterns from your routine data</Text>
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Hero Card - Routine Score */}
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
                ? 'Start logging to build routine insights.'
                : 'Based on logged beverage activity and medication check-ins.'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
        </TouchableOpacity>

        <View style={styles.segmentedControl}>
          <TouchableOpacity
            style={[styles.segmentButton, summaryPeriod === 'weekly' && styles.segmentButtonActive]}
            onPress={() => setSummaryPeriod('weekly')}
          >
            <Text style={[styles.segmentText, summaryPeriod === 'weekly' && styles.segmentTextActive]}>Weekly</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentButton, summaryPeriod === 'monthly' && styles.segmentButtonActive]}
            onPress={() => setSummaryPeriod('monthly')}
          >
            <Text style={[styles.segmentText, summaryPeriod === 'monthly' && styles.segmentTextActive]}>Monthly</Text>
          </TouchableOpacity>
        </View>

        {/* Highlights Grid */}
        <View style={styles.highlightsGrid}>
          {/* Hydration Summary */}
          {(() => {
            return (
              <TouchableOpacity activeOpacity={0.78} style={[styles.highlightCard, styles.beverageHighlight]} onPress={() => setDetailModal('beverage')}>
                <View style={styles.highlightHeader}>
                  <View style={[styles.highlightIconCircle, styles.beverageIconCircle]}>
                    <Ionicons name="water" size={18} color="#2563EB" />
                  </View>
                  <Text style={styles.highlightTitle} numberOfLines={2}>Beverage Intake</Text>
                </View>
                <Text style={[styles.highlightValue, { color: '#2563EB' }]}>
                  {hasBeverageData ? `${insights.hydrationAvg} ml` : '-'}
                </Text>
                <Text style={styles.highlightLabel}>Daily average</Text>
                {!hasBeverageData && <Text style={styles.notEnoughText}>Not enough data yet</Text>}
              </TouchableOpacity>
            );
          })()}

          {/* Medication Summary */}
          <TouchableOpacity activeOpacity={0.78} style={[styles.highlightCard, styles.medicationHighlight]} onPress={() => setDetailModal('medication')}>
            <View style={styles.highlightHeader}>
              <View style={[styles.highlightIconCircle, styles.medicationIconCircle]}>
                <Ionicons name="medkit-outline" size={17} color="#EF4444" />
              </View>
              <Text style={styles.highlightTitle} numberOfLines={2}>Medication Adherence</Text>
            </View>
            <Text style={[styles.highlightValue, { color: '#EF4444' }]}>
              {hasMedicationData ? `${insights.medicationAdherence}%` : '-'}
            </Text>
            <Text style={styles.highlightLabel}>adherence</Text>
            <Text style={styles.missedText}>
              {!hasMedicationSchedule || !hasMedicationData
                ? 'No schedule data yet.'
                : formatMissedDoses(insights.missedDoses, insights.scheduledDoses)}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Routine Tips Card */}
        {(() => (
            <View style={[styles.patternCard, { backgroundColor: routineTips.bg, borderColor: routineTips.color }]}>
              <View style={styles.patternHeader}>
                <View style={[styles.tipIconCircle, { backgroundColor: `${routineTips.color}18` }]}>
                  <Ionicons name={routineTips.icon as any} size={20} color={routineTips.color} />
                </View>
                <Text style={[styles.patternTitle, { color: routineTips.color }]}>Action Plan</Text>
              </View>
              <View style={styles.tipsList}>
                {routineTips.tips.map((tip) => (
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
        ))()}

        {/* Weekly and Monthly Summary */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>{summaryPeriod === 'weekly' ? 'Weekly Summary' : 'Monthly Summary'}</Text>
          {summaryPeriod === 'monthly' ? (
            <View style={styles.monthlyPlaceholder}>
              <View style={styles.monthGrid}>
                {Array.from({ length: 12 }, (_, index) => (
                  <View key={index} style={styles.monthDot} />
                ))}
              </View>
              <Ionicons name="calendar-outline" size={22} color="#2563EB" />
              <Text style={styles.placeholderText}>Monthly trends will appear after more logged activity.</Text>
            </View>
          ) : (
            <View style={[styles.chartContainer, !weeklyHasData && styles.chartContainerWithEmptyCopy]}>
              {insights.weeklyData.map((item, index) => {
                const barHeight = item.score === null ? 8 : Math.max(10, (item.score / 100) * 96);
                const barColor = item.status === 'empty' ? '#CBD5E1' : item.status === 'good' ? '#10B981' : '#F59E0B';
                
                return (
                  <View key={index} style={styles.chartBar}>
                    <View style={styles.barContainer}>
                      <View style={[styles.bar, { height: barHeight, backgroundColor: barColor }]} />
                    </View>
                    <Text style={styles.dayLabel}>{item.day}</Text>
                    <Text style={styles.scoreLabel}>{item.score === null ? '-' : item.score}</Text>
                  </View>
                );
              })}
              {!weeklyHasData && (
                <View style={styles.chartEmptyCopy}>
                  <Text style={styles.emptyChartTitle}>No weekly trends yet</Text>
                  <Text style={styles.emptyChartText}>Log beverages or medication check-ins to build your weekly pattern.</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Bottom Padding */}
        <View style={{ height: 40 }} />
      </ScrollView>

      <DetailModal
        visible={detailModal === 'score'}
        onClose={() => setDetailModal(null)}
        title="Routine Score"
        color={scoreColor}
        icon="analytics-outline"
      >
        <Text style={styles.modalRecommendation}>
          This score summarizes your logged beverage activity and medication check-ins for the selected period.
        </Text>
        <Text style={styles.modalSectionLabel}>Contributors</Text>
        <View style={styles.contributorList}>
          <View style={styles.contributorRow}>
            <Ionicons name="water-outline" size={16} color="#2563EB" />
            <Text style={styles.modalListText}>
              Beverage logging{hasBeverageData ? `: ${insights.beverageDaysWithLogs} day${insights.beverageDaysWithLogs === 1 ? '' : 's'} with logs` : ': no logs yet'}
            </Text>
          </View>
          <View style={styles.contributorRow}>
            <Ionicons name="medkit-outline" size={16} color="#EF4444" />
            <Text style={styles.modalListText}>
              Medication adherence{hasMedicationSchedule ? `: ${insights.completedDoses} of ${insights.scheduledDoses} check-ins completed` : ': no schedule data yet'}
            </Text>
          </View>
          {hasMedicationSchedule && (
            <View style={styles.contributorRow}>
              <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
              <Text style={styles.modalListText}>Missed doses: {insights.missedDoses}</Text>
            </View>
          )}
          <View style={styles.contributorRow}>
            <Ionicons name="calendar-outline" size={16} color="#64748B" />
            <Text style={styles.modalListText}>
              Logging consistency: {insights.weeklyData.filter((item) => item.hasData).length} of 7 days have activity
            </Text>
          </View>
        </View>
        <Text style={styles.modalSectionLabel}>Suggested actions</Text>
        {routineTips.tips.map((tip) => (
          <View key={`modal-${tip.text}`} style={styles.modalListRow}>
            <Ionicons name={tip.icon as any} size={16} color={tip.color} />
            <Text style={styles.modalListText}>{tip.text}</Text>
          </View>
        ))}
      </DetailModal>

      <DetailModal
        visible={detailModal === 'beverage'}
        onClose={() => setDetailModal(null)}
        title="Beverage Intake"
        color="#2563EB"
        icon="water"
      >
        <Text style={styles.modalSectionLabel}>This week</Text>
        <View style={styles.modalStatGrid}>
          <View style={styles.modalStatBox}>
            <Text style={styles.modalStatValue}>{hasBeverageData ? `${insights.hydrationAvg} ml` : '-'}</Text>
            <Text style={styles.modalStatLabel}>weekly average</Text>
          </View>
          <View style={styles.modalStatBox}>
            <Text style={styles.modalStatValue}>{insights.beverageDaysWithLogs}</Text>
            <Text style={styles.modalStatLabel}>days with logs</Text>
          </View>
        </View>
        <Text style={styles.modalSectionLabel}>Recent beverage logs</Text>
        {insights.beverageLogs.slice(0, 4).length > 0 ? (
          insights.beverageLogs.slice(0, 4).map((entry, index) => (
            <View key={`${getEntryTime(entry)}-${index}`} style={styles.modalListRow}>
              <Ionicons name="water-outline" size={16} color="#2563EB" />
              <Text style={styles.modalListText}>
                {Number(entry?.amount_ml || entry?.logged_ml || 0)} ml | {formatShortDate(getEntryTime(entry))}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.modalEmptyText}>No beverage logs available for this week.</Text>
        )}
      </DetailModal>

      <DetailModal
        visible={detailModal === 'medication'}
        onClose={() => setDetailModal(null)}
        title="Medication Adherence"
        color="#EF4444"
        icon="medkit-outline"
      >
        <Text style={styles.modalSectionLabel}>This week</Text>
        <View style={styles.modalStatGrid}>
          <View style={styles.modalStatBox}>
            <Text style={styles.modalStatValue}>{insights.completedDoses}</Text>
            <Text style={styles.modalStatLabel}>taken</Text>
          </View>
          <View style={styles.modalStatBox}>
            <Text style={styles.modalStatValue}>{formatMissedDoses(insights.missedDoses, insights.scheduledDoses)}</Text>
            <Text style={styles.modalStatLabel}>missed</Text>
          </View>
        </View>
        <Text style={styles.modalSectionLabel}>Recent entries</Text>
        {insights.medicationEvents.slice(0, 4).length > 0 ? (
          insights.medicationEvents.slice(0, 4).map((entry, index) => {
            const status = String(entry?.status || entry?.status_text || 'recorded');
            return (
              <View key={`${getEntryTime(entry)}-${index}`} style={styles.modalListRow}>
                <Ionicons name={status.toLowerCase().includes('miss') ? 'alert-circle-outline' : 'checkmark-circle-outline'} size={16} color={status.toLowerCase().includes('miss') ? '#EF4444' : '#10B981'} />
                <Text style={styles.modalListText}>
                  {status} | {formatShortDate(getEntryTime(entry))}
                </Text>
              </View>
            );
          })
        ) : (
          <Text style={styles.modalEmptyText}>No recent medication entries available for this week.</Text>
        )}
      </DetailModal>
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
  },
  loadingText: {
    marginTop: 12,
    color: '#6B7280',
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '700',
    lineHeight: 17,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  heroCard: {
    backgroundColor: 'white',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    alignItems: 'center',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  scoreCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 6,
    borderColor: '#1E3A8A',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  scoreValue: {
    fontSize: 36,
    fontWeight: '800',
    color: '#1E3A8A',
  },
  scoreEmptyText: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  scoreMax: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  heroCopy: {
    flex: 1,
  },
  heroKicker: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2563EB',
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    padding: 5,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  segmentButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 999,
  },
  segmentButtonActive: {
    backgroundColor: '#2563EB',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 2,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#64748B',
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  highlightsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  highlightCard: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    minHeight: 126,
    overflow: 'hidden',
  },
  beverageHighlight: {
    borderLeftWidth: 4,
    borderLeftColor: '#2563EB',
  },
  medicationHighlight: {
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
    borderColor: '#FECACA',
    shadowColor: '#EF4444',
  },
  highlightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 8,
  },
  highlightIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  beverageIconCircle: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  medicationIconCircle: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  highlightTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    color: '#6B7280',
    lineHeight: 16,
  },
  highlightValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 2,
  },
  highlightLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 6,
  },
  trendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trendText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
  },
  missedText: {
    fontSize: 12,
    color: '#B91C1C',
    fontWeight: '700',
    lineHeight: 16,
    flexShrink: 1,
  },
  notEnoughText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '700',
    lineHeight: 16,
  },
  patternCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderColor: '#FDE68A',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  patternHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  tipIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  patternTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#92400E',
  },
  patternContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
  },
  patternText: {
    flex: 1,
    fontSize: 14,
    color: '#78350F',
    lineHeight: 20,
  },
  tipsList: {
    gap: 9,
    marginBottom: 12,
  },
  tipRow: {
    gap: 7,
    paddingVertical: 2,
  },
  tipBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tipBadgeText: {
    fontSize: 11,
    fontWeight: '900',
  },
  tipText: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 19,
    fontWeight: '600',
  },
  patternButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'white',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  patternButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F59E0B',
  },
  chartCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    shadowColor: '#1E3A8A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  chartTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 14,
  },
  chartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    position: 'relative',
  },
  chartContainerWithEmptyCopy: {
    paddingBottom: 78,
  },
  chartBar: {
    flex: 1,
    alignItems: 'center',
  },
  barContainer: {
    height: 96,
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  bar: {
    width: 32,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  dayLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 4,
  },
  scoreLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  placeholderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  monthlyPlaceholder: {
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    width: 66,
    justifyContent: 'center',
  },
  monthDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#CBD5E1',
  },
  chartEmptyCopy: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  emptyChartTitle: {
    color: '#1F2937',
    fontSize: 14,
    fontWeight: '900',
  },
  emptyChartText: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 3,
  },
  placeholderText: {
    flex: 1,
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    borderTopWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  modalRecommendation: {
    fontSize: 15,
    color: '#4B5563',
    lineHeight: 24,
    marginBottom: 16,
  },
  contributorList: {
    marginBottom: 16,
  },
  contributorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalSectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  modalStatGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  modalStatBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalStatValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 4,
  },
  modalStatLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '700',
  },
  modalListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalListText: {
    flex: 1,
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
    lineHeight: 18,
  },
  modalEmptyText: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 19,
    marginBottom: 8,
  },
  modalButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});

