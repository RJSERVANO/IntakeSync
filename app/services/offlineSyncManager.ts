import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { captureAuthSessionContext, isAuthSessionContextCurrent } from './authSession';
import { getCachedSession } from './offlineStorage';
import { getSyncQueueSummary, processSyncQueue } from './syncQueue';

let initialized = false;
let syncing = false;
let lastRunAt = 0;

export async function runOfflineSync(token?: string, force = false) {
  const now = Date.now();
  if (syncing || (!force && now - lastRunAt < 2500)) {
    return getSyncQueueSummary();
  }

  const session = token ? null : await getCachedSession();
  const syncToken = token || session?.token;
  if (!syncToken) return getSyncQueueSummary();
  const context = await captureAuthSessionContext(syncToken, session?.user ?? null);
  if (!(await isAuthSessionContextCurrent(context))) return getSyncQueueSummary();

  syncing = true;
  lastRunAt = now;
  try {
    await processSyncQueue(syncToken);
  } catch {
    // Screens keep their own offline UI; the queue stores item-level failures.
  } finally {
    syncing = false;
  }
  return getSyncQueueSummary();
}

export function initializeOfflineSync() {
  if (initialized) return;
  initialized = true;

  void runOfflineSync(undefined, true);

  NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) {
      void runOfflineSync(undefined, true);
    }
  });

  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void runOfflineSync();
    }
  });
}
