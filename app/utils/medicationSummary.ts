export type MedicationSummaryMedication = {
  id: string | number;
  local_id?: string | number | null;
  server_id?: string | number | null;
  client_uuid?: string | number | null;
  name?: string;
  dosage?: string;
  times?: string[];
  reminder?: boolean;
  active?: boolean;
  start_date?: string | null;
  end_date?: string | null;
  frequency?: 'daily' | 'weekly' | 'monthly' | 'custom';
  days_of_week?: number[];
  deleted_at?: string | null;
  created_at?: string | null;
  local_created_at?: string | null;
  schedule_created_at?: string | null;
  client_created_at?: string | null;
};

export type MedicationSummaryHistoryEntry = {
  id?: string | number;
  medId?: string | number;
  medication_id?: string | number;
  server_id?: string | number;
  local_id?: string | number;
  medicationName?: string;
  medication_name?: string;
  medication_name_snapshot?: string;
  dosage?: string;
  dosage_snapshot?: string;
  time?: string;
  scheduled_time?: string;
  status?: 'completed' | 'skipped' | 'missed' | 'snoozed' | string;
  loggedAt?: string;
  logged_at?: string;
  taken_time?: string;
  taken_at?: string;
  completed_at?: string;
  created_at?: string;
  updated_at?: string;
  medicationDeleted?: boolean;
  medication_deleted?: boolean;
  deleted_at?: string | null;
  medication?: {
    name?: string;
    dosage?: string;
    deleted_at?: string | null;
  };
};

type NormalizedHistoryEntry = {
  id: string;
  medId: string;
  time: string;
  status: 'completed' | 'skipped' | 'missed' | 'snoozed';
  loggedAt?: string;
  medicationName?: string;
  dosage?: string;
  medicationDeleted?: boolean;
};

export type TodayMedicationDose = {
  key: string;
  medId: string;
  medicationName: string;
  dosage?: string;
  time: string;
  status: 'completed' | 'skipped' | 'missed' | 'pending';
  source: 'schedule' | 'history';
};

export type TodayMedicationSummary = {
  taken: number;
  total: number;
  missed: number;
  skipped: number;
  remaining: number;
  percent: number;
  relevantToday: boolean;
  doses: TodayMedicationDose[];
  nextMedication: null | {
    name: string;
    time: string;
    medication: MedicationSummaryMedication | null;
  };
};

export type HistoricalMedicationSummary = MedicationSummaryMedication & {
  id: string;
  name: string;
  dosage?: string;
  times: string[];
  isHistoricalOnly: boolean;
  isDeleted: boolean;
  historyCount: number;
  completedToday: number;
  missedToday: number;
  source: 'current' | 'history' | 'placeholder';
};

export const MEDICATION_MISSED_GRACE_MS = 30 * 60 * 1000;
export const MEDICATION_LATE_GRACE_MS = 30 * 60 * 1000;

function toDateStringLocal(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateStringLocal(dateString?: string | null) {
  if (!dateString) return new Date();
  const [year, month, day] = dateString.slice(0, 10).split('-').map(Number);
  return new Date(year || new Date().getFullYear(), (month || 1) - 1, day || 1);
}

function isSameCalendarDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function normalizeMedicationIdKey(value?: string | number | null) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function isSameDoseTime(entryTime: string, scheduledTime: string) {
  const entry = new Date(entryTime);
  const scheduled = new Date(scheduledTime);
  return isSameCalendarDay(entry, scheduled)
    && entry.getHours() === scheduled.getHours()
    && entry.getMinutes() === scheduled.getMinutes();
}

export function getMedicationIdentityValues(med: Partial<MedicationSummaryMedication> | any) {
  return [
    med?.server_id,
    med?.local_id,
    med?.client_uuid,
    med?.id,
  ]
    .map(normalizeMedicationIdKey)
    .filter(Boolean);
}

export function sameMedication(a: Partial<MedicationSummaryMedication> | any, b: Partial<MedicationSummaryMedication> | any) {
  const aIdentities = getMedicationIdentityValues(a);
  const bIdentities = new Set(getMedicationIdentityValues(b));
  if (aIdentities.length > 0 && bIdentities.size > 0) {
    return aIdentities.some((identity) => bIdentities.has(identity));
  }

  const aName = typeof a?.name === 'string' ? a.name.trim().toLowerCase() : '';
  const bName = typeof b?.name === 'string' ? b.name.trim().toLowerCase() : '';
  const aDosage = typeof a?.dosage === 'string' ? a.dosage.trim().toLowerCase() : '';
  const bDosage = typeof b?.dosage === 'string' ? b.dosage.trim().toLowerCase() : '';
  const aTimes = Array.isArray(a?.times) ? a.times.map(String).sort().join('|') : '';
  const bTimes = Array.isArray(b?.times) ? b.times.map(String).sort().join('|') : '';
  return !!aName && aName === bName && aDosage === bDosage && aTimes === bTimes;
}

function normalizeHistoryEntry(entry: MedicationSummaryHistoryEntry): NormalizedHistoryEntry | null {
  const time = entry.scheduled_time || entry.time;
  const status = entry.status;
  const medId = entry.medId ?? entry.medication_id ?? entry.server_id ?? entry.local_id;
  if (!time || !medId || !status) return null;
  if (!['completed', 'skipped', 'missed', 'snoozed'].includes(status)) return null;

  return {
    id: String(entry.id ?? entry.local_id ?? `${medId}:${time}:${status}`),
    medId: String(medId),
    time,
    status: status as NormalizedHistoryEntry['status'],
    loggedAt: entry.loggedAt || entry.logged_at || entry.taken_time || entry.taken_at || entry.completed_at || entry.created_at || entry.updated_at,
    medicationName: entry.medicationName || entry.medication_name_snapshot || entry.medication?.name || entry.medication_name,
    dosage: entry.dosage_snapshot || entry.medication?.dosage || entry.dosage,
    medicationDeleted: Boolean(entry.medication?.deleted_at || entry.medication_deleted || entry.deleted_at || entry.medicationDeleted),
  };
}

function getDoseMinuteKey(entry: NormalizedHistoryEntry) {
  const date = new Date(entry.time);
  if (Number.isNaN(date.getTime())) return `${entry.medId}:${entry.id}`;
  date.setSeconds(0, 0);
  return `${entry.medId}:${date.toISOString().slice(0, 16)}`;
}

function getHistoryStatusPriority(status: NormalizedHistoryEntry['status']) {
  if (status === 'completed') return 4;
  if (status === 'snoozed') return 3;
  if (status === 'missed' || status === 'skipped') return 2;
  return 1;
}

function getHistorySortTime(entry: NormalizedHistoryEntry) {
  const logged = new Date(entry.loggedAt || entry.time).getTime();
  if (Number.isFinite(logged)) return logged;
  const scheduled = new Date(entry.time).getTime();
  return Number.isFinite(scheduled) ? scheduled : 0;
}

export function dedupeMedicationHistory(entries: MedicationSummaryHistoryEntry[]) {
  const byDose = new Map<string, NormalizedHistoryEntry>();
  entries.map(normalizeHistoryEntry).filter(Boolean).forEach((entry) => {
    const normalized = entry as NormalizedHistoryEntry;
    const key = getDoseMinuteKey(normalized);
    const existing = byDose.get(key);
    if (!existing) {
      byDose.set(key, normalized);
      return;
    }

    const entryPriority = getHistoryStatusPriority(normalized.status);
    const existingPriority = getHistoryStatusPriority(existing.status);
    if (
      entryPriority > existingPriority ||
      (entryPriority === existingPriority && getHistorySortTime(normalized) > getHistorySortTime(existing))
    ) {
      byDose.set(key, normalized);
    }
  });

  return Array.from(byDose.values()).sort((a, b) => getHistorySortTime(b) - getHistorySortTime(a));
}

export function dedupeMedicationHistoryForToday(entries: MedicationSummaryHistoryEntry[], now = new Date()) {
  return dedupeMedicationHistory(entries).filter((entry) => isSameCalendarDay(new Date(entry.time), now));
}

function findExistingSummaryKey(identities: string[], identityToSummaryKey: Map<string, string>) {
  return identities.map((identity) => identityToSummaryKey.get(identity)).find(Boolean) || null;
}

function createMedicationSummary(
  med: MedicationSummaryMedication,
  key: string,
): HistoricalMedicationSummary {
  return {
    ...med,
    id: String(med.id ?? med.server_id ?? med.local_id ?? key),
    name: med.name || 'Medication',
    dosage: med.dosage,
    times: med.times || [],
    isHistoricalOnly: Boolean(med.deleted_at),
    isDeleted: Boolean(med.deleted_at),
    historyCount: 0,
    completedToday: 0,
    missedToday: 0,
    source: 'current',
  };
}

export function buildHistoricalMedicationSummary({
  meds,
  rawHistory,
  backendTotal,
  now = new Date(),
}: {
  meds: MedicationSummaryMedication[];
  rawHistory: MedicationSummaryHistoryEntry[];
  backendTotal?: number;
  now?: Date;
}) {
  const summaries = new Map<string, HistoricalMedicationSummary>();
  const identityToSummaryKey = new Map<string, string>();

  meds.forEach((med, index) => {
    const identities = getMedicationIdentityValues(med);
    const existingKey = findExistingSummaryKey(identities, identityToSummaryKey);
    const summaryKey = existingKey || `med:${identities[0] || med.id || index}`;
    const existing = summaries.get(summaryKey);
    const next: HistoricalMedicationSummary = existing
      ? {
          ...existing,
          ...med,
          id: String(med.id ?? existing.id),
          name: med.name || existing.name,
          times: med.times?.length ? med.times : existing.times,
          source: existing.source,
        }
      : createMedicationSummary(med, summaryKey);
    summaries.set(summaryKey, next);
    identities.forEach((identity) => identityToSummaryKey.set(identity, summaryKey));
  });

  dedupeMedicationHistory(rawHistory).forEach((entry) => {
    const historyIdentity = normalizeMedicationIdKey(entry.medId);
    const summaryKey = identityToSummaryKey.get(historyIdentity) || `history:${historyIdentity || entry.id}`;
    const existing = summaries.get(summaryKey);
    const isToday = isSameCalendarDay(new Date(entry.time), now);
    const historyName = entry.medicationName || 'Deleted medication';
    const historyDosage = entry.dosage || existing?.dosage;

    const next: HistoricalMedicationSummary = existing || {
      id: summaryKey,
      name: historyName,
      dosage: historyDosage,
      times: [],
      deleted_at: entry.medicationDeleted ? entry.loggedAt || entry.time : null,
      isHistoricalOnly: true,
      isDeleted: true,
      historyCount: 0,
      completedToday: 0,
      missedToday: 0,
      source: 'history',
    };

    next.name = existing?.name || historyName;
    next.dosage = existing?.dosage || historyDosage;
    next.historyCount += 1;
    next.isHistoricalOnly = next.isHistoricalOnly || !existing;
    next.isDeleted = next.isDeleted || entry.medicationDeleted || !existing;
    if (isToday && entry.status === 'completed') next.completedToday += 1;
    if (isToday && (entry.status === 'missed' || entry.status === 'skipped')) next.missedToday += 1;
    summaries.set(summaryKey, next);
    if (historyIdentity) identityToSummaryKey.set(historyIdentity, summaryKey);
  });

  const finiteBackendTotal = Number(backendTotal);
  if (Number.isFinite(finiteBackendTotal) && finiteBackendTotal > summaries.size) {
    const missingCount = finiteBackendTotal - summaries.size;
    for (let index = 0; index < missingCount; index += 1) {
      const key = `deleted-placeholder:${index}`;
      summaries.set(key, {
        id: key,
        name: 'Deleted medication',
        dosage: undefined,
        times: [],
        deleted_at: null,
        isHistoricalOnly: true,
        isDeleted: true,
        historyCount: 0,
        completedToday: 0,
        missedToday: 0,
        source: 'placeholder',
      });
    }
  }

  return Array.from(summaries.values()).sort((a, b) => {
    if (a.isHistoricalOnly !== b.isHistoricalOnly) return a.isHistoricalOnly ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

export function isMedicationActiveForStats(med: MedicationSummaryMedication, now = new Date()) {
  if (med.deleted_at || med.active === false) return false;
  if (med.end_date) {
    const end = parseDateStringLocal(med.end_date);
    end.setHours(23, 59, 59, 999);
    if (end.getTime() < now.getTime()) return false;
  }
  return true;
}

export function isMedicationScheduledOnDate(med: MedicationSummaryMedication, date: Date) {
  if (!med.times?.length || med.deleted_at) return false;
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const scheduleStart = med.start_date ? parseDateStringLocal(med.start_date) : null;
  if (scheduleStart && scheduleStart.getTime() > dayStart.getTime()) return false;
  if (med.end_date) {
    const end = parseDateStringLocal(med.end_date);
    end.setHours(23, 59, 59, 999);
    if (end.getTime() < dayStart.getTime()) return false;
  }
  if ((med.frequency === 'weekly' || med.frequency === 'custom') && med.days_of_week?.length) {
    return med.days_of_week.includes(date.getDay());
  }
  if (med.frequency === 'monthly' && scheduleStart) {
    return date.getDate() === scheduleStart.getDate();
  }
  return true;
}

function getMedicationScheduleCreatedAt(med: MedicationSummaryMedication) {
  const raw = med.schedule_created_at || med.client_created_at || med.local_created_at || med.created_at;
  if (!raw) return null;
  const timestamp = new Date(raw).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isBeforeMedicationScheduleCreation(occurrence: Date, med: MedicationSummaryMedication) {
  const scheduleCreatedAt = getMedicationScheduleCreatedAt(med);
  if (!scheduleCreatedAt) return false;
  const createdMinute = new Date(scheduleCreatedAt);
  createdMinute.setSeconds(0, 0);
  return occurrence.getTime() < createdMinute.getTime();
}

export function getMedicationDoseOccurrencesForDate(med: MedicationSummaryMedication, date: Date) {
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
    .filter((item) => !isBeforeMedicationScheduleCreation(item, med))
    .sort((a, b) => a.getTime() - b.getTime());
}

function medIdentityMatchesHistory(med: MedicationSummaryMedication, entry: NormalizedHistoryEntry) {
  return getMedicationIdentityValues(med).some((identity) => identity === entry.medId);
}

function getDoseHistoryEntry(
  med: MedicationSummaryMedication,
  scheduledTime: string,
  history: NormalizedHistoryEntry[]
) {
  return history.find((entry) => (
    medIdentityMatchesHistory(med, entry)
    && isSameDoseTime(entry.time, scheduledTime)
    && (entry.status === 'completed' || entry.status === 'skipped' || entry.status === 'missed')
  ));
}

function doseKey(medId: string, time: string) {
  const date = new Date(time);
  date.setSeconds(0, 0);
  return `${medId}:${date.toISOString().slice(0, 16)}`;
}

function statusForOccurrence(med: MedicationSummaryMedication, time: string, history: NormalizedHistoryEntry[], now: Date) {
  const entry = getDoseHistoryEntry(med, time, history);
  if (entry?.status === 'completed') return 'completed';
  if (entry?.status === 'skipped') return 'skipped';
  if (entry?.status === 'missed') return 'missed';
  return new Date(time).getTime() + MEDICATION_MISSED_GRACE_MS < now.getTime() ? 'missed' : 'pending';
}

export function deriveTodayMedicationSummary({
  meds,
  rawHistory,
  now = new Date(),
}: {
  meds: MedicationSummaryMedication[];
  rawHistory: MedicationSummaryHistoryEntry[];
  now?: Date;
}): TodayMedicationSummary {
  return deriveMedicationSummaryForDate({ meds, rawHistory, date: now, now });
}

export function deriveMedicationSummaryForDate({
  meds,
  rawHistory,
  date,
  now = new Date(),
}: {
  meds: MedicationSummaryMedication[];
  rawHistory: MedicationSummaryHistoryEntry[];
  date: Date;
  now?: Date;
}): TodayMedicationSummary {
  const history = dedupeMedicationHistory(rawHistory);
  const dosesByKey = new Map<string, TodayMedicationDose>();

  meds.filter((med) => isMedicationActiveForStats(med, date) && med.reminder !== false).forEach((med) => {
    const medId = String(med.id ?? med.local_id ?? med.server_id);
    getMedicationDoseOccurrencesForDate(med, date).forEach((occurrence) => {
      const time = occurrence.toISOString();
      const status = statusForOccurrence(med, time, history, now);
      dosesByKey.set(doseKey(medId, time), {
        key: doseKey(medId, time),
        medId,
        medicationName: med.name || 'Medication',
        dosage: med.dosage,
        time,
        status,
        source: 'schedule',
      });
    });
  });

  history
    .filter((entry) => isSameCalendarDay(new Date(entry.time), date))
    .filter((entry) => entry.status === 'completed' || entry.status === 'skipped' || entry.status === 'missed')
    .forEach((entry) => {
      const existingMed = meds.find((med) => medIdentityMatchesHistory(med, entry));
      const medId = String(existingMed?.id ?? entry.medId);
      const key = doseKey(medId, entry.time);
      const existing = dosesByKey.get(key);
      const status = entry.status === 'completed' ? 'completed' : entry.status === 'skipped' ? 'skipped' : 'missed';
      dosesByKey.set(key, {
        key,
        medId,
        medicationName: existingMed?.name || entry.medicationName || 'Medication',
        dosage: existingMed?.dosage || entry.dosage,
        time: entry.time,
        status,
        source: existing ? existing.source : 'history',
      });
    });

  const doses = Array.from(dosesByKey.values()).sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  const taken = doses.filter((dose) => dose.status === 'completed').length;
  const missed = doses.filter((dose) => dose.status === 'missed').length;
  const skipped = doses.filter((dose) => dose.status === 'skipped').length;
  const remaining = doses.filter((dose) => dose.status === 'pending').length;
  const total = doses.length;
  const nextDose = doses.find((dose) => dose.status === 'pending' && new Date(dose.time).getTime() + MEDICATION_MISSED_GRACE_MS >= now.getTime()) || null;

  return {
    taken,
    total,
    missed,
    skipped,
    remaining,
    percent: total > 0 ? Math.round((taken / total) * 100) : 0,
    relevantToday: total > 0,
    doses,
    nextMedication: nextDose ? {
      name: nextDose.medicationName,
      time: nextDose.time,
      medication: meds.find((med) => String(med.id) === nextDose.medId) || null,
    } : null,
  };
}

export function deriveMedicationStats({
  meds,
  rawHistory,
  backendStats,
  now,
}: {
  meds: MedicationSummaryMedication[];
  rawHistory: MedicationSummaryHistoryEntry[];
  backendStats?: any;
  deletedTombstones?: Set<string>;
  now: Date;
}) {
  const dedupedHistory = dedupeMedicationHistory(rawHistory);
  const backendTotal = Number(backendStats?.total_medications);
  const historicalSummary = buildHistoricalMedicationSummary({
    meds,
    rawHistory: dedupedHistory,
    backendTotal: Number.isFinite(backendTotal) ? backendTotal : undefined,
    now,
  });
  const todaySummary = deriveTodayMedicationSummary({ meds, rawHistory, now });

  return {
    ...(backendStats || {}),
    total_medications: Number.isFinite(backendTotal)
      ? Math.max(backendTotal, historicalSummary.length)
      : historicalSummary.length,
    active_medications: meds.filter((med) => isMedicationActiveForStats(med, now)).length,
    completed_today: todaySummary.taken,
    missed_today: todaySummary.missed + todaySummary.skipped,
    total_reminders_today: todaySummary.total,
    remaining_today: todaySummary.remaining,
    adherence_today: todaySummary.percent,
  };
}
