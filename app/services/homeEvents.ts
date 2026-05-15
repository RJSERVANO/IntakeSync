import { DeviceEventEmitter } from 'react-native';

export const HOME_REFRESH_EVENT = 'home:refresh';
export const HYDRATION_UPDATED_EVENT = 'hydration:updated';
export const MEDICATION_UPDATED_EVENT = 'medication:updated';
export const MEDICATION_HISTORY_UPDATED_EVENT = 'medication-history:updated';
export const PROFILE_UPDATED_EVENT = 'profile:updated';
export const NOTIFICATIONS_UPDATED_EVENT = 'notifications:updated';
export const SYNC_COMPLETED_EVENT = 'sync:completed';
export const REMINDERS_RESCHEDULED_EVENT = 'reminders:rescheduled';

export type HomeRefreshReason =
  | 'hydration'
  | 'medication'
  | 'medication-history'
  | 'profile'
  | 'notifications'
  | 'sync'
  | 'home';

export function emitHomeRefresh(reason: HomeRefreshReason) {
  DeviceEventEmitter.emit(HOME_REFRESH_EVENT, { reason, at: Date.now() });
}

export function emitHydrationUpdated() {
  DeviceEventEmitter.emit(HYDRATION_UPDATED_EVENT, { at: Date.now() });
  emitHomeRefresh('hydration');
}

export function emitMedicationUpdated() {
  DeviceEventEmitter.emit(MEDICATION_UPDATED_EVENT, { at: Date.now() });
  emitHomeRefresh('medication');
}

export function emitMedicationHistoryUpdated() {
  DeviceEventEmitter.emit(MEDICATION_HISTORY_UPDATED_EVENT, { at: Date.now() });
  emitHomeRefresh('medication-history');
}

export function emitProfileUpdated() {
  DeviceEventEmitter.emit(PROFILE_UPDATED_EVENT, { at: Date.now() });
  emitHomeRefresh('profile');
}

export function emitNotificationsUpdated(source = 'cache') {
  DeviceEventEmitter.emit(NOTIFICATIONS_UPDATED_EVENT, { at: Date.now(), source });
  emitHomeRefresh('notifications');
}

export function emitSyncCompleted(result?: any) {
  DeviceEventEmitter.emit(SYNC_COMPLETED_EVENT, { at: Date.now(), result });
  emitHomeRefresh('sync');
}

export function subscribeHomeRefresh(listener: (event: { reason?: HomeRefreshReason; at?: number }) => void) {
  return DeviceEventEmitter.addListener(HOME_REFRESH_EVENT, listener);
}
