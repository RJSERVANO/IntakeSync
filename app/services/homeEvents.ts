import { DeviceEventEmitter } from 'react-native';

export const HOME_REFRESH_EVENT = 'home:refresh';
export const HYDRATION_UPDATED_EVENT = 'hydration:updated';
export const MEDICATION_UPDATED_EVENT = 'medication:updated';
export const MEDICATION_HISTORY_UPDATED_EVENT = 'history:updated';
export const NOTIFICATIONS_UPDATED_EVENT = 'notifications:updated';
export const REMINDERS_RESCHEDULED_EVENT = 'reminders:rescheduled';

export type HomeRefreshReason = 'hydration' | 'medication' | 'history' | 'home';

export function emitHomeRefresh(reason: HomeRefreshReason) {
  DeviceEventEmitter.emit(HOME_REFRESH_EVENT, { reason, at: Date.now() });
}

export function subscribeHomeRefresh(listener: (event: { reason?: HomeRefreshReason; at?: number }) => void) {
  return DeviceEventEmitter.addListener(HOME_REFRESH_EVENT, listener);
}
