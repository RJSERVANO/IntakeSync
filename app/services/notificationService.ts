/**
 * Local Notifications Only (Expo SDK 54, Expo Go/development builds)
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
import { DeviceEventEmitter, Platform } from 'react-native';
import { notificationSettings } from './notificationSettings';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CacheOwner, getCacheOwner, getCachedSession, getUserScopedKey, readDeletedMedicationTombstones, readHydrationCache, readMedicationCache, readMedicationHistoryCache, writeMedicationCache } from './offlineStorage';
import { NOTIFICATIONS_UPDATED_EVENT, REMINDERS_RESCHEDULED_EVENT } from './homeEvents';

export const HYDRATION_CHANNEL_ID = 'intakesync_hydration_v1';
export const MEDICATION_CHANNEL_ID = 'intakesync_medication_v1';
export const GENERAL_NOTIFICATION_CHANNEL_ID = 'intakesync_alerts_v1';
const HYDRATION_SOUND = 'hydration_reminder.wav';
const MEDICATION_SOUND = 'medication_reminder.wav';
const MEDICATION_REMINDER_OFFSETS = [15, 5, 0];
const MIN_SCHEDULE_BUFFER_MS = 10 * 1000;
const HYDRATION_RESPONSE_WINDOW_MS = 30 * 60 * 1000;
const MEDICATION_MISSED_GRACE_MS = 30 * 60 * 1000;
export const HYDRATION_REMINDER_INTERVAL_MINUTES = 60;
const HYDRATION_LOOKAHEAD_HOURS = 14;
let schedulingHydration = false;
const schedulingMedicationIds = new Set<string>();
const VALIDATE_SCHEDULED_REFS_INTERVAL_MS = 25 * 1000;
const lastScheduledRefValidationByOwner = new Map<string, number>();

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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    notificationsModule = require('expo-notifications');
    notificationsModule?.setNotificationHandler({
      handleNotification: async (notification) => {
        const data = (notification.request.content.data || {}) as NotificationData;
        let shouldPlaySound = true;
        try {
          await notificationSettings.initialize();
          const settings = notificationSettings.getSettings();
          const categoryEnabled =
            data.type === 'hydration'
              ? settings.categories.hydration
              : data.type === 'medication'
                ? settings.categories.medications
                : true;
          shouldPlaySound = settings.masterToggle && settings.soundEnabled && categoryEnabled;
        } catch {
          shouldPlaySound = true;
        }
        return {
          shouldShowAlert: true,
          shouldPlaySound,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        };
      },
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
  dosage?: string;
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

export type LocalNotificationType = 'hydration' | 'medication' | 'general';
export type LocalNotificationStatus =
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

export interface LocalNotificationRecord {
  id: string;
  type: LocalNotificationType;
  title: string;
  message: string;
  status: LocalNotificationStatus;
  scheduled_at?: string | null;
  scheduled_time?: string | null;
  created_at?: string | null;
  delivered_at?: string | null;
  opened_at?: string | null;
  read_at?: string | null;
  metadata?: Record<string, any> | null;
}

export type HydrationReminderHistoryEvent = {
  owner_id?: string | number | null;
  owner_email?: string | null;
  notificationId?: string;
  type: 'hydration';
  scheduleKey: string;
  doseKey?: string;
  amount?: number;
  suggestedAmount?: number;
  scheduledAt: string;
  createdAt: string;
  canceledAt?: string | null;
};

type NotificationRequestLike = ExpoNotifications.NotificationRequest;

type HydrationScheduleOptions = {
  currentTotal?: number;
  goal?: number;
  owner?: CacheOwner | null;
};

type CachedMedicationForNotifications = {
  id?: string | number;
  local_id?: string | number | null;
  server_id?: string | number | null;
  client_uuid?: string | number | null;
  name?: string;
  dosage?: string;
  times?: string[];
  reminder?: boolean;
  start_date?: string | null;
  end_date?: string | null;
  frequency?: 'daily' | 'weekly' | 'monthly' | 'custom';
  days_of_week?: number[];
  created_at?: string | null;
  local_created_at?: string | null;
  schedule_created_at?: string | null;
  client_created_at?: string | null;
  deleted_at?: string | null;
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
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });

      await Notifications.setNotificationChannelAsync(MEDICATION_CHANNEL_ID, {
        name: 'Medication Reminders',
        importance: Notifications.AndroidImportance.HIGH,
        sound: MEDICATION_SOUND,
        vibrationPattern: [0, 250, 250, 250],
        enableVibrate: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });

      await Notifications.setNotificationChannelAsync(GENERAL_NOTIFICATION_CHANNEL_ID, {
        name: 'General Alerts',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250],
        enableVibrate: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
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
    return GENERAL_NOTIFICATION_CHANNEL_ID;
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

      const { status: existingStatus, canAskAgain } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        if (canAskAgain === false) return false;
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
      scheduleCreatedAt?: string | null;
    }
  ): Promise<void> {
    if (schedulingMedicationIds.has(medicationId)) return;
    schedulingMedicationIds.add(medicationId);
    try {
      const owner = await resolveNotificationOwner(options?.owner);
      if (!owner) return;
      await validateScheduledNotificationRefs(owner);

      await notificationSettings.initialize();
      const settings = notificationSettings.getSettings();
      if (!settings.masterToggle || !settings.categories.medications) {
        await this.cancelMedicationNotifications(medicationId, owner);
        return;
      }

      const doseOccurrences = getMedicationDoseOccurrences(times, options);
      const desiredKeys = new Set<string>();
      const now = Date.now();
      for (const doseTime of doseOccurrences) {
        for (const offsetMinutes of MEDICATION_REMINDER_OFFSETS) {
          const triggerDate = new Date(doseTime.getTime() - offsetMinutes * 60 * 1000);
          if (triggerDate.getTime() > now + MIN_SCHEDULE_BUFFER_MS) {
            desiredKeys.add(getMedicationScheduleKey(owner, medicationId, doseTime, offsetMinutes));
          }
        }
      }
      await cancelObsoleteMedicationNotifications(owner, medicationId, desiredKeys);

      const hasPermission = await this.requestPermissions();
      if (!hasPermission) return;

      const refs = await getScheduledNotificationRefs(owner);
      const scheduled = getNotifications() ? await getNotifications()!.getAllScheduledNotificationsAsync() : [];
      const scheduledIds = new Set(scheduled.map((item) => item.identifier));
      const existingKeys = new Set(
        refs
          .filter((ref) => ref.type === 'medication' && scheduledIds.has(ref.notificationId))
          .map((ref) => refSlot(ref))
      );

      for (const doseTime of doseOccurrences) {
        for (const offsetMinutes of MEDICATION_REMINDER_OFFSETS) {
          const triggerDate = new Date(doseTime.getTime() - offsetMinutes * 60 * 1000);
          if (triggerDate.getTime() <= now + MIN_SCHEDULE_BUFFER_MS) continue;
          const scheduleKey = getMedicationScheduleKey(owner, medicationId, doseTime, offsetMinutes);
          if (existingKeys.has(scheduleKey)) continue;
          const cleaned = await ensureUniqueScheduledSlot(owner, 'medication', scheduleKey);
          if (cleaned) {
            existingKeys.add(scheduleKey);
            continue;
          }

          const doseTimeIso = doseTime.toISOString();
          const doseTimeLabel = doseTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
          const title = offsetMinutes > 0
            ? `${medicationName} in ${offsetMinutes} minutes`
            : `Time to take ${medicationName}`;
          const body = offsetMinutes > 0
            ? `Dose at ${doseTimeLabel}`
            : `${dosage ? dosage : 'Dose'} scheduled now`;
          const notificationId = await this.scheduleNotification(
            title,
            body,
            triggerDate,
            {
              type: 'medication',
              owner_id: owner.owner_id,
              owner_email: owner.owner_email,
              medicationId,
              medicationName,
              dosage,
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
              dosage,
              doseKey: scheduleKey,
              scheduleKey,
              doseTime: doseTimeIso,
              reminderOffsetMinutes: offsetMinutes,
              notificationId,
              scheduledAt: triggerDate.toISOString(),
              createdAt: new Date().toISOString(),
            });
            await upsertLocalNotificationRecord(owner, localInboxRecordFromRef({
              ...owner,
              id: scheduleKey,
              type: 'medication',
              medicationId,
              medicationName,
              dosage,
              doseKey: scheduleKey,
              scheduleKey,
              doseTime: doseTimeIso,
              reminderOffsetMinutes: offsetMinutes,
              notificationId,
              scheduledAt: triggerDate.toISOString(),
              createdAt: new Date().toISOString(),
            }, 'scheduled'));
          }
        }
      }
      await validateScheduledNotificationRefs(owner);
      DeviceEventEmitter.emit(REMINDERS_RESCHEDULED_EVENT, { type: 'medication', medicationId, at: Date.now() });
    } catch (error) {
      console.error('Error scheduling medication notifications:', error);
    } finally {
      schedulingMedicationIds.delete(medicationId);
    }
  }

  /**
   * Schedule hydration reminder
   */
  async scheduleHydrationReminder(
    intervalMinutes: number = HYDRATION_REMINDER_INTERVAL_MINUTES,
    amountMl: number = 200,
    backendNotificationId?: string,
    owner?: CacheOwner,
    scheduledAt?: Date,
    progressPercent?: number
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
      if (nextReminder.getTime() <= Date.now() + MIN_SCHEDULE_BUFFER_MS) return;
      const scheduleKey = getHydrationScheduleKey(cacheOwner, nextReminder);
      if (await ensureUniqueScheduledSlot(cacheOwner, 'hydration', scheduleKey)) return;
      void progressPercent;
      const body = `${amountMl} ml suggested`;

      const notificationId = await this.scheduleNotification(
        'Time to hydrate',
        body,
        nextReminder,
        {
          type: 'hydration',
          owner_id: cacheOwner.owner_id,
          owner_email: cacheOwner.owner_email,
          amount: amountMl,
          suggestedAmount: amountMl,
          doseKey: scheduleKey,
          scheduleKey,
          scheduledAt: nextReminder.toISOString(),
          id: backendNotificationId,
        }
      );

      if (notificationId) {
        if (backendNotificationId) this.scheduledNotifications.set(backendNotificationId, notificationId);
        await saveScheduledNotificationRef({
          ...cacheOwner,
          id: scheduleKey,
          type: 'hydration',
          doseKey: scheduleKey,
          scheduleKey,
          amount: amountMl,
          suggestedAmount: amountMl,
          notificationId,
          scheduledAt: nextReminder.toISOString(),
          createdAt: new Date().toISOString(),
        });
        await upsertLocalNotificationRecord(cacheOwner, localInboxRecordFromRef({
          ...cacheOwner,
          id: scheduleKey,
          type: 'hydration',
          doseKey: scheduleKey,
          scheduleKey,
          amount: amountMl,
          suggestedAmount: amountMl,
          notificationId,
          scheduledAt: nextReminder.toISOString(),
          createdAt: new Date().toISOString(),
        }, 'scheduled'));
        await validateScheduledNotificationRefs(cacheOwner);
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
      DeviceEventEmitter.emit(REMINDERS_RESCHEDULED_EVENT, { type: 'medication', medicationId, at: Date.now() });
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
      const owner = await resolveNotificationOwner();
      if (owner) {
        const refs = await getScheduledNotificationRefs(owner);
        await markHydrationReminderHistoryCanceled(owner, new Set(refs.filter((ref) => ref.type === 'hydration').map((ref) => refSlot(ref))));
      }
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
      void (async () => {
        const data = notification.request.content.data || {};
        const owner = await resolveOwnerFromNotificationData(data);
        if (owner) {
          await upsertLocalNotificationRecord(owner, notificationRecordFromDeliveredNotification(notification, 'delivered'));
        }
      })();
      DeviceEventEmitter.emit(NOTIFICATIONS_UPDATED_EVENT, { at: Date.now(), source: 'foreground' });
      if (onNotificationReceived) {
        onNotificationReceived(notification);
      }
    });

    // Handle notification tapped/opened
    const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
      void recordNotificationResponse(response);
      DeviceEventEmitter.emit(NOTIFICATIONS_UPDATED_EVENT, { at: Date.now(), source: 'tap' });
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

function hydrationReminderHistoryKey(owner: CacheOwner) {
  return getUserScopedKey(owner, 'hydration_reminder_history');
}

export function getNotificationInboxKey(owner: CacheOwner) {
  return getUserScopedKey(owner, 'notification_inbox');
}

function refSlot(ref: ScheduledNotificationRef) {
  return ref.scheduleKey || ref.doseKey || ref.scheduledAt;
}

function getOwnerSchedulePart(owner: CacheOwner) {
  return String(owner.owner_id ?? owner.id ?? owner.owner_email ?? owner.email ?? 'unknown');
}

function scheduleKeyBelongsToOwner(scheduleKey: string | undefined, owner: CacheOwner) {
  if (!scheduleKey) return false;
  const ownerPart = getOwnerSchedulePart(owner);
  return scheduleKey.includes(`:${ownerPart}:`);
}

function normalizeMedicationIdentity(value: string | number | null | undefined) {
  return String(value ?? '').trim();
}

function stableMedicationNotificationId(medication: Partial<CachedMedicationForNotifications> & { client_uuid?: string | number | null }) {
  return normalizeMedicationIdentity(medication.local_id ?? medication.client_uuid ?? medication.id ?? medication.server_id);
}

function cachedMedicationIdentityValues(medication: Partial<CachedMedicationForNotifications> & { client_uuid?: string | number | null }) {
  return [
    medication.local_id,
    medication.client_uuid,
    medication.id,
    medication.server_id,
  ]
    .filter((value) => value !== null && value !== undefined && String(value).trim())
    .map((value) => String(value));
}

function getScheduledRequestData(request: NotificationRequestLike): NotificationData {
  return (request.content?.data || {}) as NotificationData;
}

function getScheduledRequestKey(request: NotificationRequestLike) {
  const data = getScheduledRequestData(request);
  return typeof data.scheduleKey === 'string' && data.scheduleKey.trim()
    ? data.scheduleKey
    : typeof data.doseKey === 'string' && data.doseKey.trim()
      ? data.doseKey
      : '';
}

function getLegacyScheduledRequestKey(request: NotificationRequestLike) {
  const data = getScheduledRequestData(request);
  if (data.type !== 'medication' && data.type !== 'hydration') return '';
  const contentKey = `${data.type}:${request.content?.title || ''}:${request.content?.body || ''}`;
  const triggerKey = JSON.stringify(request.trigger || {});
  return `legacy:${contentKey}:${triggerKey}`;
}

function getSemanticScheduledRequestKey(request: NotificationRequestLike) {
  const data = getScheduledRequestData(request);
  if (data.type === 'medication') {
    const dose = data.doseTime || data.scheduledAt || '';
    const offset = data.reminderOffsetMinutes ?? '';
    return `semantic:medication:${request.content?.title || ''}:${request.content?.body || ''}:${dose}:${offset}`;
  }
  if (data.type === 'hydration') {
    return `semantic:hydration:${request.content?.title || ''}:${data.scheduledAt || ''}:${JSON.stringify(request.trigger || {})}`;
  }
  return '';
}

function getRequestScheduledTime(request: NotificationRequestLike) {
  const data = getScheduledRequestData(request);
  if (typeof data.scheduledAt === 'string') {
    const scheduledAt = new Date(data.scheduledAt).getTime();
    if (Number.isFinite(scheduledAt)) return scheduledAt;
  }
  const trigger: any = request.trigger || {};
  const rawValue = trigger.value ?? trigger.date ?? trigger.timestamp;
  if (typeof rawValue === 'number') {
    return rawValue < 10000000000 ? Date.now() + rawValue * 1000 : rawValue;
  }
  if (typeof rawValue === 'string') {
    const parsed = new Date(rawValue).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function buildRefFromScheduledRequest(request: NotificationRequestLike, owner: CacheOwner): ScheduledNotificationRef | null {
  const data = getScheduledRequestData(request);
  if (data.type !== 'medication' && data.type !== 'hydration') return null;
  const scheduleKey = getScheduledRequestKey(request);
  if (!scheduleKey) return null;
  const scheduledAt = typeof data.scheduledAt === 'string' ? data.scheduledAt : new Date().toISOString();
  return {
    ...owner,
    id: scheduleKey,
    type: data.type,
    medicationId: data.medicationId ? String(data.medicationId) : undefined,
    doseKey: scheduleKey,
    scheduleKey,
    doseTime: data.doseTime,
    reminderOffsetMinutes: data.reminderOffsetMinutes,
    amount: data.amount,
    suggestedAmount: data.suggestedAmount,
    notificationId: request.identifier,
    scheduledAt,
    createdAt: new Date().toISOString(),
  };
}

export function getHydrationScheduleKey(ownerOrDateTime: CacheOwner | Date, maybeDateTime?: Date) {
  const owner = maybeDateTime ? ownerOrDateTime as CacheOwner : null;
  const dateTime = maybeDateTime || ownerOrDateTime as Date;
  const year = dateTime.getFullYear();
  const month = `${dateTime.getMonth() + 1}`.padStart(2, '0');
  const day = `${dateTime.getDate()}`.padStart(2, '0');
  const hour = `${dateTime.getHours()}`.padStart(2, '0');
  const minute = `${dateTime.getMinutes()}`.padStart(2, '0');
  return owner
    ? `hydration:${getOwnerSchedulePart(owner)}:${year}-${month}-${day}:${hour}:${minute}`
    : `hydration:${year}-${month}-${day}:${hour}:${minute}`;
}

function dateParts(dateTime: Date) {
  const year = dateTime.getFullYear();
  const month = `${dateTime.getMonth() + 1}`.padStart(2, '0');
  const day = `${dateTime.getDate()}`.padStart(2, '0');
  const hour = `${dateTime.getHours()}`.padStart(2, '0');
  const minute = `${dateTime.getMinutes()}`.padStart(2, '0');
  return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
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
    scheduleCreatedAt?: string | null;
  }
) {
  const now = new Date();
  const lookaheadDays = Math.max(1, Math.min(options?.lookaheadDays || 14, 30));
  const start = parseLocalDate(options?.startDate);
  const end = parseLocalDate(options?.endDate);
  const scheduleCreatedAt = options?.scheduleCreatedAt ? new Date(options.scheduleCreatedAt).getTime() : null;
  const scheduleCreatedMinute = scheduleCreatedAt ? new Date(scheduleCreatedAt) : null;
  if (scheduleCreatedMinute) scheduleCreatedMinute.setSeconds(0, 0);
  if (end) end.setHours(23, 59, 59, 999);
  const occurrences: Date[] = [];
  const seenOccurrences = new Set<string>();

  for (let dayOffset = 0; dayOffset <= lookaheadDays; dayOffset += 1) {
    const day = new Date(now);
    day.setDate(now.getDate() + dayOffset);
    day.setHours(0, 0, 0, 0);
    if (start && day.getTime() < start.getTime()) continue;
    if (end && day.getTime() > end.getTime()) continue;
    if ((options?.frequency === 'weekly' || options?.frequency === 'custom') && options.daysOfWeek?.length && !options.daysOfWeek.includes(day.getDay())) continue;
    if (options?.frequency === 'monthly' && start && day.getDate() !== start.getDate()) continue;

    times.forEach((timeStr) => {
      const source = new Date(timeStr);
      if (Number.isNaN(source.getTime())) return;
      const doseTime = new Date(day);
      doseTime.setHours(source.getHours(), source.getMinutes(), source.getSeconds(), 0);
      if (scheduleCreatedMinute && doseTime.getTime() < scheduleCreatedMinute.getTime()) return;
      const parts = dateParts(doseTime);
      const occurrenceKey = `${parts.date}:${parts.time}`;
      if (doseTime.getTime() > now.getTime() && !seenOccurrences.has(occurrenceKey)) {
        seenOccurrences.add(occurrenceKey);
        occurrences.push(doseTime);
      }
    });
  }

  return occurrences.sort((a, b) => a.getTime() - b.getTime());
}

function getUpcomingHydrationSlots(intervalMinutes = HYDRATION_REMINDER_INTERVAL_MINUTES) {
  const now = new Date();
  const slots: Date[] = [];
  const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const elapsed = now.getTime() - dayStart.getTime();
  const nextBoundaryElapsed = Math.ceil((elapsed + MIN_SCHEDULE_BUFFER_MS) / intervalMs) * intervalMs;
  const first = new Date(dayStart.getTime() + nextBoundaryElapsed);
  first.setSeconds(0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  for (let slot = first; slot <= end && slots.length < HYDRATION_LOOKAHEAD_HOURS; slot = new Date(slot.getTime() + intervalMinutes * 60 * 1000)) {
    if (slot.getTime() > now.getTime() + MIN_SCHEDULE_BUFFER_MS) {
      slots.push(new Date(slot));
    }
  }
  return slots;
}

async function cancelObsoleteHydrationNotifications(owner: CacheOwner, desiredScheduleKeys: Set<string>) {
  const Notifications = getNotifications();
  const refs = await getScheduledNotificationRefs(owner);
  const now = Date.now();
  const idsToCancel = new Set<string>();
  const scheduleKeysToCancel = new Set<string>();

  refs.forEach((ref) => {
    if (ref.type !== 'hydration') return;
    const key = refSlot(ref);
    const scheduledTime = getRefScheduledTime(ref);
    if (scheduledTime > now && !desiredScheduleKeys.has(key)) {
      idsToCancel.add(ref.notificationId);
      scheduleKeysToCancel.add(key);
    }
  });

  if (Notifications) {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    scheduled.forEach((request) => {
      const data = getScheduledRequestData(request);
      if (data.type !== 'hydration') return;
      const key = getScheduledRequestKey(request);
      const scheduledAt = getRequestScheduledTime(request);
      const isCurrentOwnerKey = key ? scheduleKeyBelongsToOwner(key, owner) : false;
      const isLegacyHydration = !key || /^hydration:\d{4}-\d{2}-\d{2}:/.test(key);
      if ((isCurrentOwnerKey || isLegacyHydration) && (scheduledAt === 0 || scheduledAt > now) && !desiredScheduleKeys.has(key)) {
        idsToCancel.add(request.identifier);
        if (key) scheduleKeysToCancel.add(key);
      }
    });
    await Promise.all(Array.from(idsToCancel).map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
  }

  const nextRefs = refs.filter((ref) => !idsToCancel.has(ref.notificationId) && (ref.type !== 'hydration' || desiredScheduleKeys.has(refSlot(ref)) || getRefScheduledTime(ref) <= now));
  if (nextRefs.length !== refs.length) await writeScheduledNotificationRefs(nextRefs, owner);
  await markHydrationReminderHistoryCanceled(owner, scheduleKeysToCancel);
}

async function cancelObsoleteMedicationNotifications(owner: CacheOwner, medicationId: string, desiredScheduleKeys: Set<string>) {
  const Notifications = getNotifications();
  const refs = await getScheduledNotificationRefs(owner);
  const now = Date.now();
  const idsToCancel = new Set<string>();

  refs.forEach((ref) => {
    if (ref.type !== 'medication' || ref.medicationId !== medicationId) return;
    if (getRefScheduledTime(ref) > now && !desiredScheduleKeys.has(refSlot(ref))) {
      idsToCancel.add(ref.notificationId);
    }
  });

  if (Notifications) {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    scheduled.forEach((request) => {
      const data = getScheduledRequestData(request);
      if (data.type !== 'medication' || String(data.medicationId || '') !== medicationId) return;
      const key = getScheduledRequestKey(request);
      const scheduledAt = getRequestScheduledTime(request);
      if (scheduledAt > now && scheduleKeyBelongsToOwner(key, owner) && !desiredScheduleKeys.has(key)) {
        idsToCancel.add(request.identifier);
      }
    });
    await Promise.all(Array.from(idsToCancel).map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
  }

  const nextRefs = refs.filter((ref) => !idsToCancel.has(ref.notificationId));
  if (nextRefs.length !== refs.length) await writeScheduledNotificationRefs(nextRefs, owner);
}

function getRefScheduledTime(ref: ScheduledNotificationRef) {
  const value = ref.scheduledAt || ref.doseTime;
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
}

function localInboxIdentity(record: Pick<LocalNotificationRecord, 'id' | 'metadata'>) {
  const metadata = record.metadata || {};
  return String(
    metadata.scheduleKey ||
    metadata.schedule_key ||
    metadata.doseKey ||
    metadata.dose_key ||
    metadata.notificationId ||
    metadata.notification_id ||
    record.id ||
    ''
  );
}

function localInboxRecordFromRef(ref: ScheduledNotificationRef, status: LocalNotificationStatus = 'scheduled'): LocalNotificationRecord {
  const scheduleKey = refSlot(ref);
  const scheduledAt = ref.scheduledAt || ref.doseTime || new Date().toISOString();
  const offset = Number(ref.reminderOffsetMinutes || 0);
  const doseLabel = ref.doseTime
    ? new Date(ref.doseTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
    : new Date(scheduledAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  const amount = Number(ref.suggestedAmount || ref.amount || 0);
  return {
    id: scheduleKey,
    type: ref.type,
    title: ref.type === 'hydration'
      ? 'Time to hydrate'
      : offset > 0
        ? `${ref.medicationName || 'Medication'} in ${offset} minutes`
        : `Time to take ${ref.medicationName || 'Medication'}`,
    message: ref.type === 'hydration'
      ? `${amount > 0 ? amount : 200} ml suggested`
      : offset > 0
        ? `Dose at ${doseLabel}`
        : `${ref.dosage ? ref.dosage : 'Dose'} scheduled now`,
    status,
    scheduled_at: scheduledAt,
    scheduled_time: scheduledAt,
    created_at: ref.createdAt || new Date().toISOString(),
    delivered_at: status === 'delivered' || status === 'missed' ? new Date().toISOString() : null,
    opened_at: null,
    read_at: null,
    metadata: {
      notificationId: ref.notificationId,
      notification_id: ref.notificationId,
      scheduleKey,
      schedule_key: scheduleKey,
      doseKey: ref.doseKey || scheduleKey,
      dose_key: ref.doseKey || scheduleKey,
      doseTime: ref.doseTime,
      dose_time: ref.doseTime,
      scheduledAt,
      medicationId: ref.medicationId,
      medicationName: ref.medicationName,
      dosage: ref.dosage,
      reminderOffsetMinutes: ref.reminderOffsetMinutes,
      suggestedAmount: ref.suggestedAmount,
      amount: ref.amount,
      source: ref.type === 'hydration' ? 'scheduled_hydration_reminder' : 'scheduled_medication_reminder',
    },
  };
}

function mergeLocalNotificationRecord(existing: LocalNotificationRecord | undefined, incoming: LocalNotificationRecord): LocalNotificationRecord {
  if (!existing) return incoming;
  const existingTime = Math.max(getRefScheduledTime({ scheduledAt: existing.scheduled_at || existing.scheduled_time || existing.created_at || '', notificationId: '', type: 'hydration' }), 0);
  const incomingTime = Math.max(getRefScheduledTime({ scheduledAt: incoming.scheduled_at || incoming.scheduled_time || incoming.created_at || '', notificationId: '', type: 'hydration' }), 0);
  const keepStatus = existing.status === 'cleared'
    ? existing.status
    : incoming.status === 'scheduled' && ['delivered', 'missed', 'skipped', 'failed', 'needs_attention', 'snoozed', 'completed'].includes(existing.status)
      ? existing.status
      : incoming.status || existing.status;
  return {
    ...existing,
    ...incoming,
    id: existing.id || incoming.id,
    status: keepStatus,
    scheduled_at: incoming.scheduled_at || existing.scheduled_at || null,
    scheduled_time: incoming.scheduled_time || existing.scheduled_time || null,
    created_at: existing.created_at || incoming.created_at || new Date().toISOString(),
    delivered_at: incoming.delivered_at || existing.delivered_at || null,
    opened_at: incoming.opened_at || existing.opened_at || null,
    read_at: incoming.read_at || existing.read_at || null,
    metadata: { ...(existing.metadata || {}), ...(incoming.metadata || {}) },
    ...(incomingTime >= existingTime ? { title: incoming.title || existing.title, message: incoming.message || existing.message } : {}),
  };
}

export async function readLocalNotificationInbox(ownerArg?: CacheOwner | null): Promise<LocalNotificationRecord[]> {
  try {
    const owner = await resolveNotificationOwner(ownerArg);
    if (!owner) return [];
    const raw = await AsyncStorage.getItem(getNotificationInboxKey(owner));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === 'object')
      .map((item): LocalNotificationRecord => ({
        id: String(item.id || localInboxIdentity(item)),
        type: item.type === 'hydration' || item.type === 'medication' ? item.type : 'general',
        title: String(item.title || 'Notification'),
        message: String(item.message || item.body || ''),
        status: (item.status || 'scheduled') as LocalNotificationStatus,
        scheduled_at: item.scheduled_at || item.scheduled_time || null,
        scheduled_time: item.scheduled_time || item.scheduled_at || null,
        created_at: item.created_at || new Date().toISOString(),
        delivered_at: item.delivered_at || null,
        opened_at: item.opened_at || null,
        read_at: item.read_at || null,
        metadata: item.metadata || item.data || null,
      }));
  } catch {
    return [];
  }
}

export function isUnreadActionableNotificationRecord(record: Pick<LocalNotificationRecord, 'status' | 'opened_at' | 'read_at' | 'scheduled_at' | 'scheduled_time' | 'created_at' | 'metadata'>) {
  const unreadStatuses: LocalNotificationStatus[] = ['delivered', 'missed', 'skipped', 'failed', 'needs_attention', 'snoozed'];
  const when = getSafeRecordTime(record.scheduled_at || record.scheduled_time || record.created_at);
  const isFutureScheduled = (record.status === 'scheduled' || record.status === 'upcoming') && when > Date.now();
  return (
    unreadStatuses.includes(record.status as LocalNotificationStatus) &&
    !record.opened_at &&
    !record.read_at &&
    !record.metadata?.local_activity &&
    !isFutureScheduled
  );
}

export async function getUnreadActionableNotificationCount(ownerArg?: CacheOwner | null): Promise<number> {
  const records = await readLocalNotificationInbox(ownerArg);
  return records.filter(isUnreadActionableNotificationRecord).length;
}

export async function writeLocalNotificationInbox(ownerArg: CacheOwner | null | undefined, records: LocalNotificationRecord[]) {
  try {
    const owner = await resolveNotificationOwner(ownerArg);
    if (!owner) return;
    const byIdentity = new Map<string, LocalNotificationRecord>();
    records.forEach((record) => {
      if (!record?.id) return;
      const key = localInboxIdentity(record) || String(record.id);
      byIdentity.set(key, mergeLocalNotificationRecord(byIdentity.get(key), record));
    });
    const now = new Date();
    const todayKey = getLocalDateKey(now);
    const recentCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const alertStatuses = new Set(['missed', 'skipped', 'failed', 'needs_attention']);
    const sortedRecords = Array.from(byIdentity.values())
      .sort((a, b) => {
        const aTime = new Date(a.scheduled_at || a.scheduled_time || a.created_at || 0).getTime();
        const bTime = new Date(b.scheduled_at || b.scheduled_time || b.created_at || 0).getTime();
        return bTime - aTime;
      });
    const keptReadNonCritical: LocalNotificationRecord[] = [];
    const next = sortedRecords
      .filter((record) => {
        const when = new Date(record.scheduled_at || record.scheduled_time || record.created_at || 0).getTime();
        const isUnreadRecord = !record.read_at && !record.opened_at && ['delivered', 'missed', 'skipped', 'failed', 'needs_attention', 'snoozed'].includes(record.status);
        const isAlertRecord = alertStatuses.has(record.status);
        const isTodayScheduledRecord = (record.status === 'scheduled' || record.status === 'upcoming') && getLocalDateKey(record.scheduled_at || record.scheduled_time || record.created_at || '') === todayKey;
        const isRecentDeliveredOrRead = Number.isFinite(when) && when >= recentCutoff && record.status !== 'cleared';
        if (isUnreadRecord || isAlertRecord || isTodayScheduledRecord || isRecentDeliveredOrRead) return true;
        if (record.status === 'cleared') return false;
        if (record.read_at || record.opened_at) {
          if (keptReadNonCritical.length >= 100) return false;
          keptReadNonCritical.push(record);
          return true;
        }
        return false;
      })
      .sort((a, b) => {
        const aTime = new Date(a.scheduled_at || a.scheduled_time || a.created_at || 0).getTime();
        const bTime = new Date(b.scheduled_at || b.scheduled_time || b.created_at || 0).getTime();
        return bTime - aTime;
      });
    await AsyncStorage.setItem(getNotificationInboxKey(owner), JSON.stringify(next));
  } catch {}
}

export async function upsertLocalNotificationRecord(ownerArg: CacheOwner | null | undefined, record: Partial<LocalNotificationRecord> & { id?: string; metadata?: Record<string, any> | null }) {
  const owner = await resolveNotificationOwner(ownerArg);
  if (!owner) return;
  const id = String(record.id || localInboxIdentity(record as LocalNotificationRecord));
  if (!id) return;
  const current = await readLocalNotificationInbox(owner);
  const incoming: LocalNotificationRecord = {
    id,
    type: record.type || 'general',
    title: record.title || 'Notification',
    message: record.message || '',
    status: record.status || 'scheduled',
    scheduled_at: record.scheduled_at || record.scheduled_time || null,
    scheduled_time: record.scheduled_time || record.scheduled_at || null,
    created_at: record.created_at || new Date().toISOString(),
    delivered_at: record.delivered_at || null,
    opened_at: record.opened_at || null,
    read_at: record.read_at || null,
    metadata: record.metadata || null,
  };
  await writeLocalNotificationInbox(owner, [...current, incoming]);
  DeviceEventEmitter.emit(NOTIFICATIONS_UPDATED_EVENT, { at: Date.now(), source: 'local-inbox' });
}

function matchesLocalNotificationRecord(record: LocalNotificationRecord, recordIdOrScheduleKey: string) {
  const metadata = record.metadata || {};
  const values = [
    record.id,
    metadata.scheduleKey,
    metadata.schedule_key,
    metadata.doseKey,
    metadata.dose_key,
    metadata.notificationId,
    metadata.notification_id,
  ].filter(Boolean).map(String);
  return values.includes(String(recordIdOrScheduleKey));
}

export async function markLocalNotificationRead(ownerArg: CacheOwner | null | undefined, recordIdOrScheduleKey: string) {
  const owner = await resolveNotificationOwner(ownerArg);
  if (!owner || !recordIdOrScheduleKey) return;
  const now = new Date().toISOString();
  const current = await readLocalNotificationInbox(owner);
  await writeLocalNotificationInbox(owner, current.map((record) => (
    matchesLocalNotificationRecord(record, recordIdOrScheduleKey)
      ? { ...record, opened_at: record.opened_at || now, read_at: record.read_at || now }
      : record
  )));
  DeviceEventEmitter.emit(NOTIFICATIONS_UPDATED_EVENT, { at: Date.now(), source: 'local-inbox' });
}

export async function markLocalNotificationCleared(ownerArg: CacheOwner | null | undefined, recordIdOrScheduleKey: string) {
  const owner = await resolveNotificationOwner(ownerArg);
  if (!owner || !recordIdOrScheduleKey) return;
  const now = new Date().toISOString();
  const current = await readLocalNotificationInbox(owner);
  await writeLocalNotificationInbox(owner, current.map((record) => (
    matchesLocalNotificationRecord(record, recordIdOrScheduleKey)
      ? { ...record, status: 'cleared', opened_at: record.opened_at || now, read_at: record.read_at || now, metadata: { ...(record.metadata || {}), recent_hidden: true } }
      : record
  )));
  DeviceEventEmitter.emit(NOTIFICATIONS_UPDATED_EVENT, { at: Date.now(), source: 'local-inbox' });
}

function localHourKey(value?: string | null) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  return `${year}-${month}-${day}:${hour}`;
}

export async function upsertMedicationTakenNotification(ownerArg: CacheOwner | null | undefined, input: {
  medicationId: string | number;
  medicationName?: string | null;
  doseTime: string;
  takenAt?: string;
  dosage?: string | null;
  scheduleKey?: string | null;
  doseKey?: string | null;
}) {
  const owner = await resolveNotificationOwner(ownerArg);
  if (!owner) return;
  const takenAt = input.takenAt || new Date().toISOString();
  const id = `medication-history:${input.medicationId}:${input.doseTime}:completed`;
  await upsertLocalNotificationRecord(owner, {
    id,
    type: 'medication',
    title: `${input.medicationName || 'Medication'} taken`,
    message: `Scheduled for ${new Date(input.doseTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}`,
    status: 'completed',
    scheduled_at: input.doseTime,
    scheduled_time: input.doseTime,
    created_at: takenAt,
    delivered_at: takenAt,
    opened_at: takenAt,
    read_at: takenAt,
    metadata: {
      local_activity: true,
      source: 'medication_history',
      medicationId: String(input.medicationId),
      medication_id: String(input.medicationId),
      medicationName: input.medicationName || null,
      dosage: input.dosage || null,
      doseTime: input.doseTime,
      dose_time: input.doseTime,
      scheduleKey: input.scheduleKey || null,
      schedule_key: input.scheduleKey || null,
      doseKey: input.doseKey || input.scheduleKey || null,
      dose_key: input.doseKey || input.scheduleKey || null,
    },
  });
}

export async function upsertHydrationLogNotification(ownerArg: CacheOwner | null | undefined, entry: any) {
  const owner = await resolveNotificationOwner(ownerArg);
  if (!owner) return;
  const loggedAt = entry?.timestamp || entry?.created_at || new Date().toISOString();
  const slotKey = `hydration:${getOwnerSchedulePart(owner)}:${localHourKey(loggedAt)}`;
  const amount = Number(entry?.amount_ml || entry?.logged_ml || 0);
  const label = entry?.drink_label || (String(entry?.beverage_type || 'water').replace(/_/g, ' '));
  const title = `${String(label || 'Water').charAt(0).toUpperCase()}${String(label || 'Water').slice(1)} logged`;
  await upsertLocalNotificationRecord(owner, {
    id: `hydration-log:${entry?.local_id || entry?.id || loggedAt}`,
    type: 'hydration',
    title,
    message: `${amount} ml beverage log`,
    status: 'completed',
    scheduled_at: loggedAt,
    scheduled_time: loggedAt,
    created_at: loggedAt,
    delivered_at: loggedAt,
    opened_at: loggedAt,
    read_at: loggedAt,
    metadata: {
      local_activity: true,
      source: 'hydration_log',
      local_id: entry?.local_id || entry?.id || null,
      client_uuid: entry?.client_uuid || entry?.local_id || null,
      hydrationSlotKey: slotKey,
      hydration_slot_key: slotKey,
      respondedScheduleKey: slotKey,
      responded_schedule_key: slotKey,
      amount,
    },
  });
}

export async function markHydrationGoalCompleted(ownerArg?: CacheOwner | null) {
  const owner = await resolveNotificationOwner(ownerArg);
  if (!owner) return;
  await cancelHydrationNotifications(owner);
  const today = getLocalDateKey(new Date());
  const now = new Date().toISOString();
  const inbox = await readLocalNotificationInbox(owner);
  await writeLocalNotificationInbox(owner, inbox.map((record) => {
    const when = record.scheduled_at || record.scheduled_time || record.created_at || '';
    if (record.type !== 'hydration' || getLocalDateKey(when) !== today || getSafeRecordTime(when) <= Date.now()) return record;
    return {
      ...record,
      status: 'cleared' as const,
      opened_at: record.opened_at || now,
      read_at: record.read_at || now,
      metadata: { ...(record.metadata || {}), goal_completed: true, recent_hidden: true },
    };
  }));
  DeviceEventEmitter.emit(NOTIFICATIONS_UPDATED_EVENT, { at: Date.now(), source: 'hydration-goal' });
}

function getSafeRecordTime(value?: string | null) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

export async function recordNotificationResponse(response: ExpoNotifications.NotificationResponse): Promise<NotificationData | null> {
  try {
    const notification = response.notification;
    const data = (notification.request.content.data || {}) as NotificationData;
    const owner = await resolveOwnerFromNotificationData(data);
    const key = data.scheduleKey || data.doseKey || notification.request.identifier;
    if (owner) {
      await upsertLocalNotificationRecord(owner, notificationRecordFromDeliveredNotification(notification, 'delivered'));
      await markLocalNotificationRead(owner, String(key));
      await reconcileNotificationInbox(owner);
    }
    DeviceEventEmitter.emit(NOTIFICATIONS_UPDATED_EVENT, { at: Date.now(), source: 'tap' });
    return data;
  } catch {
    return null;
  }
}

export async function getLastNotificationResponse(): Promise<ExpoNotifications.NotificationResponse | null> {
  const Notifications = getNotifications();
  if (!Notifications?.getLastNotificationResponseAsync) return null;
  try {
    return await Notifications.getLastNotificationResponseAsync();
  } catch {
    return null;
  }
}

async function resolveOwnerFromNotificationData(data: any): Promise<CacheOwner | null> {
  const explicit = getCacheOwner({
    id: data?.owner_id ?? data?.ownerId ?? data?.user_id ?? data?.userId,
    email: data?.owner_email ?? data?.ownerEmail ?? data?.user_email ?? data?.userEmail,
  });
  if (explicit.owner_id || explicit.owner_email) return explicit;
  return resolveNotificationOwner();
}

function notificationRecordFromDeliveredNotification(notification: ExpoNotifications.Notification, status: LocalNotificationStatus): LocalNotificationRecord {
  const data = (notification.request.content.data || {}) as NotificationData;
  const scheduleKey = data.scheduleKey || data.doseKey || String(data.id || notification.request.identifier);
  const now = new Date().toISOString();
  return {
    id: scheduleKey,
    type: data.type === 'hydration' || data.type === 'medication' ? data.type : 'general',
    title: notification.request.content.title || (data.type === 'hydration' ? 'Time to hydrate' : 'Notification'),
    message: notification.request.content.body || '',
    status,
    scheduled_at: data.scheduledAt || now,
    scheduled_time: data.scheduledAt || now,
    created_at: now,
    delivered_at: status === 'delivered' ? now : null,
    opened_at: null,
    read_at: null,
    metadata: {
      ...data,
      notificationId: notification.request.identifier,
      notification_id: notification.request.identifier,
      scheduleKey,
      schedule_key: scheduleKey,
      doseKey: data.doseKey || scheduleKey,
      dose_key: data.doseKey || scheduleKey,
    },
  };
}

function isHydrationResponded(scheduledAt: string, nextScheduledAt: string | null, entries: any[]) {
  const scheduledTime = new Date(scheduledAt).getTime();
  if (!Number.isFinite(scheduledTime)) return true;
  const nextTime = nextScheduledAt ? new Date(nextScheduledAt).getTime() : Number.POSITIVE_INFINITY;
  const windowEnd = Math.min(scheduledTime + HYDRATION_RESPONSE_WINDOW_MS, Number.isFinite(nextTime) && nextTime > scheduledTime ? nextTime : Number.POSITIVE_INFINITY);
  return (entries || []).some((entry) => {
    if (entry?.deleted_at || Number(entry?.amount_ml || entry?.logged_ml || 0) <= 0) return false;
    const time = new Date(entry?.timestamp || entry?.created_at || entry?.date || entry?.time || 0).getTime();
    return Number.isFinite(time) && time >= scheduledTime && time <= windowEnd;
  });
}

function sameDoseTime(left?: string | null, right?: string | null) {
  const leftTime = left ? new Date(left).getTime() : 0;
  const rightTime = right ? new Date(right).getTime() : 0;
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && Math.abs(leftTime - rightTime) < 60 * 1000;
}

function medicationDoseHasOutcome(ref: ScheduledNotificationRef, history: any[]) {
  return (history || []).some((entry) => {
    const status = entry?.status;
    if (status !== 'completed' && status !== 'skipped' && status !== 'missed' && status !== 'snoozed') return false;
    const medId = String(entry?.medId ?? entry?.medication_id ?? entry?.medicationId ?? '');
    if (ref.medicationId && medId && medId !== String(ref.medicationId)) return false;
    return sameDoseTime(entry?.time || entry?.scheduled_at || entry?.scheduled_time, ref.doseTime);
  });
}

export async function reconcileNotificationInbox(ownerArg?: CacheOwner | null): Promise<LocalNotificationRecord[]> {
  const owner = await resolveNotificationOwner(ownerArg);
  if (!owner) return [];
  const [inbox, refs, hydrationCache, medicationHistory] = await Promise.all([
    readLocalNotificationInbox(owner),
    getScheduledNotificationRefs(owner),
    readHydrationCache<any>(),
    getCachedSession().then((session) => readMedicationHistoryCache<any[]>(session?.user ?? null)),
  ]);
  const now = Date.now();
  const next = [...inbox];
  const hydrationRefs = refs
    .filter((ref) => ref.type === 'hydration')
    .sort((a, b) => getRefScheduledTime(a) - getRefScheduledTime(b));

  refs.forEach((ref) => {
    const scheduledTime = getRefScheduledTime(ref);
    const existing = next.find((record) => matchesLocalNotificationRecord(record, refSlot(ref)) || matchesLocalNotificationRecord(record, ref.notificationId));
    const baseStatus: LocalNotificationStatus = scheduledTime > now ? 'scheduled' : 'delivered';
    const record = localInboxRecordFromRef(ref, baseStatus);
    if (scheduledTime <= now) record.delivered_at = existing?.delivered_at || new Date().toISOString();
    next.push(record);
  });

  refs.forEach((ref) => {
    const scheduledTime = getRefScheduledTime(ref);
    const scheduleKey = refSlot(ref);
    if (!scheduleKey || scheduledTime <= 0) return;

    if (ref.type === 'hydration' && scheduledTime + HYDRATION_RESPONSE_WINDOW_MS < now) {
      const index = hydrationRefs.findIndex((item) => refSlot(item) === scheduleKey);
      const nextHydrationRef = index >= 0 ? hydrationRefs[index + 1] : null;
      const responded = isHydrationResponded(ref.scheduledAt, nextHydrationRef?.scheduledAt || null, hydrationCache?.entries || []);
      if (!responded) {
        next.push({
          ...localInboxRecordFromRef(ref, 'missed'),
          title: 'Hydration reminder missed',
          message: 'No beverage log was recorded after this reminder.',
          delivered_at: new Date().toISOString(),
          metadata: { ...localInboxRecordFromRef(ref, 'missed').metadata, source: 'missed_hydration_reminder' },
        });
      }
    }

    if (ref.type === 'medication' && ref.doseTime && new Date(ref.doseTime).getTime() + MEDICATION_MISSED_GRACE_MS < now) {
      if (!medicationDoseHasOutcome(ref, medicationHistory || [])) {
        next.push({
          ...localInboxRecordFromRef(ref, 'missed'),
          title: `${ref.medicationName || 'Medication'} missed`,
          message: ref.doseTime ? `Dose at ${new Date(ref.doseTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}` : 'Dose was not recorded.',
          delivered_at: new Date().toISOString(),
          metadata: { ...localInboxRecordFromRef(ref, 'missed').metadata, source: 'missed_medication_reminder' },
        });
      }
    }
  });

  await writeLocalNotificationInbox(owner, next);
  return readLocalNotificationInbox(owner);
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

export async function getHydrationReminderHistory(owner?: CacheOwner | null): Promise<HydrationReminderHistoryEvent[]> {
  try {
    const cacheOwner = await resolveNotificationOwner(owner);
    if (!cacheOwner) return [];
    const raw = await AsyncStorage.getItem(hydrationReminderHistoryKey(cacheOwner));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => item?.type === 'hydration') : [];
  } catch {
    return [];
  }
}

async function writeHydrationReminderHistory(events: HydrationReminderHistoryEvent[], owner?: CacheOwner | null) {
  try {
    const cacheOwner = await resolveNotificationOwner(owner);
    if (!cacheOwner) return;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const recentEvents = events.filter((event) => {
      const scheduledAt = event?.scheduledAt ? new Date(event.scheduledAt).getTime() : 0;
      return scheduledAt >= cutoff.getTime();
    });
    await AsyncStorage.setItem(hydrationReminderHistoryKey(cacheOwner), JSON.stringify(recentEvents));
  } catch {}
}

async function saveHydrationReminderHistoryEvent(ref: ScheduledNotificationRef) {
  const owner = await resolveNotificationOwner(ref);
  if (!owner || ref.type !== 'hydration') return;
  const scheduleKey = refSlot(ref);
  const events = await getHydrationReminderHistory(owner);
  const next = events.filter((item) => item.scheduleKey !== scheduleKey);
  next.push({
    owner_id: owner.owner_id,
    owner_email: owner.owner_email,
    notificationId: ref.notificationId,
    type: 'hydration',
    scheduleKey,
    doseKey: scheduleKey,
    amount: ref.amount,
    suggestedAmount: ref.suggestedAmount,
    scheduledAt: ref.scheduledAt,
    createdAt: ref.createdAt || new Date().toISOString(),
    canceledAt: null,
  });
  await writeHydrationReminderHistory(next, owner);
}

async function markHydrationReminderHistoryCanceled(ownerArg: CacheOwner | null | undefined, scheduleKeys: Set<string>) {
  if (scheduleKeys.size === 0) return;
  const owner = await resolveNotificationOwner(ownerArg);
  if (!owner) return;
  const now = new Date().toISOString();
  const events = await getHydrationReminderHistory(owner);
  let changed = false;
  const next = events.map((event) => {
    if (!scheduleKeys.has(event.scheduleKey)) return event;
    const scheduledTime = new Date(event.scheduledAt).getTime();
    if (Number.isFinite(scheduledTime) && scheduledTime <= Date.now()) return event;
    changed = true;
    return { ...event, canceledAt: event.canceledAt || now };
  });
  if (changed) await writeHydrationReminderHistory(next, owner);
}

export async function saveScheduledNotificationRef(ref: ScheduledNotificationRef) {
  const owner = await resolveNotificationOwner(ref);
  if (!owner) return;
  const refs = await getScheduledNotificationRefs(owner);
  const replaced = refs.filter((item) => item.type === ref.type && refSlot(item) === refSlot(ref));
  const next = refs.filter((item) => !(item.type === ref.type && refSlot(item) === refSlot(ref)));
  const Notifications = getNotifications();
  if (Notifications) {
    await Promise.all(
      replaced
        .filter((item) => item.notificationId !== ref.notificationId)
        .map((item) => Notifications.cancelScheduledNotificationAsync(item.notificationId).catch(() => undefined))
    );
  }
  next.push(ref);
  await writeScheduledNotificationRefs(next, owner);
  await upsertLocalNotificationRecord(owner, localInboxRecordFromRef(ref, 'scheduled'));
  if (ref.type === 'hydration') await saveHydrationReminderHistoryEvent(ref);
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

export async function cancelMedicationNotifications(medicationId: string, ownerArg?: CacheOwner | null) {
  await notificationService.cancelMedicationNotifications(medicationId, ownerArg);
}

export async function cancelAllMedicationNotifications(ownerArg?: CacheOwner | null) {
  const owner = await resolveNotificationOwner(ownerArg);
  if (!owner) return;
  const refs = await getScheduledNotificationRefs(owner);
  const medicationRefs = refs.filter((ref) => ref.type === 'medication');
  const Notifications = getNotifications();
  if (Notifications) {
    await Promise.all(medicationRefs.map((ref) => Notifications.cancelScheduledNotificationAsync(ref.notificationId).catch(() => undefined)));
  }
  await writeScheduledNotificationRefs(refs.filter((ref) => ref.type !== 'medication'), owner);
  DeviceEventEmitter.emit(REMINDERS_RESCHEDULED_EVENT, { type: 'medication', at: Date.now() });
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
  const hydrationRefs = refs.filter((ref) => ref.type === 'hydration');
  const Notifications = getNotifications();
  if (Notifications) {
    await Promise.all(hydrationRefs.map((ref) => Notifications.cancelScheduledNotificationAsync(ref.notificationId).catch(() => undefined)));
  }
  await markHydrationReminderHistoryCanceled(owner, new Set(hydrationRefs.map((ref) => refSlot(ref))));
  await writeScheduledNotificationRefs(refs.filter((ref) => ref.type !== 'hydration'), owner);
  DeviceEventEmitter.emit(REMINDERS_RESCHEDULED_EVENT, { type: 'hydration', at: Date.now() });
}

export async function cancelHydrationSlotNotifications(ownerArg: CacheOwner | null | undefined, slotTimeIso: string) {
  const owner = await resolveNotificationOwner(ownerArg);
  if (!owner) return;
  const slotHour = localHourKey(slotTimeIso);
  if (!slotHour) return;
  const refs = await getScheduledNotificationRefs(owner);
  const matching = refs.filter((ref) => (
    ref.type === 'hydration' &&
    localHourKey(ref.scheduledAt) === slotHour &&
    getRefScheduledTime(ref) > Date.now()
  ));
  const Notifications = getNotifications();
  if (Notifications) {
    await Promise.all(matching.map((ref) => Notifications.cancelScheduledNotificationAsync(ref.notificationId).catch(() => undefined)));
  }
  if (matching.length > 0) {
    await writeScheduledNotificationRefs(refs.filter((ref) => !matching.some((item) => item.notificationId === ref.notificationId)), owner);
    await markHydrationReminderHistoryCanceled(owner, new Set(matching.map((ref) => refSlot(ref))));
    DeviceEventEmitter.emit(REMINDERS_RESCHEDULED_EVENT, { type: 'hydration', at: Date.now() });
  }
}

export async function validateScheduledNotificationRefs(ownerArg?: CacheOwner | null, options?: { force?: boolean }) {
  const owner = await resolveNotificationOwner(ownerArg);
  if (!owner) return;
  const ownerKey = getOwnerSchedulePart(owner);
  const lastValidated = lastScheduledRefValidationByOwner.get(ownerKey) || 0;
  if (!options?.force && Date.now() - lastValidated < VALIDATE_SCHEDULED_REFS_INTERVAL_MS) return;
  lastScheduledRefValidationByOwner.set(ownerKey, Date.now());
  const Notifications = getNotifications();
  if (!Notifications) return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const refs = await getScheduledNotificationRefs(owner);
  const medicationScheduledCount = scheduled.filter((item) => getScheduledRequestData(item).type === 'medication').length;
  const hydrationScheduledCount = scheduled.filter((item) => getScheduledRequestData(item).type === 'hydration').length;
  const nextScheduledTime = scheduled
    .map(getRequestScheduledTime)
    .filter((time) => time > Date.now())
    .sort((a, b) => a - b)[0];
  console.log('Notification schedule validation', {
    total: scheduled.length,
    medication: medicationScheduledCount,
    hydration: hydrationScheduledCount,
    refs: refs.length,
    next: nextScheduledTime ? new Date(nextScheduledTime).toISOString() : null,
  });
  const scheduledById = new Map(scheduled.map((item) => [item.identifier, item]));
  const refByNotificationId = new Map(refs.map((ref) => [ref.notificationId, ref]));
  const groups = new Map<string, { request?: NotificationRequestLike; ref?: ScheduledNotificationRef }[]>();

  const addGroup = (key: string, item: { request?: NotificationRequestLike; ref?: ScheduledNotificationRef }) => {
    if (!key) return;
    const current = groups.get(key) || [];
    current.push(item);
    groups.set(key, current);
  };

  refs.forEach((ref) => {
    if (!scheduledById.has(ref.notificationId)) return;
    addGroup(`${ref.type}:${refSlot(ref)}`, { ref, request: scheduledById.get(ref.notificationId) });
  });

  scheduled.forEach((request) => {
    const data = getScheduledRequestData(request);
    if (data.type !== 'medication' && data.type !== 'hydration') return;
    const existingRef = refByNotificationId.get(request.identifier);
    if (existingRef) return;
    const scheduleKey = getScheduledRequestKey(request);
    if (scheduleKey) {
      addGroup(`${data.type}:${scheduleKey}`, { request, ref: buildRefFromScheduledRequest(request, owner) || undefined });
      return;
    }
    const legacyKey = getLegacyScheduledRequestKey(request);
    if (legacyKey) addGroup(legacyKey, { request });
  });

  const cleanedRefs: ScheduledNotificationRef[] = [];
  const idsToCancel = new Set<string>();

  groups.forEach((items) => {
    const keep = items.find((item) => item.ref && item.request) || items.find((item) => item.request) || items[0];
    const keepId = keep.request?.identifier || keep.ref?.notificationId;
    items.forEach((item) => {
      const id = item.request?.identifier || item.ref?.notificationId;
      if (id && keepId && id !== keepId) idsToCancel.add(id);
    });
    const keepRef = keep.ref || (keep.request ? buildRefFromScheduledRequest(keep.request, owner) : null);
    if (keepRef && keepId) cleanedRefs.push({ ...keepRef, notificationId: keepId });
  });

  const semanticGroups = new Map<string, NotificationRequestLike[]>();
  scheduled.forEach((request) => {
    const key = getSemanticScheduledRequestKey(request);
    if (!key) return;
    const items = semanticGroups.get(key) || [];
    items.push(request);
    semanticGroups.set(key, items);
  });
  semanticGroups.forEach((items) => {
    const activeItems = items.filter((item) => !idsToCancel.has(item.identifier));
    if (activeItems.length <= 1) return;
    const keep = activeItems.find((item) => cleanedRefs.some((ref) => ref.notificationId === item.identifier)) || activeItems[0];
    activeItems.forEach((item) => {
      if (item.identifier !== keep.identifier) idsToCancel.add(item.identifier);
    });
  });

  await Promise.all(Array.from(idsToCancel).map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
  if (idsToCancel.size > 0 || cleanedRefs.length !== refs.length) {
    console.log('Notification schedule reconciliation', {
      staleOrDuplicateCount: idsToCancel.size,
      previousRefs: refs.length,
      nextRefs: cleanedRefs.filter((ref) => !idsToCancel.has(ref.notificationId)).length,
    });
  }
  await writeScheduledNotificationRefs(cleanedRefs.filter((ref) => !idsToCancel.has(ref.notificationId)), owner);
}

async function ensureUniqueScheduledSlot(owner: CacheOwner, type: ScheduledNotificationRef['type'], scheduleKey: string) {
  const Notifications = getNotifications();
  if (!Notifications) return false;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const refs = await getScheduledNotificationRefs(owner);
  const matchingRefs = refs.filter((ref) => ref.type === type && refSlot(ref) === scheduleKey);
  const matchingScheduled = scheduled.filter((request) => {
    const data = getScheduledRequestData(request);
    return data.type === type && getScheduledRequestKey(request) === scheduleKey;
  });
  const validIds = new Set(scheduled.map((item) => item.identifier));
  const validRef = matchingRefs.find((ref) => validIds.has(ref.notificationId));
  const keepRequest = validRef
    ? matchingScheduled.find((request) => request.identifier === validRef.notificationId)
    : matchingScheduled[0];
  const keepId = keepRequest?.identifier || validRef?.notificationId;

  const duplicateIds = new Set<string>();
  matchingRefs.forEach((ref) => {
    if (ref.notificationId !== keepId) duplicateIds.add(ref.notificationId);
  });
  matchingScheduled.forEach((request) => {
    if (request.identifier !== keepId) duplicateIds.add(request.identifier);
  });
  await Promise.all(Array.from(duplicateIds).map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));

  if (keepId) {
    const keepRef = validRef || (keepRequest ? buildRefFromScheduledRequest(keepRequest, owner) : null);
    const nextRefs = refs.filter((ref) => !(ref.type === type && refSlot(ref) === scheduleKey));
    if (keepRef) {
      const normalizedRef = { ...keepRef, notificationId: keepId, scheduleKey, doseKey: scheduleKey };
      nextRefs.push(normalizedRef);
      if (type === 'hydration') await saveHydrationReminderHistoryEvent(normalizedRef);
    }
    await writeScheduledNotificationRefs(nextRefs, owner);
    return true;
  }

  if (matchingRefs.length > 0) {
    await writeScheduledNotificationRefs(refs.filter((ref) => !(ref.type === type && refSlot(ref) === scheduleKey)), owner);
  }
  return false;
}

export async function clearStaleNotificationRefs(ownerArg?: CacheOwner | null) {
  await validateScheduledNotificationRefs(ownerArg);
}

export async function clearStaleHydrationNotificationRefs(ownerArg?: CacheOwner | null) {
  await validateScheduledNotificationRefs(ownerArg);
}

export async function cleanupDuplicateHydrationNotifications(ownerArg?: CacheOwner | null) {
  await validateScheduledNotificationRefs(ownerArg);
}

export async function cleanupDuplicateMedicationNotifications(ownerArg?: CacheOwner | null) {
  await validateScheduledNotificationRefs(ownerArg);
}

export async function debugListScheduledNotifications(ownerArg?: CacheOwner | null) {
  if (!__DEV__) return [];
  const owner = await resolveNotificationOwner(ownerArg);
  const Notifications = getNotifications();
  if (!owner || !Notifications) return [];
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled
    .map((request) => {
      const data = getScheduledRequestData(request);
      if (data.type !== 'medication' && data.type !== 'hydration') return null;
      return {
        notificationId: request.identifier,
        type: data.type,
        scheduleKey: data.scheduleKey || data.doseKey || null,
        medicationId: data.medicationId || null,
        hydrationSlot: data.type === 'hydration' ? data.scheduledAt || null : null,
        medicationName: data.type === 'medication' ? request.content?.title || null : null,
        offsetMinutes: data.reminderOffsetMinutes ?? null,
        trigger: request.trigger,
        title: request.content?.title,
        body: request.content?.body,
        data,
      };
    })
    .filter(Boolean);
}

export async function isHydrationReminderAlreadyScheduled(ownerArg: CacheOwner | null | undefined, scheduleKey: string) {
  const owner = await resolveNotificationOwner(ownerArg);
  if (!owner) return false;
  const refs = await getScheduledNotificationRefs(owner);
  return refs.some((ref) => ref.type === 'hydration' && refSlot(ref) === scheduleKey);
}

function hydrationRefDate(ref: ScheduledNotificationRef) {
  const slot = refSlot(ref);
  const match = typeof slot === 'string' ? slot.match(/^hydration:(?:[^:]+:)?(\d{4}-\d{2}-\d{2}):/) : null;
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

export async function rescheduleMedicationNotifications(medications: (Partial<CachedMedicationForNotifications> & { id: string; name: string; dosage?: string; times?: string[]; reminder?: boolean; client_uuid?: string | number | null })[]) {
  const owner = await resolveNotificationOwner();
  if (!owner) return;
  await validateScheduledNotificationRefs(owner);
  for (const med of medications) {
    const medicationId = stableMedicationNotificationId(med);
    if (!medicationId) continue;
    if (med.reminder === false) {
      await notificationService.cancelMedicationNotifications(medicationId, owner);
    } else {
      await notificationService.scheduleMedicationNotifications(
        medicationId,
        med.name,
        med.dosage || '',
        med.times || [],
        undefined,
        {
          owner,
          startDate: med.start_date || null,
          endDate: med.end_date || null,
          frequency: med.frequency,
          daysOfWeek: med.days_of_week || [],
          scheduleCreatedAt: med.schedule_created_at || med.client_created_at || med.local_created_at || med.created_at || null,
        }
      );
    }
  }
  await validateScheduledNotificationRefs(owner);
}

export async function rescheduleHydrationNotifications(goalOrOptions: number | HydrationScheduleOptions = 2000, intervalMinutes = HYDRATION_REMINDER_INTERVAL_MINUTES, ownerArg?: CacheOwner | null) {
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
    await validateScheduledNotificationRefs(owner);
    await removePreviousDayHydrationRefs(owner);
    await notificationSettings.initialize();
    const settings = notificationSettings.getSettings();
    if (!settings.masterToggle || !settings.categories.hydration || currentTotal >= goal) {
      await cancelHydrationNotifications(owner);
      return;
    }
    const hasPermission = await notificationService.requestPermissions();
    if (!hasPermission) return;
    const slots = getUpcomingHydrationSlots(intervalMinutes);
    if (slots.length === 0) return;
    const desiredKeys = new Set(slots.map((slot) => getHydrationScheduleKey(owner, slot)));
    await cancelObsoleteHydrationNotifications(owner, desiredKeys);
    const remaining = Math.max(goal - currentTotal, 0);
    const amount = Math.max(150, Math.round(remaining / slots.length));
    const progressPercent = goal > 0 ? (currentTotal / goal) * 100 : undefined;
    for (const slot of slots) {
      await notificationService.scheduleHydrationReminder(intervalMinutes, amount, undefined, owner, slot, progressPercent);
    }
    await validateScheduledNotificationRefs(owner, { force: true });
    DeviceEventEmitter.emit(REMINDERS_RESCHEDULED_EVENT, { type: 'hydration', at: Date.now() });
  } finally {
    schedulingHydration = false;
  }
}

export async function bootstrapNotificationSchedules(ownerArg?: CacheOwner | null) {
  try {
    await notificationService.ensureAndroidChannels();
    await notificationSettings.initialize();
    const permission = await notificationService.getPermissionStatus();
    if (!permission.granted) return;

    const session = await getCachedSession();
    const owner = await resolveNotificationOwner(ownerArg || getCacheOwner(session?.user ?? null));
    if (!owner) return;
    await validateScheduledNotificationRefs(owner);

    const hydrationCache = await readHydrationCache<any>();
    if (hydrationCache) {
      const goal = getHydrationGoalFromCache(hydrationCache);
      await rescheduleHydrationNotifications({
        currentTotal: getTodayHydrationTotalFromCache(hydrationCache),
        goal,
        owner,
      });
    }

    const medications = session?.user ? await readMedicationCache<CachedMedicationForNotifications[]>(session.user) : null;
    const deletedMedicationKeys = new Set(session?.user ? await readDeletedMedicationTombstones(session.user) : []);
    const activeMedications = (medications || []).filter((med) => (
      !cachedMedicationIdentityValues(med).some((identity) => deletedMedicationKeys.has(identity))
    ));
    const normalizedMedications = activeMedications.map((med) => {
      const existingStableId = normalizeMedicationIdentity(med.local_id ?? med.client_uuid);
      if (existingStableId) return { ...med, local_id: med.local_id || existingStableId, client_uuid: med.client_uuid || existingStableId };
      const serverId = normalizeMedicationIdentity(med.server_id ?? med.id);
      return serverId ? { ...med, local_id: `server_${serverId}`, client_uuid: `server_${serverId}` } : med;
    });
    if (session?.user && medications && JSON.stringify(medications) !== JSON.stringify(normalizedMedications)) {
      await writeMedicationCache(session.user, normalizedMedications);
    }
    for (const med of normalizedMedications) {
      const medicationId = stableMedicationNotificationId(med);
      if (!medicationId || !med.name || med.deleted_at) continue;
      if (med.reminder === false) {
        await notificationService.cancelMedicationNotifications(medicationId, owner);
        continue;
      }
      await notificationService.scheduleMedicationNotifications(
        medicationId,
        med.name,
        med.dosage || '',
        med.times || [],
        undefined,
        {
          owner,
          startDate: med.start_date || null,
          endDate: med.end_date || null,
          frequency: med.frequency,
          daysOfWeek: med.days_of_week || [],
          scheduleCreatedAt: med.schedule_created_at || med.client_created_at || med.local_created_at || med.created_at || null,
        }
      );
    }
    await validateScheduledNotificationRefs(owner, { force: true });
    await reconcileNotificationInbox(owner);
  } catch (error) {
    console.log('Notification bootstrap error:', error);
  }
}

function getLocalDateKey(date: Date | string) {
  const value = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return '';
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getHydrationGoalFromCache(cache: any) {
  const goal = Number(cache?.goal ?? cache?.daily_goal_ml ?? cache?.hydration_goal ?? cache?.target_ml ?? 2000);
  return Number.isFinite(goal) && goal > 0 ? goal : 2000;
}

function getTodayHydrationTotalFromCache(cache: any) {
  const entries = Array.isArray(cache?.entries) ? cache.entries : [];
  const today = getLocalDateKey(new Date());
  if (entries.length > 0) {
    return entries.reduce((sum: number, entry: any) => {
      const timestamp = entry?.timestamp || entry?.date || entry?.created_at;
      if (!timestamp || getLocalDateKey(timestamp) !== today) return sum;
      return sum + Number(entry?.amount_ml || entry?.logged_ml || 0);
    }, 0);
  }
  const cachedTotal = Number(cache?.today_total ?? cache?.total_today ?? cache?.current_total ?? 0);
  return Number.isFinite(cachedTotal) ? cachedTotal : 0;
}

