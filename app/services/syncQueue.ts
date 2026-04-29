import AsyncStorage from '@react-native-async-storage/async-storage';
import * as api from '../app/api';

const SYNC_QUEUE_KEY = 'intakesync.sync_queue';

export type SyncStatus = 'pending' | 'synced' | 'failed';
export type SyncQueueAction = 'LOG_BEVERAGE';

export interface BeverageLogPayload {
  local_id: string;
  amount_ml: number;
  beverage_type: string;
  sugar_level: string;
  caffeine_level: string;
  notes?: string | null;
  drink_label?: string | null;
  source: string;
  timestamp: string;
}

export interface SyncQueueItem {
  id: string;
  action: SyncQueueAction;
  payload: BeverageLogPayload;
  status: SyncStatus;
  attempts: number;
  created_at: string;
  updated_at: string;
  last_error?: string | null;
}

function createQueueId(localId: string) {
  return `queue_${localId}`;
}

async function readQueue(): Promise<SyncQueueItem[]> {
  try {
    const raw = await AsyncStorage.getItem(SYNC_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: SyncQueueItem[]): Promise<boolean> {
  try {
    await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
    return true;
  } catch {
    return false;
  }
}

export async function enqueueBeverageLog(payload: BeverageLogPayload) {
  const queue = await readQueue();
  const existing = queue.find((item) => item.action === 'LOG_BEVERAGE' && item.payload.local_id === payload.local_id);
  if (existing) return existing;

  const now = new Date().toISOString();
  const item: SyncQueueItem = {
    id: createQueueId(payload.local_id),
    action: 'LOG_BEVERAGE',
    payload,
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
  };
  const saved = await writeQueue([...queue, item]);
  if (!saved) return null;
  return item;
}

export async function markBeverageLogSynced(localId: string) {
  const queue = await readQueue();
  const nextQueue = queue.map((item) => {
    if (item.action !== 'LOG_BEVERAGE' || item.payload.local_id !== localId) return item;
    return {
      ...item,
      status: 'synced' as const,
      updated_at: new Date().toISOString(),
      last_error: null,
    };
  });
  await writeQueue(nextQueue);
}

export async function processBeverageQueue(
  token: string | undefined,
  onSynced?: (localId: string, response: any) => Promise<void> | void,
) {
  if (!token) return { synced: 0, failed: 0 };

  const queue = await readQueue();
  let synced = 0;
  let failed = 0;
  const nextQueue = [...queue];

  for (const item of queue) {
    if (item.action !== 'LOG_BEVERAGE' || item.status === 'synced') continue;
    try {
      const payload = item.payload;
      const response = await api.post('/hydration', {
        local_id: payload.local_id,
        client_uuid: payload.local_id,
        amount_ml: payload.amount_ml,
        source: payload.source,
        beverage_type: payload.beverage_type,
        sugar_level: payload.sugar_level,
        caffeine_level: payload.caffeine_level,
        notes: payload.notes ?? null,
        drink_label: payload.drink_label ?? null,
        timestamp: payload.timestamp,
      }, token, 5000);

      const index = nextQueue.findIndex((queued) => queued.id === item.id);
      if (index >= 0) {
        nextQueue[index] = {
          ...nextQueue[index],
          status: 'synced',
          updated_at: new Date().toISOString(),
          last_error: null,
        };
      }
      synced += 1;
      await onSynced?.(payload.local_id, response);
    } catch (error: any) {
      const index = nextQueue.findIndex((queued) => queued.id === item.id);
      if (index >= 0) {
        nextQueue[index] = {
          ...nextQueue[index],
          status: 'failed',
          attempts: nextQueue[index].attempts + 1,
          updated_at: new Date().toISOString(),
          last_error: error?.data?.message || error?.message || 'Sync failed',
        };
      }
      failed += 1;
    }
  }

  await writeQueue(nextQueue);
  return { synced, failed };
}
