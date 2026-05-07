/**
 * Local Notifications Only (Expo SDK 53, Expo Go)
 *
 * This service configures and schedules LOCAL notifications only.
 * - No remote push tokens, no FCM/APNs, no server calls.
 * - Works inside Expo Go without a dev client or EAS build.
 *
 * Quick examples:
 *   await requestPermissions();
 *   await scheduleReminderInSeconds('Drink Water', '200ml now', 5);
 *   await scheduleDailyReminder('Evening Meds', 'Take your pills', 21, 0);
 */
import type * as ExpoNotifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { notificationSettings } from './notificationSettings';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CacheOwner, getCacheOwner, getCachedSession, getUserScopedKey } from './offlineStorage';

export const HYDRATION_CHANNEL_ID = 'intakesync_hydration_v1';
export const MEDICATION_CHANNEL_ID = 'intakesync_medication_v1';
const HYDRATION_SOUND = 'hydration_reminder.wav';
const MEDICATION_SOUND = 'medication_reminder.wav';
const PERMISSION_ASKED_KEY = '@intakesync:notification_permission_asked';
const HYDRATION_HOURS = [8, 10, 12, 14, 16, 18, 20, 22];
const MEDICATION_REMINDER_OFFSETS = [30, 15, 5];
let schedulingHydration = false;
let schedulingMedicationReminders = false;

// Check if running in Expo Go (push notifications not supported, but local notifications work)
const isExpoGo = (Constants as any).appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';

const shouldSuppressExpoGoPushMessage = (msg: any) => {
  const text = (msg?.toString?.() || String(msg)).toLowerCase();
  return (
    text.includes('expo go') &&
    (text.includes('push notifications') || text.includes('remote notifications'))
  );
};

if (isExpoGo) {
  console.log('Expo Go detected: using local notifications only.');
}

// Suppress Expo Go remote push warnings before expo-notifications is loaded.
const originalWarn = console.warn;
const originalError = console.error;
console.warn = (...args: any[]) => {
  if (isExpoGo && args.some(shouldSuppressExpoGoPushMessage)) return;
  originalWarn.apply(console, args);
};
console.error = (...args: any[]) => {
  if (isExpoGo && args.some(shouldSuppressExpoGoPushMessage)) return;
  originalError.apply(console, args);
};

let notificationsModule: typeof ExpoNotifications | null = null;

function getNotifications(): typeof ExpoNotifications | null {
  if (notificationsModule) return notificationsModule;

  try {
    notificationsModule = require('expo-notifications');
    notificationsModule?.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    return notificationsModule;
  } catch (error) {
    if (isExpoGo) {
      console.log('Expo Go detected: using local notifications only.');
    } else {
      console.error('Notifications module unavailable:', error);
    }
    return null;
  }
}

export interface NotificationData {
  type: 'hydration' | 'medication';
  id?: string;
  medicationId?: string;
  doseKey?: string;
  scheduleKey?: string;
  doseTime?: string;
  reminderOffsetMinutes?: number;
  scheduledAt?: string;
  suggestedAmount?: number;
  amount?: number;
  [key: string]: any;
}

export interface ScheduledNotificationRef {
  id?: string;
  owner_id?: string | number | null;
  owner_email?: string | null;
  medicationId?: string;
  medicationName?: string;
  suggestedAmount?: number;
  amount?: number;
  doseKey?: string;
  notificationId: string;
  type: 'medication' | 'hydration';
  scheduleKey?: string;
  doseTime?: string;
  reminderOffsetMinutes?: number;
  scheduledAt: string;
  createdAt?: string;
}

type HydrationScheduleOptions = {
  currentTotal?: number;
  goal?: number;
  owner?: CacheOwner | null;
};

class NotificationService {
  public scheduledNotifications: Map<string, string> = new Map();

  async ensureAndroidChannels(): Promise<void> {
    const Notifications = getNotifications();
    if (!Notifications || Platform.OS !== 'android') {
      return;
    }

    try {
      await Notifications.setNotificationChannelAsync(HYDRATION_CHANNEL_ID, {
        name: 'Hydration Reminders',
        importance: Notifications.AndroidImportance.HIGH,
        sound: HYDRATION_SOUND,
        vibrationPattern: [0, 250, 250, 250],
        enableVibrate: true,
      });

      await Notifications.setNotificationChannelAsync(MEDICATION_CHANNEL_ID, {
        name: 'Medication Reminders',
        importance: Notifications.AndroidImportance.HIGH,
        sound: MEDICATION_SOUND,
        vibrationPattern: [0, 250, 250, 250],
        enableVibrate: true,
      });
    } catch (channelError) {
      console.log('Error setting notification channels (non-critical):', channelError);
    }
  }

  private async getSoundForType(type?: NotificationData['type']): Promise<string | false> {
    try {
      await notificationSettings.initialize();
      const settings = notificationSettings.getSettings();
      const categoryEnabled =
        type === 'hydration'
          ? settings.categories.hydration
          : type === 'medication'
            ? settings.categories.medications
            : true;

      if (!settings.masterToggle || !settings.soundEnabled || !categoryEnabled) {
        return false;
      }

      if (type === 'hydration') return HYDRATION_SOUND;
      if (type === 'medication') return MEDICATION_SOUND;
      return false;
    } catch {
      if (type === 'hydration') return HYDRATION_SOUND;
      if (type === 'medication') return MEDICATION_SOUND;
      return false;
    }
  }

  private getChannelIdForType(type?: NotificationData['type']): string | undefined {
    if (type === 'hydration') return HYDRATION_CHANNEL_ID;
    if (type === 'medication') return MEDICATION_CHANNEL_ID;
    return undefined;
  }

  async getPermissionStatus(): Promise<{ granted: boolean; status?: string; canAskAgain?: boolean }> {
    try {
      const Notifications = getNotifications();
      if (!Notifications || !Device.isDevice) {
        return { granted: false, status: 'unavailable', canAskAgain: false };
      }
      const response = await Notifications.getPermissionsAsync();
      return {
        granted: response.status === 'granted',
        status: response.status,
        canAskAgain: response.canAskAgain,
      };
    } catch {
      return { granted: false, status: 'unavailable', canAskAgain: false };
    }
  }

  private async canScheduleType(type?: NotificationData['type']): Promise<boolean> {
    if (!type) return true;
    await notificationSettings.initialize();
    const settings = notificationSettings.getSettings();
    const categoryEnabled =
      type === 'hydration'
        ? settings.categories.hydration
        : type === 'medication'
          ? settings.categories.medications
          : true;
    if (!settings.masterToggle || !categoryEnabled) return false;
    return (await this.getPermissionStatus()).granted;
  }

  /**
   * Request notification permissions (local notifications only in Expo Go)
   */
  async requestPermissions(): Promise<boolean> {
    try {
      const Notifications = getNotifications();
      if (!Notifications) {
        return false;
      }

      if (!Device.isDevice) {
        console.log('Notifications are not available on simulator/emulator');
        return false;
      }

      // In Expo Go, we can only use local notifications
      if (isExpoGo) {
        console.log('Expo Go detected - requesting local notification permissions only');
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const asked = await AsyncStorage.getItem(PERMISSION_ASKED_KEY);
        if (asked === '1') return false;
        await AsyncStorage.setItem(PERMISSION_ASKED_KEY, '1');
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Notification permissions not granted');
        return false;
      }

      await this.ensureAndroidChannels();

      return true;
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
      return false;
    }
  }

  /**
   * Schedule a single notification
   */
  async scheduleNotification(
    title: string,
    body: string,
    trigger: Date | number,
    data?: NotificationData
  ): Promise<string | null> {
    try {
      const Notifications = getNotifications();
      if (!Notifications) {
        return null;
      }
      if (!(await this.canScheduleType(data?.type))) {
        return null;
      }

      const channelId = this.getChannelIdForType(data?.type);
      const sound = await this.getSoundForType(data?.type);
      const triggerInput = trigger instanceof Date
        ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date: trigger, channelId }
        : { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: trigger, channelId };

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound,
          data: data || {},
        },
        trigger: triggerInput as any,
      });

      return notificationId;
    } catch (error) {
      console.error('Error scheduling notification:', error);
      return null;
    }
  }

  /**
   * Schedule a recurring notification (daily)
   */
  async scheduleRecurringNotification(
    title: string,
    body: string,
    hour: number,
    minute: number,
    data?: NotificationData
  ): Promise<string | null> {
    try {
      const Notifications = getNotifications();
      if (!Notifications) {
        return null;
      }
      if (!(await this.canScheduleType(data?.type))) {
        return null;
      }

      const channelId = this.getChannelIdForType(data?.type);
      const sound = await this.getSoundForType(data?.type);

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound,
          data: data || {},
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
          hour,
          minute,
          repeats: true,
          channelId,
        } as any,
      });

      return notificationId;
    } catch (error) {
      console.error('Error scheduling recurring notification:', error);
      return null;
    }
  }

  /**
   * Schedule medication notifications based on medication times
   */
  async scheduleMedicationNotifications(
    medicationId: string,
    medicationName: string,
    dosage: string,
    times: string[],
    backendNotificationId?: string,
    options?: {
      owner?: CacheOwner | null;
      startDate?: string | null;
      endDate?: string | null;
      frequency?: 'daily' | 'weekly' | 'monthly' | 'custom';
      daysOfWeek?: number[];
      lookaheadDays?: number;
    }
  ): Promise<void> {
    if (schedulingMedicationReminders) return;
    schedulingMedicationReminders = true;
    try {
      const owner = await resolveNotificationOwner(options?.owner);
      if (!owner) return;

      await notificationSettings.initialize();
      const settings = notificationSettings.getSettings();
      if (!settings.masterToggle || !settings.categories.medications) {
        await this.cancelMedicationNotifications(medicationId, owner);
        return;
      }

      const hasPermission = await this.requestPermissions();
      if (!hasPermission) return;

      const refs = await getScheduledNotificationRefs(owner);
      const existingKeys = new Set(
        refs
          .filter((ref) => ref.type === 'medication' && ref.medicationId === medicationId)
          .map((ref) => refSlot(ref))
      );

      for (const doseTime of getMedicationDoseOccurrences(times, options)) {
        for (const offsetMinutes of MEDICATION_REMINDER_OFFSETS) {
          const triggerDate = new Date(doseTime.getTime() - offsetMinutes * 60 * 1000);
          if (triggerDate.getTime() <= Date.now()) continue;
          const scheduleKey = getMedicationScheduleKey(owner, medicationId, doseTime, offsetMinutes);
          if (existingKeys.has(scheduleKey)) continue;

          const doseTimeIso = doseTime.toISOString();
          const title = dosage ? `Take ${dosage} ${medicationName}` : `Take ${medicationName}`;
          const body = `Medication dose at ${doseTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}`;
          const notificationId = await this.scheduleNotification(
            title,
            body,
            triggerDate,
            {
              type: 'medication',
              medicationId,
              doseKey: scheduleKey,
              scheduleKey,
              doseTime: doseTimeIso,
              reminderOffsetMinutes: offsetMinutes,
              scheduledAt: triggerDate.toISOString(),
              id: backendNotificationId,
            }
          );

          if (notificationId) {
            existingKeys.add(scheduleKey);
            if (backendNotificationId) this.scheduledNotifications.set(backendNotificationId, notificationId);
            await saveScheduledNotificationRef({
              ...owner,
              id: scheduleKey,
              type: 'medication',
              medicationId,
              medicationName,
              doseKey: scheduleKey,
              scheduleKey,
              doseTime: doseTimeIso,
              reminderOffsetMinutes: offsetMinutes,
              notificationId,
              scheduledAt: triggerDate.toISOString(),
              createdAt: new Date().toISOString(),
            });
          }
        }
      }
    } catch (error) {
      console.error('Error scheduling medication notifications:', error);
    } finally {
      schedulingMedicationReminders = false;
    }
  }

  /**
   * Schedule hydration reminder
   */
  async scheduleHydrationReminder(
    intervalMinutes: number = 120,
    amountMl: number = 200,
    backendNotificationId?: string,
    owner?: CacheOwner,
    scheduledAt?: Date
  ): Promise<void> {
    try {
      const nextReminder = scheduledAt || new Date(Date.now() + intervalMinutes * 60 * 1000);
      const cacheOwner = await resolveNotificationOwner(owner);
      if (!cacheOwner) return;
      await notificationSettings.initialize();
      const settings = notificationSettings.getSettings();
      if (!settings.masterToggle || !settings.categories.hydration) {
        await cancelHydrationNotifications(cacheOwner);
        return;
      }
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) return;
      const scheduleKey = getHydrationScheduleKey(nextReminder);
      if (await isHydrationReminderAlreadyScheduled(cacheOwner, scheduleKey)) return;

      const notificationId = await this.scheduleNotification(
        'Time to hydrate 💧',
        `${amountMl}ml suggested to stay hydrated`,
        nextReminder,
        {
          type: 'hydration',
          amount: amountMl,
          suggestedAmount: amountMl,
          doseKey: scheduleKey,
          scheduledAt: nextReminder.toISOString(),
          id: backendNotificationId,
        }
      );

      if (notificationId) {
        if (backendNotificationId) this.scheduledNotifications.set(backendNotificationId, notificationId);
        await saveScheduledNotificationRef({
          ...cacheOwner,
          id: `hydration:${scheduleKey}`,
              type: 'hydration',
              doseKey: scheduleKey,
              scheduleKey,
              amount: amountMl,
              suggestedAmount: amountMl,
              notificationId,
              scheduledAt: nextReminder.toISOString(),
              createdAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('Error scheduling hydration reminder:', error);
    }
  }

  /**
   * Snooze a notification
   */
  async snoozeNotification(
    notificationId: string,
    minutes: number = 15,
    backendNotificationId?: string
  ): Promise<void> {
    try {
      const Notifications = getNotifications();
      if (!Notifications) {
        return;
      }

      // Cancel the original notification
      if (notificationId) {
        await Notifications.cancelScheduledNotificationAsync(notificationId);
      }

      // Schedule new notification
      const snoozeTime = new Date(Date.now() + minutes * 60 * 1000);
      await this.scheduleNotification(
        'Reminder Snoozed',
        'Your reminder has been snoozed',
        snoozeTime,
        {
          type: 'medication', // Will be updated based on original notification
        }
      );

      // No backend updates in local-only mode
    } catch (error) {
      console.error('Error snoozing notification:', error);
    }
  }

  /**
   * Cancel a notification
   */
  async cancelNotification(notificationId: string): Promise<void> {
    try {
      const Notifications = getNotifications();
      if (!Notifications) {
        return;
      }

      await Notifications.cancelScheduledNotificationAsync(notificationId);
      await removeScheduledNotificationRef(notificationId);
    } catch (error) {
      console.error('Error canceling notification:', error);
    }
  }

  /**
   * Cancel all notifications for a medication
   */
  async cancelMedicationNotifications(medicationId: string, ownerArg?: CacheOwner | null): Promise<void> {
    try {
      const owner = await resolveNotificationOwner(ownerArg);
      if (!owner) return;
      const refs = await getScheduledNotificationRefs(owner);
      const medicationRefs = refs.filter((ref) => ref.type === 'medication' && ref.medicationId === medicationId);
      const Notifications = getNotifications();
      if (Notifications) {
        await Promise.all(medicationRefs.map((ref) => Notifications.cancelScheduledNotificationAsync(ref.notificationId).catch(() => undefined)));
      }
      await writeScheduledNotificationRefs(refs.filter((ref) => !(ref.type === 'medication' && ref.medicationId === medicationId)), owner);
    } catch (error) {
      console.error('Error canceling medication notifications:', error);
    }
  }

  /**
   * Cancel all notifications
   */
  async cancelAllNotifications(): Promise<void> {
    try {
      const Notifications = getNotifications();
      if (!Notifications) {
        this.scheduledNotifications.clear();
        return;
      }

      await Notifications.cancelAllScheduledNotificationsAsync();
      this.scheduledNotifications.clear();
      await writeScheduledNotificationRefs([]);
    } catch (error) {
      console.error('Error canceling all notifications:', error);
    }
  }

  /**
   * Get all scheduled notifications
   */
  async getAllScheduledNotifications(): Promise<ExpoNotifications.NotificationRequest[]> {
    try {
      const Notifications = getNotifications();
      if (!Notifications) {
        return [];
      }

      return await Notifications.getAllScheduledNotificationsAsync();
    } catch (error) {
      console.error('Error getting scheduled notifications:', error);
      return [];
    }
  }

  /**
   * Setup notification response handlers
   */
  setupNotificationHandlers(
    onNotificationReceived?: (notification: ExpoNotifications.Notification) => void,
    onNotificationTapped?: (response: ExpoNotifications.NotificationResponse) => void
  ) {
    const Notifications = getNotifications();
    if (!Notifications) {
      return () => {};
    }

    // Handle notification received while app is in foreground
    const receivedListener = Notifications.addNotificationReceivedListener((notification) => {
      console.log('Notification received:', notification);
      if (onNotificationReceived) {
        onNotificationReceived(notification);
      }
    });

    // Handle notification tapped/opened
    const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('Notification tapped:', response);
      if (onNotificationTapped) {
        onNotificationTapped(response);
      }
    });

    return () => {
      receivedListener.remove();
      responseListener.remove();
    };
  }

  /**
   * Mark notification as completed
   */
  async markCompleted(_backendNotificationId: string): Promise<void> {
    // No-op in local-only mode
    return Promise.resolve();
  }
}

// Export singleton instance
export const notificationService = new NotificationService();

// Default export for module compatibility
export default notificationService;

// Convenience helpers for common local reminders
export async function scheduleReminderInSeconds(title: string, body: string, seconds: number) {
  return notificationService.scheduleNotification(title, body, seconds);
}

export async function scheduleDailyReminder(title: string, body: string, hour: number, minute: number) {
  return notificationService.scheduleRecurringNotification(title, body, hour, minute);
}

async function resolveNotificationOwner(owner?: CacheOwner | null): Promise<CacheOwner | null> {
  const session = owner ? null : await getCachedSession();
  const cacheOwner = owner || getCacheOwner(session?.user ?? null);
  if (!cacheOwner.owner_id && !cacheOwner.owner_email && !cacheOwner.id && !cacheOwner.email) return null;
  return getCacheOwner({ id: cacheOwner.id ?? cacheOwner.owner_id, email: cacheOwner.email ?? cacheOwner.owner_email });
}

function notificationRefsKey(owner: CacheOwner) {
  return getUserScopedKey(owner, 'scheduled_notification_refs');
}

function refSlot(ref: ScheduledNotificationRef) {
  return ref.scheduleKey || ref.doseKey || ref.scheduledAt;
}

export function getHydrationScheduleKey(dateTime: Date) {
  const year = dateTime.getFullYear();
  const month = `${dateTime.getMonth() + 1}`.padStart(2, '0');
  const day = `${dateTime.getDate()}`.padStart(2, '0');
  const hour = `${dateTime.getHours()}`.padStart(2, '0');
  const minute = `${dateTime.getMinutes()}`.padStart(2, '0');
  return `hydration:${year}-${month}-${day}:${hour}:${minute}`;
}

function dateParts(dateTime: Date) {
  const year = dateTime.getFullYear();
  const month = `${dateTime.getMonth() + 1}`.padStart(2, '0');
  const day = `${dateTime.getDate()}`.padStart(2, '0');
  const hour = `${dateTime.getHours()}`.padStart(2, '0');
  const minute = `${dateTime.getMinutes()}`.padStart(2, '0');
  return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
}

function getOwnerSchedulePart(owner: CacheOwner) {
  return String(owner.owner_id ?? owner.id ?? owner.owner_email ?? owner.email ?? 'unknown');
}

export function getMedicationScheduleKey(owner: CacheOwner, medicationId: string, doseTime: Date, offsetMinutes: number) {
  const parts = dateParts(doseTime);
  return `medication:${getOwnerSchedulePart(owner)}:${medicationId}:${parts.date}:${parts.time}:${offsetMinutes}`;
}

function parseLocalDate(dateString?: string | null) {
  if (!dateString) return null;
  const [year, month, day] = dateString.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function getMedicationDoseOccurrences(
  times: string[],
  options?: {
    startDate?: string | null;
    endDate?: string | null;
    frequency?: 'daily' | 'weekly' | 'monthly' | 'custom';
    daysOfWeek?: number[];
    lookaheadDays?: number;
  }
) {
  const now = new Date();
  const lookaheadDays = Math.max(1, Math.min(options?.lookaheadDays || 14, 30));
  const start = parseLocalDate(options?.startDate);
  const end = parseLocalDate(options?.endDate);
  if (end) end.setHours(23, 59, 59, 999);
  const occurrences: Date[] = [];

  for (let dayOffset = 0; dayOffset <= lookaheadDays; dayOffset += 1) {
    const day = new Date(now);
    day.setDate(now.getDate() + dayOffset);
    day.setHours(0, 0, 0, 0);
    if (start && day.getTime() < start.getTime()) continue;
    if (end && day.getTime() > end.getTime()) continue;
    if (options?.frequency === 'weekly' && options.daysOfWeek?.length && !options.daysOfWeek.includes(day.getDay())) continue;

    times.forEach((timeStr) => {
      const source = new Date(timeStr);
      if (Number.isNaN(source.getTime())) return;
      const doseTime = new Date(day);
      doseTime.setHours(source.getHours(), source.getMinutes(), source.getSeconds(), 0);
      if (doseTime.getTime() > now.getTime()) occurrences.push(doseTime);
    });
  }

  return occurrences.sort((a, b) => a.getTime() - b.getTime());
}

function getUpcomingHydrationSlots() {
  const now = new Date();
  const slots: Date[] = [];
  for (const hour of HYDRATION_HOURS) {
    const slot = new Date(now);
    slot.setHours(hour, 0, 0, 0);
    if (slot > now) slots.push(slot);
  }
  return slots;
}

async function writeScheduledNotificationRefs(refs: ScheduledNotificationRef[], owner?: CacheOwner | null) {
  try {
    const cacheOwner = await resolveNotificationOwner(owner);
    if (!cacheOwner) return;
    await AsyncStorage.setItem(notificationRefsKey(cacheOwner), JSON.stringify(refs));
  } catch {}
}

export async function getScheduledNotificationRefs(owner?: CacheOwner | null): Promise<ScheduledNotificationRef[]> {
  try {
    const cacheOwner = await resolveNotificationOwner(owner);
    if (!cacheOwner) return [];
    const raw = await AsyncStorage.getItem(notificationRefsKey(cacheOwner));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveScheduledNotificationRef(ref: ScheduledNotificationRef) {
  const owner = await resolveNotificationOwner(ref);
  if (!owner) return;
  const refs = await getScheduledNotificationRefs(owner);
  const next = refs.filter((item) => !(item.type === ref.type && refSlot(item) === refSlot(ref) && item.medicationId === ref.medicationId));
  next.push(ref);
  await writeScheduledNotificationRefs(next, owner);
}

async function removeScheduledNotificationRef(notificationId: string) {
  const owner = await resolveNotificationOwner();
  if (!owner) return;
  const refs = await getScheduledNotificationRefs(owner);
  await writeScheduledNotificationRefs(refs.filter((ref) => ref.notificationId !== notificationId), owner);
}

export async function cancelNotificationByRef(ref: ScheduledNotificationRef) {
  await notificationService.cancelNotification(ref.notificationId);
}

export async function cancelMedicationNotifications(medicationId: string) {
  await notificationService.cancelMedicationNotifications(medicationId);
}

export async function cancelAllMedicationNotifications(ownerArg?: CacheOwner | null) {
  const owner = await resolveNotificationOwner(ownerArg);
  if (!owner) return;
  const refs = await getScheduledNotificationRefs(owner);
  const medicationRefs = refs.filter((ref) => ref.type === 'medication');
  await Promise.all(medicationRefs.map((ref) => notificationService.cancelNotification(ref.notificationId)));
  await writeScheduledNotificationRefs(refs.filter((ref) => ref.type !== 'medication'), owner);
}

export async function cancelMedicationDoseNotifications(medicationId: string, doseTimeIso: string, ownerArg?: CacheOwner | null) {
  const owner = await resolveNotificationOwner(ownerArg);
  if (!owner) return;
  const doseTime = new Date(doseTimeIso);
  if (Number.isNaN(doseTime.getTime())) return;
  const doseParts = dateParts(doseTime);
  const refs = await getScheduledNotificationRefs(owner);
  const matching = refs.filter((ref) => {
    if (ref.type !== 'medication' || ref.medicationId !== medicationId) return false;
    const refDose = ref.doseTime ? new Date(ref.doseTime) : null;
    if (refDose && !Number.isNaN(refDose.getTime())) {
      const refParts = dateParts(refDose);
      return refParts.date === doseParts.date && refParts.time === doseParts.time;
    }
    return !!ref.scheduleKey?.includes(`:${doseParts.date}:${doseParts.time}:`);
  });
  await Promise.all(matching.map((ref) => notificationService.cancelNotification(ref.notificationId)));
  await writeScheduledNotificationRefs(refs.filter((ref) => !matching.some((item) => item.notificationId === ref.notificationId)), owner);
}

export async function cancelHydrationNotifications(ownerArg?: CacheOwner | null) {
  const owner = await resolveNotificationOwner(ownerArg);
  if (!owner) return;
  const refs = await getScheduledNotificationRefs(owner);
  await Promise.all(refs.filter((ref) => ref.type === 'hydration').map((ref) => notificationService.cancelNotification(ref.notificationId)));
  await writeScheduledNotificationRefs(refs.filter((ref) => ref.type !== 'hydration'), owner);
}

export async function clearStaleNotificationRefs(ownerArg?: CacheOwner | null) {
  const owner = await resolveNotificationOwner(ownerArg);
  if (!owner) return;
  const scheduled = await notificationService.getAllScheduledNotifications();
  const scheduledIds = new Set(scheduled.map((item) => item.identifier));
  const refs = await getScheduledNotificationRefs(owner);
  const seen = new Map<string, ScheduledNotificationRef>();
  const toCancel: ScheduledNotificationRef[] = [];
  refs.forEach((ref) => {
    if (!scheduledIds.has(ref.notificationId)) return;
    const key = `${ref.type}:${ref.medicationId || ''}:${refSlot(ref)}`;
    const existing = seen.get(key);
    if (existing) toCancel.push(ref);
    else seen.set(key, ref);
  });
  await Promise.all(toCancel.map((ref) => notificationService.cancelNotification(ref.notificationId)));
  await writeScheduledNotificationRefs(Array.from(seen.values()), owner);
}

export async function clearStaleHydrationNotificationRefs(ownerArg?: CacheOwner | null) {
  await clearStaleNotificationRefs(ownerArg);
}

export async function isHydrationReminderAlreadyScheduled(ownerArg: CacheOwner | null | undefined, scheduleKey: string) {
  const owner = await resolveNotificationOwner(ownerArg);
  if (!owner) return false;
  const refs = await getScheduledNotificationRefs(owner);
  return refs.some((ref) => ref.type === 'hydration' && refSlot(ref) === scheduleKey);
}

function hydrationRefDate(ref: ScheduledNotificationRef) {
  const slot = refSlot(ref);
  const match = typeof slot === 'string' ? slot.match(/^hydration:(\d{4}-\d{2}-\d{2}):/) : null;
  if (match?.[1]) return match[1];
  if (ref.scheduledAt) return dateParts(new Date(ref.scheduledAt)).date;
  return null;
}

async function removePreviousDayHydrationRefs(owner: CacheOwner) {
  const today = dateParts(new Date()).date;
  const refs = await getScheduledNotificationRefs(owner);
  const next = refs.filter((ref) => ref.type !== 'hydration' || hydrationRefDate(ref) === today);
  if (next.length !== refs.length) await writeScheduledNotificationRefs(next, owner);
}

export async function rescheduleMedicationNotifications(medications: { id: string; name: string; dosage?: string; times?: string[]; reminder?: boolean }[]) {
  await clearStaleNotificationRefs();
  await Promise.all(medications.map((med) => (
    med.reminder === false
      ? notificationService.cancelMedicationNotifications(String(med.id))
      : notificationService.scheduleMedicationNotifications(String(med.id), med.name, med.dosage || '', med.times || [])
  )));
}

export async function rescheduleHydrationNotifications(goalOrOptions: number | HydrationScheduleOptions = 2000, intervalMinutes = 120, ownerArg?: CacheOwner | null) {
  if (schedulingHydration) return;
  schedulingHydration = true;
  try {
    const options = typeof goalOrOptions === 'number'
      ? { goal: goalOrOptions, owner: ownerArg, currentTotal: 0 }
      : goalOrOptions;
    const goal = Math.max(1, Number(options.goal || 2000));
    const currentTotal = Math.max(0, Number(options.currentTotal || 0));
    const owner = await resolveNotificationOwner(options.owner ?? ownerArg);
    if (!owner) return;
    await removePreviousDayHydrationRefs(owner);
    await notificationSettings.initialize();
    const settings = notificationSettings.getSettings();
    if (!settings.masterToggle || !settings.categories.hydration || currentTotal >= goal) {
      await cancelHydrationNotifications(owner);
      return;
    }
    const hasPermission = await notificationService.requestPermissions();
    if (!hasPermission) return;
    const slots = getUpcomingHydrationSlots();
    if (slots.length === 0) return;
    const remaining = Math.max(goal - currentTotal, 0);
    const amount = Math.max(150, Math.round(remaining / slots.length));
    for (const slot of slots) {
      await notificationService.scheduleHydrationReminder(intervalMinutes, amount, undefined, owner, slot);
    }
  } finally {
    schedulingHydration = false;
  }
}

