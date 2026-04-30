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

export const HYDRATION_CHANNEL_ID = 'intakesync_hydration_v1';
export const MEDICATION_CHANNEL_ID = 'intakesync_medication_v1';
const HYDRATION_SOUND = 'hydration_reminder.wav';
const MEDICATION_SOUND = 'medication_reminder.wav';
const SCHEDULED_REFS_KEY = '@intakesync:scheduled_notification_refs';
const PERMISSION_ASKED_KEY = '@intakesync:notification_permission_asked';

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
  scheduledAt?: string;
  suggestedAmount?: number;
  amount?: number;
  [key: string]: any;
}

export interface ScheduledNotificationRef {
  medicationId?: string;
  doseKey: string;
  notificationId: string;
  type: 'medication' | 'hydration';
  scheduledAt: string;
}

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
    backendNotificationId?: string
  ): Promise<void> {
    try {
      await this.cancelMedicationNotifications(medicationId);

      for (const timeStr of times) {
        const scheduledTime = new Date(timeStr);
        const now = new Date();
        
        // If time has passed today, schedule for tomorrow
        const todayScheduled = new Date(now);
        todayScheduled.setHours(scheduledTime.getHours(), scheduledTime.getMinutes(), scheduledTime.getSeconds(), 0);
        
        let triggerDate = todayScheduled;
        if (todayScheduled <= now) {
          triggerDate = new Date(todayScheduled.getTime() + 24 * 60 * 60 * 1000); // Tomorrow
        }

        const title = dosage ? `Take ${dosage} ${medicationName} 💊` : `Take ${medicationName} 💊`;
        const body = `Time for your medication at ${triggerDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}`;

        const notificationId = await this.scheduleRecurringNotification(
          title,
          body,
          triggerDate.getHours(),
          triggerDate.getMinutes(),
          {
            type: 'medication',
            medicationId,
            doseKey: `${medicationId}:${triggerDate.getHours()}:${triggerDate.getMinutes()}`,
            scheduledAt: triggerDate.toISOString(),
            id: backendNotificationId,
          }
        );

        if (notificationId) {
          if (backendNotificationId) this.scheduledNotifications.set(backendNotificationId, notificationId);
          await saveScheduledNotificationRef({
            type: 'medication',
            medicationId,
            doseKey: `${medicationId}:${triggerDate.getHours()}:${triggerDate.getMinutes()}`,
            notificationId,
            scheduledAt: triggerDate.toISOString(),
          });
        }
      }
    } catch (error) {
      console.error('Error scheduling medication notifications:', error);
    }
  }

  /**
   * Schedule hydration reminder
   */
  async scheduleHydrationReminder(
    intervalMinutes: number = 120,
    amountMl: number = 200,
    backendNotificationId?: string
  ): Promise<void> {
    try {
      const nextReminder = new Date(Date.now() + intervalMinutes * 60 * 1000);

      const notificationId = await this.scheduleNotification(
        'Time to hydrate 💧',
        `${amountMl}ml suggested to stay hydrated`,
        nextReminder,
        {
          type: 'hydration',
          amount: amountMl,
          suggestedAmount: amountMl,
          doseKey: `hydration:${nextReminder.toISOString().slice(0, 16)}`,
          scheduledAt: nextReminder.toISOString(),
          id: backendNotificationId,
        }
      );

      if (notificationId) {
        if (backendNotificationId) this.scheduledNotifications.set(backendNotificationId, notificationId);
        await saveScheduledNotificationRef({
          type: 'hydration',
          doseKey: `hydration:${nextReminder.toISOString().slice(0, 16)}`,
          notificationId,
          scheduledAt: nextReminder.toISOString(),
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
  async cancelMedicationNotifications(medicationId: string): Promise<void> {
    try {
      const Notifications = getNotifications();
      if (!Notifications) {
        return;
      }

      const allNotifications = await Notifications.getAllScheduledNotificationsAsync();
      
      for (const notification of allNotifications) {
        const data = notification.content.data as NotificationData;
        if (data?.medicationId === medicationId) {
          await Notifications.cancelScheduledNotificationAsync(notification.identifier);
          await removeScheduledNotificationRef(notification.identifier);
        }
      }
      const refs = await getScheduledNotificationRefs();
      await writeScheduledNotificationRefs(refs.filter((ref) => ref.medicationId !== medicationId));
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

async function writeScheduledNotificationRefs(refs: ScheduledNotificationRef[]) {
  try {
    await AsyncStorage.setItem(SCHEDULED_REFS_KEY, JSON.stringify(refs));
  } catch {}
}

export async function getScheduledNotificationRefs(): Promise<ScheduledNotificationRef[]> {
  try {
    const raw = await AsyncStorage.getItem(SCHEDULED_REFS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveScheduledNotificationRef(ref: ScheduledNotificationRef) {
  const refs = await getScheduledNotificationRefs();
  const next = refs.filter((item) => !(item.type === ref.type && item.doseKey === ref.doseKey && item.medicationId === ref.medicationId));
  next.push(ref);
  await writeScheduledNotificationRefs(next);
}

async function removeScheduledNotificationRef(notificationId: string) {
  const refs = await getScheduledNotificationRefs();
  await writeScheduledNotificationRefs(refs.filter((ref) => ref.notificationId !== notificationId));
}

export async function cancelNotificationByRef(ref: ScheduledNotificationRef) {
  await notificationService.cancelNotification(ref.notificationId);
}

export async function cancelMedicationNotifications(medicationId: string) {
  await notificationService.cancelMedicationNotifications(medicationId);
}

export async function cancelHydrationNotifications() {
  const refs = await getScheduledNotificationRefs();
  await Promise.all(refs.filter((ref) => ref.type === 'hydration').map((ref) => notificationService.cancelNotification(ref.notificationId)));
  await writeScheduledNotificationRefs(refs.filter((ref) => ref.type !== 'hydration'));
}

export async function clearStaleNotificationRefs() {
  const scheduled = await notificationService.getAllScheduledNotifications();
  const scheduledIds = new Set(scheduled.map((item) => item.identifier));
  const refs = await getScheduledNotificationRefs();
  await writeScheduledNotificationRefs(refs.filter((ref) => scheduledIds.has(ref.notificationId)));
}

export async function rescheduleMedicationNotifications(medications: Array<{ id: string; name: string; dosage?: string; times?: string[]; reminder?: boolean }>) {
  await clearStaleNotificationRefs();
  await Promise.all(medications.map((med) => (
    med.reminder === false
      ? notificationService.cancelMedicationNotifications(String(med.id))
      : notificationService.scheduleMedicationNotifications(String(med.id), med.name, med.dosage || '', med.times || [])
  )));
}

export async function rescheduleHydrationNotifications(goal = 2000, intervalMinutes = 120) {
  await cancelHydrationNotifications();
  const amount = Math.max(150, Math.round(goal / 8));
  await notificationService.scheduleHydrationReminder(intervalMinutes, amount);
}

