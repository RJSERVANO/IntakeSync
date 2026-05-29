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
  medicationId?: string | number;
  medication_id?: string | number;
  server_id?: string | number;
  local_id?: string | number;
  client_uuid?: string | number;
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
  scheduled_date?: string;
  dose_key?: string;
  sync_status?: string;
  is_late?: boolean;
  isLate?: boolean;
  taken_status?: string | null;
  takenStatus?: string | null;
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
  medication_id?: string | number;
  medicationId?: string | number;
  server_id?: string | number;
  local_id?: string | number;
  client_uuid?: string | number;
  time: string;
  scheduled_time?: string;
  scheduled_date?: string;
  dose_key?: string;
  sync_status?: string;
  status: 'completed' | 'skipped' | 'missed' | 'snoozed';
  loggedAt?: string;
  logged_at?: string;
  taken_at?: string;
  completed_at?: string;
  is_late?: boolean;
  isLate?: boolean;
  taken_status?: 'on_time' | 'late' | string | null;
  takenStatus?: 'on_time' | 'late' | string | null;
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
  isLate?: boolean;
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

export function normalizeMedicationHistoryStatus(status?: string | null): NormalizedHistoryEntry['status'] | null {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'completed' || normalized === 'taken') return 'completed';
  if (normalized === 'missed') return 'missed';
  if (normalized === 'skipped') return 'skipped';
  if (normalized === 'snoozed') return 'snoozed';
  return null;
}

function getLocalDoseDateParts(time: string) {
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return null;
  return {
    date: toDateStringLocal(date),
    minute: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
  };
}

export function getStableMedicationDoseKey(medicationIdentity: string | number | null | undefined, scheduledTime: string) {
  const identity = normalizeMedicationIdKey(medicationIdentity);
  const parts = getLocalDoseDateParts(scheduledTime);
  if (!identity || !parts) return '';
  return `${identity}:${parts.date}:${parts.minute}`;
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
    med?.medication_id,
    med?.medicationId,
    med?.medId,
  ]
    .map(normalizeMedicationIdKey)
    .filter(Boolean);
}

export function getMedicationHistoryIdentityValues(entry: Partial<MedicationSummaryHistoryEntry> | any) {
  return [
    entry?.server_id,
    entry?.medication_id,
    entry?.medicationId,
    entry?.medId,
    entry?.local_id,
    entry?.client_uuid,
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
  const status = normalizeMedicationHistoryStatus(entry.status);
  const identities = getMedicationHistoryIdentityValues(entry);
  const medId = identities[0] ?? entry.medId ?? entry.medication_id ?? entry.server_id ?? entry.local_id;
  if (!time || !medId || !status) return null;

  const loggedAt = entry.loggedAt || entry.logged_at || entry.taken_time || entry.taken_at || entry.completed_at || entry.created_at || entry.updated_at;
  const scheduledTime = new Date(time).getTime();
  const actualTime = new Date(loggedAt || time).getTime();
  const derivedLate = status === 'completed'
    && Number.isFinite(scheduledTime)
    && Number.isFinite(actualTime)
    && actualTime - scheduledTime > MEDICATION_LATE_GRACE_MS;
  const explicitLate = entry.is_late === true || entry.isLate === true || entry.taken_status === 'late' || entry.takenStatus === 'late';

  return {
    id: String(entry.id ?? entry.local_id ?? `${medId}:${time}:${status}`),
    medId: String(medId),
    medication_id: entry.medication_id,
    medicationId: entry.medicationId,
    server_id: entry.server_id,
    local_id: entry.local_id,
    client_uuid: entry.client_uuid,
    time,
    scheduled_time: entry.scheduled_time || time,
    scheduled_date: entry.scheduled_date || getLocalDoseDateParts(time)?.date,
    dose_key: entry.dose_key || getStableMedicationDoseKey(medId, time),
    sync_status: entry.sync_status,
    status: status as NormalizedHistoryEntry['status'],
    loggedAt,
    logged_at: entry.logged_at || loggedAt,
    taken_at: entry.taken_at,
    completed_at: entry.completed_at,
    is_late: status === 'completed' ? explicitLate || derivedLate : false,
    isLate: status === 'completed' ? explicitLate || derivedLate : false,
    taken_status: status === 'completed' ? (explicitLate || derivedLate ? 'late' : 'on_time') : null,
    takenStatus: status === 'completed' ? (explicitLate || derivedLate ? 'late' : 'on_time') : null,
    medicationName: entry.medicationName || entry.medication_name_snapshot || entry.medication?.name || entry.medication_name,
    dosage: entry.dosage_snapshot || entry.medication?.dosage || entry.dosage,
    medicationDeleted: Boolean(entry.medication?.deleted_at || entry.medication_deleted || entry.deleted_at || entry.medicationDeleted),
  };
}

function getHistoryNameDoseKey(entry: NormalizedHistoryEntry) {
  const parts = getLocalDoseDateParts(entry.time);
  const name = String(entry.medicationName || '').trim().toLowerCase();
  const dosage = String(entry.dosage || '').trim().toLowerCase();
  if (!parts || !name) return '';
  return `name:${name}:${dosage}:${parts.date}:${parts.minute}`;
}

function getDoseMinuteKeys(entry: NormalizedHistoryEntry) {
  const identities = getMedicationHistoryIdentityValues(entry);
  const keys = identities
    .map((identity) => getStableMedicationDoseKey(identity, entry.time))
    .filter(Boolean);
  const nameKey = getHistoryNameDoseKey(entry);
  if (nameKey) keys.push(nameKey);
  return Array.from(new Set(keys.length ? keys : [`fallback:${entry.medId}:${entry.id}`]));
}

function getHistoryStatusPriority(status: NormalizedHistoryEntry['status']) {
  if (status === 'completed') return 4;
  if (status === 'skipped') return 3;
  if (status === 'snoozed') return 2;
  if (status === 'missed') return 1;
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
  const canonicalByAlias = new Map<string, string>();
  entries.map(normalizeHistoryEntry).filter(Boolean).forEach((entry) => {
    const normalized = entry as NormalizedHistoryEntry;
    const aliases = getDoseMinuteKeys(normalized);
    const key = aliases.map((alias) => canonicalByAlias.get(alias)).find(Boolean) || aliases[0];
    const existing = byDose.get(key);
    if (!existing) {
      byDose.set(key, normalized);
      aliases.forEach((alias) => canonicalByAlias.set(alias, key));
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
    aliases.forEach((alias) => canonicalByAlias.set(alias, key));
  });

  return Array.from(byDose.values()).sort((a, b) => getHistorySortTime(b) - getHistorySortTime(a));
}

export function buildPendingMedicationHistoryEntries(actions: any[] = [], meds: MedicationSummaryMedication[] = []) {
  return actions
    .filter((item) => ['MARK_MEDICATION_TAKEN', 'MARK_MEDICATION_MISSED', 'SNOOZE_MEDICATION'].includes(item?.action_type))
    .map((item) => {
      const payload = item.payload || {};
      const med = meds.find((candidate) => {
        const candidateIds = new Set(getMedicationIdentityValues(candidate));
        return getMedicationHistoryIdentityValues({ ...payload, medId: payload.medId || item.local_id })
          .some((identity) => candidateIds.has(identity));
      });
      const status = item.action_type === 'MARK_MEDICATION_TAKEN'
        ? 'completed'
        : item.action_type === 'MARK_MEDICATION_MISSED'
          ? 'missed'
          : 'snoozed';
      const time = payload.scheduled_time || payload.time;
      if (!time) return null;
      const medId = payload.medId || payload.medication_id || payload.server_id || med?.id || item.local_id;
      return {
        id: item.local_id || payload.client_uuid || `${item.action_type}:${medId}:${time}`,
        medId,
        medication_id: payload.medication_id,
        medicationId: payload.medicationId,
        server_id: payload.server_id,
        local_id: payload.local_id || item.local_id,
        client_uuid: payload.client_uuid || item.local_id,
        medicationName: payload.medicationName || payload.medication_name || med?.name,
        dosage: payload.dosage || med?.dosage,
        status,
        time,
        scheduled_time: time,
        scheduled_date: payload.scheduled_date || getLocalDoseDateParts(time)?.date,
        loggedAt: payload.logged_at || payload.taken_at || item.created_at,
        logged_at: payload.logged_at || payload.taken_at || item.created_at,
        taken_at: payload.taken_at,
        is_late: payload.is_late,
        isLate: payload.isLate,
        taken_status: payload.taken_status,
        takenStatus: payload.takenStatus,
        dose_key: payload.dose_key || getStableMedicationDoseKey(medId, time),
        sync_status: item.status || 'pending',
      };
    })
    .filter(Boolean) as MedicationSummaryHistoryEntry[];
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
  const medIdentities = new Set(getMedicationIdentityValues(med));
  if (getMedicationHistoryIdentityValues(entry).some((identity) => medIdentities.has(identity))) return true;
  const medName = String(med.name || '').trim().toLowerCase();
  const entryName = String(entry.medicationName || '').trim().toLowerCase();
  const medDosage = String(med.dosage || '').trim().toLowerCase();
  const entryDosage = String(entry.dosage || '').trim().toLowerCase();
  if (!medName || medName !== entryName) return false;
  return !medDosage || !entryDosage || medDosage === entryDosage;
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
  return getStableMedicationDoseKey(medId, time) || `${medId}:${time}`;
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
        isLate: entry.status === 'completed' ? entry.isLate : false,
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
