import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'intakesync.db';
const DEFAULT_USER_KEY = 'default';

type SQLiteDatabase = SQLite.SQLiteDatabase;

export type SyncQueueStatus = 'pending' | 'processing' | 'failed' | 'completed';
export type SyncDomain = 'hydration' | 'medication' | 'profile' | 'activity' | 'dashboard';

export type SyncQueueItem<TPayload = any> = {
  id: number;
  localId: string;
  userKey: string;
  domain: SyncDomain | string;
  action: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  endpoint: string;
  payload: TPayload;
  status: SyncQueueStatus;
  attempts: number;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
  nextAttemptAt?: string | null;
};

export type EnqueueSyncInput<TPayload = any> = {
  userKey?: string | null;
  domain: SyncDomain | string;
  action: string;
  method?: SyncQueueItem['method'];
  endpoint: string;
  payload?: TPayload;
  localId?: string;
  nextAttemptAt?: string | null;
};

export type MedicationCacheInput<TMedication = any> = {
  userKey?: string | null;
  medications: TMedication[];
  syncedAt?: string;
};

export type MedicationHistoryCacheInput<THistory = any> = {
  userKey?: string | null;
  medicationId: string | number;
  history: THistory[];
  syncedAt?: string;
};

export type HydrationCacheInput<THydration = any> = {
  userKey?: string | null;
  entries: THydration[];
  goal?: number | null;
  missed?: any[];
  userProfile?: any;
  syncedAt?: string;
};

type HydrationCacheRow = {
  data_json: string;
};

let dbPromise: Promise<SQLiteDatabase> | null = null;

function nowIso() {
  return new Date().toISOString();
}

function createLocalId(prefix = 'local') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function userScope(userKey?: string | null) {
  const trimmed = typeof userKey === 'string' ? userKey.trim() : '';
  return trimmed || DEFAULT_USER_KEY;
}

function stringify(value: any) {
  return JSON.stringify(value ?? null);
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function getItemId(item: any, fallbackPrefix: string) {
  const id = item?.id ?? item?.local_id ?? item?.localId ?? item?.timestamp;
  return id != null ? String(id) : createLocalId(fallbackPrefix);
}

async function ensureColumn(db: SQLiteDatabase, table: string, column: string, definition: string) {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (columns.some((existing) => existing.name === column)) return;
  await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

async function migrate(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS medication_cache (
      user_key TEXT NOT NULL,
      medication_id TEXT NOT NULL,
      data_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced_at TEXT,
      deleted INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_key, medication_id)
    );

    CREATE TABLE IF NOT EXISTS medication_history_cache (
      user_key TEXT NOT NULL,
      history_id TEXT NOT NULL,
      medication_id TEXT NOT NULL,
      data_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced_at TEXT,
      deleted INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_key, history_id)
    );

    CREATE INDEX IF NOT EXISTS idx_medication_history_cache_medication
      ON medication_history_cache (user_key, medication_id);

    CREATE TABLE IF NOT EXISTS hydration_cache (
      user_key TEXT NOT NULL,
      entry_id TEXT NOT NULL,
      timestamp TEXT,
      beverage_type TEXT DEFAULT 'water',
      sugar_level TEXT DEFAULT 'none',
      caffeine_level TEXT DEFAULT 'none',
      notes TEXT,
      data_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced_at TEXT,
      deleted INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_key, entry_id)
    );

    CREATE INDEX IF NOT EXISTS idx_hydration_cache_timestamp
      ON hydration_cache (user_key, timestamp);

    CREATE TABLE IF NOT EXISTS hydration_state_cache (
      user_key TEXT NOT NULL,
      cache_key TEXT NOT NULL,
      data_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced_at TEXT,
      PRIMARY KEY (user_key, cache_key)
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      local_id TEXT NOT NULL UNIQUE,
      user_key TEXT NOT NULL,
      domain TEXT NOT NULL,
      action TEXT NOT NULL,
      method TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      payload_json TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      next_attempt_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sync_queue_status
      ON sync_queue (status, next_attempt_at, created_at);

    CREATE INDEX IF NOT EXISTS idx_sync_queue_user_domain
      ON sync_queue (user_key, domain);
  `);

  await ensureColumn(db, 'hydration_cache', 'beverage_type', "TEXT DEFAULT 'water'");
  await ensureColumn(db, 'hydration_cache', 'sugar_level', "TEXT DEFAULT 'none'");
  await ensureColumn(db, 'hydration_cache', 'caffeine_level', "TEXT DEFAULT 'none'");
  await ensureColumn(db, 'hydration_cache', 'notes', 'TEXT');
}

export async function getLocalDatabase() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DATABASE_NAME).then(async (db) => {
      await migrate(db);
      return db;
    });
  }

  return dbPromise;
}

export async function initLocalDatabase() {
  await getLocalDatabase();
}

export async function saveMedicationCache<TMedication = any>({
  userKey,
  medications,
  syncedAt = nowIso(),
}: MedicationCacheInput<TMedication>) {
  const db = await getLocalDatabase();
  const scopedUser = userScope(userKey);
  const updatedAt = nowIso();

  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE medication_cache SET deleted = 1, updated_at = ? WHERE user_key = ?', [
      updatedAt,
      scopedUser,
    ]);

    for (const medication of medications) {
      const medicationId = getItemId(medication, 'medication');
      await db.runAsync(
        `INSERT OR REPLACE INTO medication_cache
          (user_key, medication_id, data_json, updated_at, synced_at, deleted)
         VALUES (?, ?, ?, ?, ?, 0)`,
        [scopedUser, medicationId, stringify({ ...medication, id: medicationId }), updatedAt, syncedAt],
      );
    }
  });
}

export async function readMedicationCache<TMedication = any>(userKey?: string | null) {
  const db = await getLocalDatabase();
  const rows = await db.getAllAsync<{ data_json: string }>(
    `SELECT data_json FROM medication_cache
     WHERE user_key = ? AND deleted = 0
     ORDER BY updated_at DESC`,
    [userScope(userKey)],
  );

  return rows.map((row) => parseJson<TMedication>(row.data_json, {} as TMedication));
}

export async function saveMedicationHistoryCache<THistory = any>({
  userKey,
  medicationId,
  history,
  syncedAt = nowIso(),
}: MedicationHistoryCacheInput<THistory>) {
  const db = await getLocalDatabase();
  const scopedUser = userScope(userKey);
  const medId = String(medicationId);
  const updatedAt = nowIso();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE medication_history_cache SET deleted = 1, updated_at = ? WHERE user_key = ? AND medication_id = ?',
      [updatedAt, scopedUser, medId],
    );

    for (const entry of history) {
      const historyId = getItemId(entry, 'med_history');
      await db.runAsync(
        `INSERT OR REPLACE INTO medication_history_cache
          (user_key, history_id, medication_id, data_json, updated_at, synced_at, deleted)
         VALUES (?, ?, ?, ?, ?, ?, 0)`,
        [scopedUser, historyId, medId, stringify({ ...entry, id: historyId }), updatedAt, syncedAt],
      );
    }
  });
}

export async function readMedicationHistoryCache<THistory = any>(
  userKey?: string | null,
  medicationId?: string | number,
) {
  const db = await getLocalDatabase();
  const params: any[] = [userScope(userKey)];
  let where = 'user_key = ? AND deleted = 0';

  if (medicationId != null) {
    where += ' AND medication_id = ?';
    params.push(String(medicationId));
  }

  const rows = await db.getAllAsync<{ data_json: string }>(
    `SELECT data_json FROM medication_history_cache
     WHERE ${where}
     ORDER BY updated_at DESC`,
    params,
  );

  return rows.map((row) => parseJson<THistory>(row.data_json, {} as THistory));
}

export async function saveHydrationCache<THydration = any>({
  userKey,
  entries,
  goal,
  missed,
  userProfile,
  syncedAt = nowIso(),
}: HydrationCacheInput<THydration>) {
  const db = await getLocalDatabase();
  const scopedUser = userScope(userKey);
  const updatedAt = nowIso();

  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE hydration_cache SET deleted = 1, updated_at = ? WHERE user_key = ?', [
      updatedAt,
      scopedUser,
    ]);

    for (const entry of entries) {
      const hydrationEntry = entry as any;
      const entryId = getItemId(entry, 'hydration');
      const timestamp = hydrationEntry?.timestamp ? String(hydrationEntry.timestamp) : null;
      const beverageType = hydrationEntry?.beverage_type ?? 'water';
      const sugarLevel = hydrationEntry?.sugar_level ?? 'none';
      const caffeineLevel = hydrationEntry?.caffeine_level ?? 'none';
      const notes = hydrationEntry?.notes ?? null;

      await db.runAsync(
        `INSERT OR REPLACE INTO hydration_cache
          (user_key, entry_id, timestamp, beverage_type, sugar_level, caffeine_level, notes, data_json, updated_at, synced_at, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          scopedUser,
          entryId,
          timestamp,
          beverageType,
          sugarLevel,
          caffeineLevel,
          notes,
          stringify({
            ...hydrationEntry,
            id: entryId,
            beverage_type: beverageType,
            sugar_level: sugarLevel,
            caffeine_level: caffeineLevel,
            notes,
          }),
          updatedAt,
          syncedAt,
        ],
      );
    }

    await db.runAsync(
      `INSERT OR REPLACE INTO hydration_state_cache
        (user_key, cache_key, data_json, updated_at, synced_at)
       VALUES (?, 'summary', ?, ?, ?)`,
      [scopedUser, stringify({ goal, missed: missed ?? [], user_profile: userProfile ?? null }), updatedAt, syncedAt],
    );
  });
}

export async function readHydrationCache<THydration = any>(userKey?: string | null) {
  const db = await getLocalDatabase();
  const scopedUser = userScope(userKey);
  const [rows, summaryRow] = await Promise.all([
    db.getAllAsync<HydrationCacheRow>(
      `SELECT data_json FROM hydration_cache
       WHERE user_key = ? AND deleted = 0
       ORDER BY timestamp DESC, updated_at DESC`,
      [scopedUser],
    ),
    db.getFirstAsync<{ data_json: string }>(
      `SELECT data_json FROM hydration_state_cache
       WHERE user_key = ? AND cache_key = 'summary'`,
      [scopedUser],
    ),
  ]);

  const summary = parseJson<any>(summaryRow?.data_json, {});

  return {
    goal: summary.goal ?? null,
    missed: summary.missed ?? [],
    user_profile: summary.user_profile ?? null,
    entries: rows.map((row) => parseJson<THydration>(row.data_json, {} as THydration)),
  };
}

export async function enqueueSyncAction<TPayload = any>({
  userKey,
  domain,
  action,
  method = 'POST',
  endpoint,
  payload = null as TPayload,
  localId = createLocalId('sync'),
  nextAttemptAt = null,
}: EnqueueSyncInput<TPayload>) {
  const db = await getLocalDatabase();
  const timestamp = nowIso();

  await db.runAsync(
    `INSERT OR REPLACE INTO sync_queue
      (local_id, user_key, domain, action, method, endpoint, payload_json, status, attempts, created_at, updated_at, next_attempt_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)`,
    [
      localId,
      userScope(userKey),
      domain,
      action,
      method,
      endpoint,
      stringify(payload),
      timestamp,
      timestamp,
      nextAttemptAt,
    ],
  );

  return localId;
}

export async function getPendingSyncQueue(userKey?: string | null, limit = 25) {
  const db = await getLocalDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM sync_queue
     WHERE user_key = ?
       AND status IN ('pending', 'failed')
       AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
     ORDER BY created_at ASC
     LIMIT ?`,
    [userScope(userKey), nowIso(), limit],
  );

  return rows.map(rowToSyncQueueItem);
}

export async function markSyncQueueCompleted(id: number) {
  const db = await getLocalDatabase();
  await db.runAsync(
    "UPDATE sync_queue SET status = 'completed', updated_at = ?, last_error = NULL WHERE id = ?",
    [nowIso(), id],
  );
}

export async function markSyncQueueFailed(id: number, error: unknown) {
  const db = await getLocalDatabase();
  const message = error instanceof Error ? error.message : stringify(error);
  const retryAt = new Date(Date.now() + 60 * 1000).toISOString();

  await db.runAsync(
    `UPDATE sync_queue
     SET status = 'failed',
         attempts = attempts + 1,
         last_error = ?,
         updated_at = ?,
         next_attempt_at = ?
     WHERE id = ?`,
    [message, nowIso(), retryAt, id],
  );
}

export async function processSyncQueue(
  userKey: string | null | undefined,
  handler: (item: SyncQueueItem) => Promise<void>,
  limit = 25,
) {
  const pending = await getPendingSyncQueue(userKey, limit);
  const results: { item: SyncQueueItem; ok: boolean; error?: unknown }[] = [];

  for (const item of pending) {
    try {
      await setSyncQueueProcessing(item.id);
      await handler(item);
      await markSyncQueueCompleted(item.id);
      results.push({ item, ok: true });
    } catch (error) {
      await markSyncQueueFailed(item.id, error);
      results.push({ item, ok: false, error });
    }
  }

  return results;
}

async function setSyncQueueProcessing(id: number) {
  const db = await getLocalDatabase();
  await db.runAsync("UPDATE sync_queue SET status = 'processing', updated_at = ? WHERE id = ?", [nowIso(), id]);
}

function rowToSyncQueueItem(row: any): SyncQueueItem {
  return {
    id: row.id,
    localId: row.local_id,
    userKey: row.user_key,
    domain: row.domain,
    action: row.action,
    method: row.method,
    endpoint: row.endpoint,
    payload: parseJson(row.payload_json, null),
    status: row.status,
    attempts: row.attempts,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    nextAttemptAt: row.next_attempt_at,
  };
}
