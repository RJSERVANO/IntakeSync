import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { captureAuthSessionContext, isAuthSessionContextCurrent } from './authSession';
import { getCachedSession, readHydrationCache, writeHydrationCache } from './offlineStorage';
import { getSyncQueueSummary, processSyncQueue } from './syncQueue';

let initialized = false;
let syncing = false;
let lastRunAt = 0;
let lastReachable = false;

function getLocalDateKey(date: Date | string) {
  const value = typeof date === 'string' ? new Date(date) : date;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function totalForToday(entries: any[]) {
  const today = getLocalDateKey(new Date());
  return entries.reduce((sum, entry) => (
    sum + (entry?.timestamp && getLocalDateKey(entry.timestamp) === today ? Number(entry.amount_ml || 0) : 0)
  ), 0);
}

async function markCachedBeverageSynced(localId: string, response: any) {
  const cache = await readHydrationCache<any>();
  const entries = Array.isArray(cache?.entries) ? cache.entries : [];
  const nextEntries = entries.map((entry: any) => (
    entry?.local_id === localId || entry?.client_uuid === localId
      ? {
        ...entry,
        id: response?.id ?? response?.entry?.id ?? entry.id,
        client_uuid: entry.client_uuid || localId,
        sync_status: 'synced',
      }
      : entry
  ));
  const goal = Number(cache?.goal ?? cache?.daily_goal_ml ?? cache?.hydration_goal ?? 2000) || 2000;
  const todayTotal = totalForToday(nextEntries);
  await writeHydrationCache({
    ...(cache || {}),
    goal,
    daily_goal_ml: goal,
    today_total: todayTotal,
    percentage: goal > 0 ? Math.round((todayTotal / goal) * 100) : 0,
    entries: nextEntries,
  });
}

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
    await processSyncQueue(syncToken, async (item, response) => {
      if (item.action_type === 'LOG_BEVERAGE') {
        await markCachedBeverageSynced(item.local_id, response);
      }
    });
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
    const reachable = Boolean(state.isConnected && state.isInternetReachable !== false);
    if (reachable && !lastReachable) {
      void runOfflineSync(undefined, true);
    }
    lastReachable = reachable;
  });

  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void runOfflineSync();
    }
  });
}
