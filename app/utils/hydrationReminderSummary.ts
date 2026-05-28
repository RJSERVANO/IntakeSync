export type HydrationReminderSource = {
  scheduleKey?: string | null;
  doseKey?: string | null;
  scheduledAt?: string | null;
  type?: string | null;
  canceledAt?: string | null;
  cancelledAt?: string | null;
  notificationId?: string | null;
};

export type HydrationReminderSummary = {
  missedCount: number;
  missedTimes: string[];
  respondedTimes: string[];
  scheduledTodayCount: number;
  nextHydrationReminder: string | null;
  hasReminderEvidence: boolean;
};

const RESPONSE_WINDOW_MS = 30 * 60 * 1000;

function parseSafeDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localMinuteKey(date: Date) {
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  return `${localDateKey(date)}:${hour}:${minute}`;
}

function localHourKey(date: Date) {
  const hour = `${date.getHours()}`.padStart(2, '0');
  return `${localDateKey(date)}:${hour}`;
}

function reminderKey(item: HydrationReminderSource, scheduledAt: Date) {
  const explicitKey = item.scheduleKey || item.doseKey;
  if (explicitKey && explicitKey.includes(localDateKey(scheduledAt))) return explicitKey;
  return `hydration:${localMinuteKey(scheduledAt)}`;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
}

function getEntryTime(entry: any) {
  return parseSafeDate(entry?.timestamp || entry?.created_at || entry?.date || entry?.time);
}

export function deriveHydrationReminderSummary({
  hydrationEntries,
  scheduledNotifications,
  notificationRecords,
  date = new Date(),
  now = new Date(),
}: {
  hydrationEntries: any[];
  scheduledNotifications: HydrationReminderSource[];
  notificationRecords?: HydrationReminderSource[];
  user?: any;
  date?: Date;
  now?: Date;
}): HydrationReminderSummary {
  const targetDate = localDateKey(date);
  const remindersByKey = new Map<string, { key: string; scheduledAt: Date; canceledAt: Date | null }>();

  [...(scheduledNotifications || []), ...(notificationRecords || [])].forEach((item) => {
    if (item?.type && item.type !== 'hydration') return;
    const scheduledAt = parseSafeDate(item?.scheduledAt || null);
    if (!scheduledAt || localDateKey(scheduledAt) !== targetDate) return;
    const key = reminderKey(item, scheduledAt);
    const canceledAt = parseSafeDate(item?.canceledAt || item?.cancelledAt || null);
    const existing = remindersByKey.get(key);
    if (!existing || scheduledAt.getTime() < existing.scheduledAt.getTime()) {
      remindersByKey.set(key, { key, scheduledAt, canceledAt });
    }
  });

  const reminders = Array.from(remindersByKey.values()).sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  const entryTimes = (hydrationEntries || [])
    .filter((entry) => !entry?.deleted_at && Number(entry?.amount_ml || entry?.logged_ml || 0) > 0)
    .map(getEntryTime)
    .filter((entryTime): entryTime is Date => entryTime !== null && localDateKey(entryTime) === targetDate)
    .sort((a, b) => a.getTime() - b.getTime());

  const missedTimes: string[] = [];
  const respondedTimes: string[] = [];
  const nowTime = now.getTime();
  const nextHydrationReminder = reminders.find((item) => !item.canceledAt && item.scheduledAt.getTime() > nowTime)?.scheduledAt || null;

  reminders.forEach((reminder, index) => {
    const scheduledTime = reminder.scheduledAt.getTime();
    if (reminder.canceledAt && reminder.canceledAt.getTime() <= scheduledTime) return;
    if (scheduledTime > nowTime) return;

    const nextReminderTime = reminders[index + 1]?.scheduledAt.getTime();
    const responseWindowEnd = Math.min(
      scheduledTime + RESPONSE_WINDOW_MS,
      nextReminderTime && nextReminderTime > scheduledTime ? nextReminderTime : Number.POSITIVE_INFINITY,
    );
    const reminderHour = localHourKey(reminder.scheduledAt);
    const responded = entryTimes.some((entryTime) => {
      const time = entryTime.getTime();
      return (time >= scheduledTime && time <= responseWindowEnd) || localHourKey(entryTime) === reminderHour;
    });

    if (responded) respondedTimes.push(formatTime(reminder.scheduledAt));
    else missedTimes.push(formatTime(reminder.scheduledAt));
  });

  return {
    missedCount: missedTimes.length,
    missedTimes,
    respondedTimes,
    scheduledTodayCount: reminders.filter((item) => !item.canceledAt || item.canceledAt.getTime() > item.scheduledAt.getTime()).length,
    nextHydrationReminder: nextHydrationReminder ? formatTime(nextHydrationReminder) : null,
    hasReminderEvidence: reminders.length > 0,
  };
}

export const HYDRATION_REMINDER_RESPONSE_WINDOW_MINUTES = 30;
