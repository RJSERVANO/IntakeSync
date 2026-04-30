import AsyncStorage from '@react-native-async-storage/async-storage';
import * as api from '../app/api';
import {
  cacheOwnerMatches,
  getCacheOwner,
  getMedicationCacheKey,
  getUserCacheIdentifier,
  readOfflineCache,
  writeOfflineCache,
  getCachedSession,
} from './offlineStorage';

const SYNC_QUEUE_KEY = 'intakesync.sync_queue';

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';
export type SyncQueueAction =
  | 'LOG_BEVERAGE'
  | 'CREATE_MEDICATION'
  | 'UPDATE_MEDICATION'
  | 'DELETE_MEDICATION'
  | 'MARK_MEDICATION_TAKEN'
  | 'SNOOZE_MEDICATION'
  | 'CLEAR_MEDICATION_HISTORY'
  | 'MARK_NOTIFICATION_READ'
  | 'CLEAR_NOTIFICATION'
  | 'SNOOZE_NOTIFICATION'
  | 'COMPLETE_NOTIFICATION'
  | 'UPDATE_PROFILE'
  | 'UPDATE_SETTINGS'
  | 'SUBMIT_ONBOARDING'
  | 'NOTIFICATION_OPENED'
  | 'NOTIFICATION_COMPLETED'
  | 'NOTIFICATION_SNOOZED'
  | 'NOTIFICATION_CLEARED';

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
  local_id: string;
  owner_id?: string | number | null;
  owner_email?: string | null;
  action_type: SyncQueueAction;
  action?: SyncQueueAction;
  endpoint?: string;
  method: 'POST' | 'PUT' | 'DELETE';
  payload: any;
  status: SyncStatus;
  retry_count: number;
  attempts?: number;
  created_at: string;
  updated_at?: string;
  last_error?: string | null;
}

type EnqueueInput = Partial<SyncQueueItem> & {
  local_id: string;
  action_type: SyncQueueAction;
  payload?: any;
};

let isProcessing = false;

function queueId(actionType: SyncQueueAction, localId: string) {
  return `queue_${actionType}_${localId}`;
}

function normalizeItem(raw: any): SyncQueueItem | null {
  const actionType = raw?.action_type || raw?.action;
  const localId = raw?.local_id || raw?.payload?.local_id || raw?.payload?.client_uuid || raw?.id;
  if (!actionType || !localId) return null;
  return {
    id: raw.id || queueId(actionType, localId),
    local_id: String(localId),
    owner_id: raw.owner_id ?? raw.payload?.owner_id ?? null,
    owner_email: raw.owner_email ?? raw.payload?.owner_email ?? null,
    action_type: actionType,
    action: actionType,
    endpoint: raw.endpoint,
    method: raw.method || (actionType === 'DELETE_MEDICATION' || actionType === 'CLEAR_NOTIFICATION' ? 'DELETE' : 'POST'),
    payload: raw.payload || {},
    status: raw.status === 'synced' ? 'synced' : raw.status === 'syncing' ? 'syncing' : raw.status === 'failed' ? 'failed' : 'pending',
    retry_count: Number(raw.retry_count ?? raw.attempts ?? 0),
    attempts: Number(raw.retry_count ?? raw.attempts ?? 0),
    created_at: raw.created_at || new Date().toISOString(),
    updated_at: raw.updated_at || new Date().toISOString(),
    last_error: raw.last_error ?? null,
  };
}

async function readQueue(): Promise<SyncQueueItem[]> {
  try {
    const raw = await AsyncStorage.getItem(SYNC_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(normalizeItem).filter(Boolean) as SyncQueueItem[] : [];
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

function buildRequest(item: SyncQueueItem): { endpoint?: string; method: SyncQueueItem['method']; payload: any } {
  if (item.endpoint) return { endpoint: item.endpoint, method: item.method, payload: item.payload };

  switch (item.action_type) {
    case 'LOG_BEVERAGE':
      return {
        endpoint: '/hydration',
        method: 'POST',
        payload: {
          local_id: item.payload.local_id,
          client_uuid: item.payload.local_id,
          amount_ml: item.payload.amount_ml,
          source: item.payload.source,
          beverage_type: item.payload.beverage_type,
          sugar_level: item.payload.sugar_level,
          caffeine_level: item.payload.caffeine_level,
          notes: item.payload.notes ?? null,
          drink_label: item.payload.drink_label ?? null,
          timestamp: item.payload.timestamp,
        },
      };
    case 'CREATE_MEDICATION':
      return { endpoint: '/medications', method: 'POST', payload: { ...item.payload, local_id: item.local_id, client_uuid: item.local_id } };
    case 'UPDATE_MEDICATION':
      return { endpoint: `/medications/${item.payload.server_id || item.payload.id}`, method: 'PUT', payload: item.payload };
    case 'DELETE_MEDICATION':
      return { endpoint: `/medications/${item.payload.server_id || item.payload.id || item.local_id}`, method: 'DELETE', payload: {} };
    case 'MARK_MEDICATION_TAKEN':
    case 'SNOOZE_MEDICATION':
      return {
        endpoint: `/medications/${item.payload.server_id || item.payload.medication_id}/history`,
        method: 'POST',
        payload: {
          status: item.action_type === 'MARK_MEDICATION_TAKEN' ? 'completed' : 'snoozed',
          time: item.payload.time,
          local_id: item.local_id,
          client_uuid: item.local_id,
        },
      };
    case 'MARK_NOTIFICATION_READ':
    case 'NOTIFICATION_OPENED':
      return { endpoint: `/notifications/${item.payload.notification_id || item.payload.id || item.local_id}`, method: 'PUT', payload: item.payload };
    case 'CLEAR_NOTIFICATION':
    case 'NOTIFICATION_CLEARED':
      return { endpoint: `/notifications/${item.payload.notification_id || item.payload.id || item.local_id}`, method: 'DELETE', payload: {} };
    case 'SNOOZE_NOTIFICATION':
    case 'NOTIFICATION_SNOOZED':
      return { endpoint: `/notifications/${item.payload.notification_id || item.payload.id || item.local_id}/snooze`, method: 'POST', payload: item.payload };
    case 'COMPLETE_NOTIFICATION':
    case 'NOTIFICATION_COMPLETED':
      return { endpoint: `/notifications/${item.payload.notification_id || item.payload.id || item.local_id}/complete`, method: 'POST', payload: item.payload };
    case 'UPDATE_PROFILE':
      return { endpoint: '/me', method: 'PUT', payload: item.payload };
    case 'SUBMIT_ONBOARDING':
      return { endpoint: '/onboarding/update', method: 'PUT', payload: item.payload };
    default:
      return { endpoint: item.endpoint, method: item.method, payload: item.payload };
  }
}

function isMedicationAction(actionType: SyncQueueAction) {
  return [
    'CREATE_MEDICATION',
    'UPDATE_MEDICATION',
    'DELETE_MEDICATION',
    'MARK_MEDICATION_TAKEN',
    'SNOOZE_MEDICATION',
    'CLEAR_MEDICATION_HISTORY',
  ].includes(actionType);
}

function itemBelongsToUser(item: SyncQueueItem, user?: any | null) {
  if (!isMedicationAction(item.action_type)) return true;
  if (!item.owner_id && !item.owner_email) return false;
  return cacheOwnerMatches(item, user);
}

async function updateMedicationServerId(localId: string, serverId: string, user?: any | null) {
  try {
    const ownerKey = getUserCacheIdentifier(user);
    if (!ownerKey) return;
    const cacheKey = getMedicationCacheKey(ownerKey);
    const payload = await readOfflineCache<any>(cacheKey);
    if (!cacheOwnerMatches(payload, user)) return;
    const meds = payload?.data || [];
    if (Array.isArray(meds)) {
      const next = meds.map((med) => med.id?.toString() === localId ? { ...med, id: serverId, server_id: serverId, local_id: localId, sync_status: 'synced' } : med);
      await writeOfflineCache(cacheKey, { ...payload, data: next, saved_at: new Date().toISOString() });
    }
  } catch {
    // Cache refresh is best effort; the next backend load will reconcile.
  }
}

async function sendItem(item: SyncQueueItem, token: string) {
  if (item.action_type === 'CLEAR_MEDICATION_HISTORY') {
    return { local_only: true };
  }

  const request = buildRequest(item);
  if (!request.endpoint) throw new Error(`No endpoint for ${item.action_type}`);

  if ((item.action_type === 'UPDATE_MEDICATION' || item.action_type === 'MARK_MEDICATION_TAKEN' || item.action_type === 'SNOOZE_MEDICATION') && !request.endpoint.match(/\/\d+/)) {
    throw new Error('Waiting for medication create to sync first');
  }

  if (request.method === 'PUT') return api.put(request.endpoint, request.payload, token, 5000);
  if (request.method === 'DELETE') return api.del(request.endpoint, token, 5000);
  return api.post(request.endpoint, request.payload, token, 5000);
}

export async function enqueueSyncAction(action: EnqueueInput) {
  const queue = await readQueue();
  const now = new Date().toISOString();
  const session = await getCachedSession();
  const owner = getCacheOwner(session?.user);
  const item: SyncQueueItem = {
    id: action.id || queueId(action.action_type, action.local_id),
    local_id: action.local_id,
    owner_id: action.owner_id ?? action.payload?.owner_id ?? owner.owner_id ?? null,
    owner_email: action.owner_email ?? action.payload?.owner_email ?? owner.owner_email ?? null,
    action_type: action.action_type,
    action: action.action_type,
    endpoint: action.endpoint,
    method: action.method || 'POST',
    payload: {
      ...(action.payload || {}),
      owner_id: action.payload?.owner_id ?? action.owner_id ?? owner.owner_id ?? null,
      owner_email: action.payload?.owner_email ?? action.owner_email ?? owner.owner_email ?? null,
    },
    status: action.status || 'pending',
    retry_count: action.retry_count || 0,
    attempts: action.retry_count || 0,
    created_at: action.created_at || now,
    updated_at: now,
    last_error: null,
  };
  const existingIndex = queue.findIndex((queued) => queued.id === item.id || (queued.action_type === item.action_type && queued.local_id === item.local_id));
  const next = [...queue];
  if (existingIndex >= 0) next[existingIndex] = { ...next[existingIndex], ...item, created_at: next[existingIndex].created_at };
  else next.push(item);
  await writeQueue(next);
  return item;
}

export async function getPendingSyncActions() {
  const queue = await readQueue();
  const session = await getCachedSession();
  return queue.filter((item) => item.status !== 'synced' && itemBelongsToUser(item, session?.user));
}

export async function markSyncActionSynced(id: string) {
  const queue = await readQueue();
  await writeQueue(queue.map((item) => item.id === id || item.local_id === id ? { ...item, status: 'synced', updated_at: new Date().toISOString(), last_error: null } : item));
}

export async function markSyncActionFailed(id: string, error: any) {
  const queue = await readQueue();
  const message = error?.data?.message || error?.message || 'Sync failed';
  await writeQueue(queue.map((item) => item.id === id || item.local_id === id ? { ...item, status: 'failed', retry_count: item.retry_count + 1, attempts: item.retry_count + 1, updated_at: new Date().toISOString(), last_error: message } : item));
}

export async function removeSyncedActions() {
  const queue = await readQueue();
  await writeQueue(queue.filter((item) => item.status !== 'synced'));
}

export async function mergeLatestPendingAction(action_type: SyncQueueAction, local_id: string, payload: any) {
  const queue = await readQueue();
  const index = queue.findIndex((item) => item.action_type === action_type && item.local_id === local_id && item.status !== 'synced');
  if (index < 0) return enqueueSyncAction({ action_type, local_id, payload });
  const next = [...queue];
  next[index] = { ...next[index], payload: { ...next[index].payload, ...payload }, status: 'pending', updated_at: new Date().toISOString(), last_error: null };
  await writeQueue(next);
  return next[index];
}

export async function removePendingActionByLocalId(local_id: string) {
  const queue = await readQueue();
  await writeQueue(queue.filter((item) => item.local_id !== local_id || item.status === 'synced'));
}

export async function getSyncQueueSummary() {
  const queue = await readQueue();
  const session = await getCachedSession();
  const pending = queue.filter((item) => item.status !== 'synced' && itemBelongsToUser(item, session?.user));
  return {
    total: queue.length,
    pending: pending.length,
    failed: pending.filter((item) => item.status === 'failed').length,
    syncing: pending.filter((item) => item.status === 'syncing').length,
  };
}

export async function hasPendingSyncActions() {
  return (await getPendingSyncActions()).length > 0;
}

export async function processSyncQueue(
  token: string | undefined,
  onSynced?: (item: SyncQueueItem, response: any) => Promise<void> | void,
) {
  if (!token || isProcessing) return { synced: 0, failed: 0 };
  isProcessing = true;
  const session = await getCachedSession();
  const currentUser = session?.user;
  const queue = await readQueue();
  const nextQueue = [...queue];
  let synced = 0;
  let failed = 0;

  try {
    for (const item of queue) {
      if (item.status === 'synced') continue;
      const index = nextQueue.findIndex((queued) => queued.id === item.id);
      if (!itemBelongsToUser(item, currentUser)) {
        if (index >= 0) nextQueue[index] = { ...nextQueue[index], status: item.status === 'syncing' ? 'pending' : item.status };
        continue;
      }
      try {
        if (index >= 0) nextQueue[index] = { ...nextQueue[index], status: 'syncing', updated_at: new Date().toISOString() };
        const response = await sendItem(item, token);
        if (item.action_type === 'CREATE_MEDICATION') {
          const serverId = response?.id?.toString();
          if (serverId) {
            await updateMedicationServerId(item.local_id, serverId, currentUser);
            nextQueue.forEach((queued, queuedIndex) => {
              if (queued.local_id === item.local_id && queuedIndex !== index) {
                nextQueue[queuedIndex] = {
                  ...queued,
                  payload: { ...queued.payload, id: serverId, server_id: serverId, medication_id: serverId, local_id: item.local_id },
                  endpoint: queued.endpoint?.replace(item.local_id, serverId),
                };
              }
            });
          }
        }
        if (index >= 0) nextQueue[index] = { ...nextQueue[index], status: 'synced', updated_at: new Date().toISOString(), last_error: null };
        synced += 1;
        await onSynced?.(item, response);
      } catch (error: any) {
        const status = error?.status;
        const safeDuplicate = status === 409 && ['LOG_BEVERAGE', 'MARK_MEDICATION_TAKEN', 'SNOOZE_MEDICATION'].includes(item.action_type);
        const safeMissing = status === 404 && ['DELETE_MEDICATION', 'CLEAR_NOTIFICATION', 'MARK_NOTIFICATION_READ', 'COMPLETE_NOTIFICATION', 'SNOOZE_NOTIFICATION'].includes(item.action_type);
        if (safeDuplicate || safeMissing) {
          if (index >= 0) nextQueue[index] = { ...nextQueue[index], status: 'synced', updated_at: new Date().toISOString(), last_error: null };
          synced += 1;
          continue;
        }
        if (index >= 0) {
          nextQueue[index] = {
            ...nextQueue[index],
            status: 'failed',
            retry_count: nextQueue[index].retry_count + 1,
            attempts: nextQueue[index].retry_count + 1,
            updated_at: new Date().toISOString(),
            last_error: error?.data?.message || error?.message || 'Sync failed',
          };
        }
        failed += 1;
      }
    }
    await writeQueue(nextQueue);
    await removeSyncedActions();
    return { synced, failed };
  } finally {
    isProcessing = false;
  }
}

export async function enqueueBeverageLog(payload: BeverageLogPayload) {
  return enqueueSyncAction({
    local_id: payload.local_id,
    action_type: 'LOG_BEVERAGE',
    method: 'POST',
    payload,
  });
}

export async function markBeverageLogSynced(localId: string) {
  return markSyncActionSynced(localId);
}

export async function processBeverageQueue(
  token: string | undefined,
  onSynced?: (localId: string, response: any) => Promise<void> | void,
) {
  return processSyncQueue(token, async (item, response) => {
    if (item.action_type === 'LOG_BEVERAGE') {
      await onSynced?.(item.local_id, response);
    }
  });
}
