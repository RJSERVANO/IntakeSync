import AsyncStorage from '@react-native-async-storage/async-storage';
import * as api from '../app/api';
import {
  cacheOwnerMatches,
  getCacheOwner,
  getMedicationCacheKey,
  getUserCacheIdentifier,
  getUserScopedKey,
  readOfflineCache,
  writeOfflineCache,
  getCachedSession,
} from './offlineStorage';
import { emitSyncCompleted } from './homeEvents';
import { captureAuthSessionContext, getCurrentAuthSessionVersion, isAuthSessionContextCurrent, isCurrentAuthSessionVersion } from './authSession';
import { logPerf, perfNow } from '../utils/perf';

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed' | 'failed_non_retryable';
export type SyncQueueAction =
  | 'LOG_BEVERAGE'
  | 'DELETE_BEVERAGE'
  | 'CREATE_MEDICATION'
  | 'UPDATE_MEDICATION'
  | 'DELETE_MEDICATION'
  | 'MARK_MEDICATION_TAKEN'
  | 'MARK_MEDICATION_MISSED'
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
  client_uuid?: string;
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
const SYNC_ITEM_TIMEOUT_MS = 10 * 1000;
const MAX_SYNC_RETRY_COUNT = 4;
const OFFLINE_SUPPORTED_ACTIONS = new Set<SyncQueueAction>([
  'LOG_BEVERAGE',
  'CREATE_MEDICATION',
  'UPDATE_MEDICATION',
  'MARK_MEDICATION_TAKEN',
  'MARK_MEDICATION_MISSED',
  'SNOOZE_MEDICATION',
  'MARK_NOTIFICATION_READ',
  'SNOOZE_NOTIFICATION',
  'COMPLETE_NOTIFICATION',
  'UPDATE_PROFILE',
  'UPDATE_SETTINGS',
  'SUBMIT_ONBOARDING',
  'NOTIFICATION_OPENED',
  'NOTIFICATION_COMPLETED',
  'NOTIFICATION_SNOOZED',
]);

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
    status: raw.status === 'synced'
      ? 'synced'
      : raw.status === 'syncing'
        ? 'syncing'
        : raw.status === 'failed_non_retryable'
          ? 'failed_non_retryable'
          : raw.status === 'failed'
            ? 'failed'
            : 'pending',
    retry_count: Number(raw.retry_count ?? raw.attempts ?? 0),
    attempts: Number(raw.retry_count ?? raw.attempts ?? 0),
    created_at: raw.created_at || new Date().toISOString(),
    updated_at: raw.updated_at || new Date().toISOString(),
    last_error: raw.last_error ?? null,
  };
}

async function readQueue(user?: any | null): Promise<SyncQueueItem[]> {
  try {
    const session = user ? null : await getCachedSession();
    const owner = getCacheOwner(user ?? session?.user);
    if (!owner.owner_id && !owner.owner_email) return [];
    const raw = await AsyncStorage.getItem(getUserScopedKey(owner, 'sync_queue'));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(normalizeItem).filter(Boolean) as SyncQueueItem[] : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: SyncQueueItem[], user?: any | null): Promise<boolean> {
  try {
    const session = user ? null : await getCachedSession();
    const owner = getCacheOwner(user ?? session?.user);
    if (!owner.owner_id && !owner.owner_email) return false;
    await AsyncStorage.setItem(getUserScopedKey(owner, 'sync_queue'), JSON.stringify(queue));
    return true;
  } catch {
    return false;
  }
}

export async function clearPendingSyncActionsForUser(user?: any | null) {
  const queue = await readQueue(user);
  const next = queue.filter((item) => item.status === 'synced');
  await writeQueue(next, user);
}

export async function clearSyncQueueForUser(user?: any | null) {
  await writeQueue([], user);
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
          client_uuid: item.payload.client_uuid || item.payload.local_id,
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
    case 'DELETE_BEVERAGE':
      return { endpoint: '/hydration/delete', method: 'POST', payload: { timestamp: item.payload.timestamp } };
    case 'CREATE_MEDICATION':
      return { endpoint: '/medications', method: 'POST', payload: { ...item.payload, local_id: item.local_id, client_uuid: item.local_id } };
    case 'UPDATE_MEDICATION':
      return { endpoint: `/medications/${item.payload.server_id || item.payload.id}`, method: 'PUT', payload: item.payload };
    case 'DELETE_MEDICATION':
      return { endpoint: `/medications/${item.payload.server_id || item.payload.id || item.local_id}`, method: 'DELETE', payload: {} };
    case 'MARK_MEDICATION_TAKEN':
    case 'MARK_MEDICATION_MISSED':
    case 'SNOOZE_MEDICATION':
      return {
        endpoint: `/medications/${item.payload.server_id || item.payload.medication_id}/history`,
        method: 'POST',
        payload: {
          status: item.action_type === 'MARK_MEDICATION_TAKEN' ? 'completed' : item.action_type === 'MARK_MEDICATION_MISSED' ? 'missed' : 'snoozed',
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

function itemBelongsToUser(item: SyncQueueItem, user?: any | null) {
  if (!item.owner_id && !item.owner_email) return false;
  return cacheOwnerMatches(item, user);
}

function isOfflineSyncActionSupported(actionType: SyncQueueAction) {
  return OFFLINE_SUPPORTED_ACTIONS.has(actionType);
}

function isActiveQueueItem(item: SyncQueueItem, user?: any | null) {
  return item.status !== 'synced'
    && item.status !== 'failed_non_retryable'
    && item.retry_count < MAX_SYNC_RETRY_COUNT
    && isOfflineSyncActionSupported(item.action_type)
    && itemBelongsToUser(item, user);
}

function validateQueueItem(item: SyncQueueItem): string | null {
  if (!isOfflineSyncActionSupported(item.action_type)) return 'unsupported_action';
  if (!item.local_id || !String(item.local_id).trim()) return 'missing_local_id';

  const payload = item.payload || {};
  if (item.action_type === 'LOG_BEVERAGE') {
    if (!payload.client_uuid && !payload.local_id && !item.local_id) return 'missing_beverage_id';
    if (!Number.isFinite(Number(payload.amount_ml)) || Number(payload.amount_ml) <= 0) return 'invalid_beverage_amount';
  }
  if (item.action_type === 'CREATE_MEDICATION' && (!payload.name || !Array.isArray(payload.times))) {
    return 'invalid_medication_payload';
  }
  if (item.action_type === 'UPDATE_MEDICATION' && !isServerMedicationId(payload.server_id || payload.id)) {
    return 'missing_server_medication_id';
  }
  if (['MARK_MEDICATION_TAKEN', 'MARK_MEDICATION_MISSED', 'SNOOZE_MEDICATION'].includes(item.action_type)) {
    if (!isServerMedicationId(payload.server_id || payload.medication_id)) return 'missing_server_medication_id';
    if (!payload.time) return 'missing_medication_history_time';
  }
  if (['MARK_NOTIFICATION_READ', 'SNOOZE_NOTIFICATION', 'COMPLETE_NOTIFICATION', 'NOTIFICATION_OPENED', 'NOTIFICATION_COMPLETED', 'NOTIFICATION_SNOOZED'].includes(item.action_type)) {
    if (!payload.notification_id && !payload.id && !item.local_id) return 'missing_notification_id';
  }
  return null;
}

function isServerMedicationId(value: any) {
  const text = String(value ?? '').trim();
  return Boolean(text && /^\d+$/.test(text));
}

function isNonRetryableSyncError(error: any, item: SyncQueueItem) {
  const status = Number(error?.status || 0);
  if (status === 400 || status === 422) return true;
  if (status === 404) {
    return ['MARK_NOTIFICATION_READ', 'COMPLETE_NOTIFICATION', 'SNOOZE_NOTIFICATION', 'NOTIFICATION_OPENED', 'NOTIFICATION_COMPLETED', 'NOTIFICATION_SNOOZED'].includes(item.action_type);
  }
  const message = String(error?.data?.message || error?.message || '').toLowerCase();
  return message.includes('unsupported action') || message.includes('no endpoint');
}

function withSyncItemTimeout<T>(promise: Promise<T>, item: SyncQueueItem): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject({
        status: 408,
        type: 'timeout',
        isNetworkError: true,
        message: `Sync item timed out: ${item.action_type}`,
      }), SYNC_ITEM_TIMEOUT_MS);
    }),
  ]);
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
      const serverIdString = String(serverId);
      const localIdString = String(localId);
      const nextByIdentity = new Map<string, any>();
      meds.forEach((med) => {
        const isSyncedCreate = med.id?.toString() === localIdString || med.local_id?.toString() === localIdString || med.client_uuid?.toString() === localIdString;
        const nextMed = isSyncedCreate
          ? { ...med, id: serverIdString, server_id: serverIdString, local_id: localIdString, sync_status: 'synced' }
          : med;
        const identity = String(nextMed.server_id || nextMed.id || nextMed.local_id || nextMed.client_uuid);
        const existing = nextByIdentity.get(identity);
        nextByIdentity.set(identity, existing ? { ...existing, ...nextMed, local_id: nextMed.local_id || existing.local_id } : nextMed);
      });
      const next = Array.from(nextByIdentity.values());
      await writeOfflineCache(cacheKey, { ...payload, data: next, saved_at: new Date().toISOString() });
    }
  } catch {
    // Cache refresh is best effort; the next backend load will reconcile.
  }
}

async function sendItem(item: SyncQueueItem, token: string) {
  const request = buildRequest(item);
  if (!request.endpoint) throw new Error(`No endpoint for ${item.action_type}`);

  if ((item.action_type === 'UPDATE_MEDICATION' || item.action_type === 'MARK_MEDICATION_TAKEN' || item.action_type === 'MARK_MEDICATION_MISSED' || item.action_type === 'SNOOZE_MEDICATION') && !isServerMedicationId(item.payload.server_id || item.payload.medication_id || item.payload.id)) {
    throw new Error('Waiting for medication create to sync first');
  }

  if (request.method === 'PUT') return api.put(request.endpoint, request.payload, token, 5000);
  if (request.method === 'DELETE') return api.del(request.endpoint, token, 5000);
  return api.post(request.endpoint, request.payload, token, 5000);
}

export async function enqueueSyncAction(action: EnqueueInput) {
  const now = new Date().toISOString();
  const session = await getCachedSession();
  const owner = getCacheOwner(session?.user);
  const queue = await readQueue(session?.user);
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
  if (!isOfflineSyncActionSupported(item.action_type)) {
    console.warn(`Unsupported offline sync action skipped: ${item.action_type}`);
    return { ...item, status: 'failed_non_retryable', last_error: 'unsupported_action' };
  }
  const invalidReason = validateQueueItem(item);
  if (invalidReason) {
    console.warn(`Invalid offline sync action skipped: ${item.action_type}:${invalidReason}`);
    return { ...item, status: 'failed_non_retryable', last_error: invalidReason };
  }
  const existingIndex = queue.findIndex((queued) => queued.id === item.id || (queued.action_type === item.action_type && queued.local_id === item.local_id));
  const next = [...queue];
  if (existingIndex >= 0) next[existingIndex] = { ...next[existingIndex], ...item, created_at: next[existingIndex].created_at };
  else next.push(item);
  await writeQueue(next, session?.user);
  return item;
}

export async function getPendingSyncActions() {
  const session = await getCachedSession();
  const queue = await readQueue(session?.user);
  return queue.filter((item) => isActiveQueueItem(item, session?.user));
}

export async function markSyncActionSynced(id: string) {
  const session = await getCachedSession();
  const queue = await readQueue(session?.user);
  await writeQueue(queue.map((item) => item.id === id || item.local_id === id ? { ...item, status: 'synced', updated_at: new Date().toISOString(), last_error: null } : item), session?.user);
}

export async function markSyncActionFailed(id: string, error: any) {
  const session = await getCachedSession();
  const queue = await readQueue(session?.user);
  const message = error?.data?.message || error?.message || 'Sync failed';
  await writeQueue(queue.map((item) => item.id === id || item.local_id === id ? { ...item, status: 'failed', retry_count: item.retry_count + 1, attempts: item.retry_count + 1, updated_at: new Date().toISOString(), last_error: message } : item), session?.user);
}

export async function removeSyncedActions() {
  const session = await getCachedSession();
  const queue = await readQueue(session?.user);
  await writeQueue(queue.filter((item) => item.status !== 'synced'), session?.user);
}

export async function mergeLatestPendingAction(action_type: SyncQueueAction, local_id: string, payload: any) {
  const session = await getCachedSession();
  const queue = await readQueue(session?.user);
  const index = queue.findIndex((item) => item.action_type === action_type && item.local_id === local_id && item.status !== 'synced');
  if (index < 0) return enqueueSyncAction({ action_type, local_id, payload });
  const next = [...queue];
  next[index] = { ...next[index], payload: { ...next[index].payload, ...payload }, status: 'pending', updated_at: new Date().toISOString(), last_error: null };
  await writeQueue(next, session?.user);
  return next[index];
}

export async function removePendingActionByLocalId(local_id: string) {
  const session = await getCachedSession();
  const queue = await readQueue(session?.user);
  await writeQueue(queue.filter((item) => item.local_id !== local_id || item.status === 'synced'), session?.user);
}

function syncMedicationIdentityValues(item: SyncQueueItem) {
  const payload = item.payload || {};
  return [
    item.local_id,
    payload.id,
    payload.server_id,
    payload.local_id,
    payload.client_uuid,
    payload.medication_id,
  ]
    .filter((value) => value !== null && value !== undefined && String(value).trim())
    .map((value) => String(value));
}

export async function removePendingMedicationActionsForDelete(identities: string[]) {
  const identitySet = new Set(identities.filter(Boolean).map(String));
  if (identitySet.size === 0) return { removedCreate: false };

  const session = await getCachedSession();
  const queue = await readQueue(session?.user);
  let removedCreate = false;
  const next = queue.filter((item) => {
    if (!['CREATE_MEDICATION', 'UPDATE_MEDICATION'].includes(item.action_type) || item.status === 'synced') return true;
    const matches = syncMedicationIdentityValues(item).some((identity) => identitySet.has(identity));
    if (matches && item.action_type === 'CREATE_MEDICATION') removedCreate = true;
    return !matches;
  });

  if (next.length !== queue.length) await writeQueue(next, session?.user);
  return { removedCreate };
}

export async function getSyncQueueSummary() {
  const session = await getCachedSession();
  const queue = await readQueue(session?.user);
  const pending = queue.filter((item) => item.status !== 'synced' && itemBelongsToUser(item, session?.user));
  const active = pending.filter((item) => isActiveQueueItem(item, session?.user));
  return {
    total: queue.length,
    pending: active.length,
    failed: active.filter((item) => item.status === 'failed').length,
    syncing: active.filter((item) => item.status === 'syncing').length,
  };
}

export async function hasPendingSyncActions() {
  return (await getPendingSyncActions()).length > 0;
}

export async function processSyncQueue(
  token: string | undefined,
  onSynced?: (item: SyncQueueItem, response: any) => Promise<void> | void,
) {
  const startedAt = perfNow();
  if (!token) {
    logPerf('Sync queue processing', startedAt, {
      skipped: 'missing_token',
      synced: 0,
      failed: 0,
    });
    return { synced: 0, failed: 0 };
  }
  if (isProcessing) {
    logPerf('Sync queue processing', startedAt, {
      skipped: 'already_processing',
      synced: 0,
      failed: 0,
    });
    return { synced: 0, failed: 0 };
  }
  isProcessing = true;
  const session = await getCachedSession();
  const sessionContext = await captureAuthSessionContext(token, session?.user ?? null);
  const sessionVersion = getCurrentAuthSessionVersion();
  const currentUser = session?.user;
  if (!currentUser || session?.token !== token || !(await isAuthSessionContextCurrent(sessionContext))) {
    isProcessing = false;
    logPerf('Sync queue processing', startedAt, {
      skipped: 'stale_session',
      synced: 0,
      failed: 0,
    });
    return { synced: 0, failed: 0 };
  }
  const queue = await readQueue(currentUser);
  const nextQueue = [...queue];
  let synced = 0;
  let failed = 0;
  let processed = 0;

  try {
    for (const item of queue) {
      if (item.status === 'synced') continue;
      const index = nextQueue.findIndex((queued) => queued.id === item.id);
      if (!itemBelongsToUser(item, currentUser)) {
        if (index >= 0) nextQueue[index] = { ...nextQueue[index], status: item.status === 'syncing' ? 'pending' : item.status };
        continue;
      }
      const invalidReason = validateQueueItem(item);
      if (invalidReason) {
        if (index >= 0) {
          nextQueue[index] = {
            ...nextQueue[index],
            status: 'failed_non_retryable',
            updated_at: new Date().toISOString(),
            last_error: invalidReason,
          };
        }
        console.warn(`Dropped offline sync action: ${item.action_type}:${invalidReason}`);
        failed += 1;
        continue;
      }
      if (item.retry_count >= MAX_SYNC_RETRY_COUNT) {
        if (index >= 0) {
          nextQueue[index] = {
            ...nextQueue[index],
            status: 'failed_non_retryable',
            updated_at: new Date().toISOString(),
            last_error: 'max_retries_exceeded',
          };
        }
        failed += 1;
        continue;
      }
      if (!isCurrentAuthSessionVersion(sessionVersion) || !(await isAuthSessionContextCurrent(sessionContext))) {
        return { synced, failed };
      }
      try {
        if (index >= 0) nextQueue[index] = { ...nextQueue[index], status: 'syncing', updated_at: new Date().toISOString() };
        processed += 1;
        const response = await withSyncItemTimeout(sendItem(item, token), item);
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
        if (api.isStaleSessionError(error) || !(await isAuthSessionContextCurrent(sessionContext))) {
          return { synced, failed };
        }
        const status = error?.status;
        const safeDuplicate = status === 409 && ['LOG_BEVERAGE', 'MARK_MEDICATION_TAKEN', 'MARK_MEDICATION_MISSED', 'SNOOZE_MEDICATION'].includes(item.action_type);
        const safeMissing = status === 404 && ['DELETE_MEDICATION', 'CLEAR_NOTIFICATION', 'MARK_NOTIFICATION_READ', 'COMPLETE_NOTIFICATION', 'SNOOZE_NOTIFICATION'].includes(item.action_type);
        if (safeDuplicate || safeMissing) {
          if (index >= 0) nextQueue[index] = { ...nextQueue[index], status: 'synced', updated_at: new Date().toISOString(), last_error: null };
          synced += 1;
          continue;
        }
        const nextRetryCount = index >= 0 ? nextQueue[index].retry_count + 1 : item.retry_count + 1;
        const nonRetryable = isNonRetryableSyncError(error, item) || nextRetryCount >= MAX_SYNC_RETRY_COUNT;
        if (index >= 0) {
          nextQueue[index] = {
            ...nextQueue[index],
            status: nonRetryable ? 'failed_non_retryable' : 'failed',
            retry_count: nextRetryCount,
            attempts: nextRetryCount,
            updated_at: new Date().toISOString(),
            last_error: error?.data?.message || error?.message || (nonRetryable ? 'Non-retryable sync failure' : 'Sync failed'),
          };
        }
        failed += 1;
      }
    }
    if (!isCurrentAuthSessionVersion(sessionVersion) || !(await isAuthSessionContextCurrent(sessionContext))) {
      return { synced, failed };
    }
    await writeQueue(nextQueue, currentUser);
    const latestQueue = await readQueue(currentUser);
    await writeQueue(latestQueue.filter((item) => item.status !== 'synced' && item.status !== 'failed_non_retryable'), currentUser);
    if (synced > 0 || failed > 0) emitSyncCompleted({ synced, failed });
    return { synced, failed };
  } finally {
    logPerf('Sync queue processing', startedAt, {
      queued: queue.length,
      processed,
      synced,
      failed,
    });
    isProcessing = false;
  }
}

export async function enqueueBeverageLog(payload: BeverageLogPayload) {
  const stableId = payload.client_uuid || payload.local_id;
  return enqueueSyncAction({
    local_id: stableId,
    action_type: 'LOG_BEVERAGE',
    method: 'POST',
    payload: { ...payload, local_id: stableId, client_uuid: stableId },
  });
}

export async function markBeverageLogSynced(localId: string) {
  const session = await getCachedSession();
  const queue = await readQueue(session?.user);
  await writeQueue(
    queue.filter((item) => !(item.action_type === 'LOG_BEVERAGE' && item.local_id === localId)),
    session?.user,
  );
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
