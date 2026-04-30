import AsyncStorage from '@react-native-async-storage/async-storage';

export const SESSION_CACHE_KEY = 'intakesync.cached_session';
export const HYDRATION_CACHE_KEY = 'hydration';
export const PROFILE_CACHE_KEY = '@intakesync:profile';
export const SETTINGS_CACHE_KEY = '@intakesync:settings';
export const NOTIFICATIONS_CACHE_KEY = '@intakesync:notifications';

export type CacheOwner = {
  owner_id?: string | number | null;
  owner_email?: string | null;
};

export type OwnedCachePayload<T = any> = CacheOwner & {
  data: T;
  saved_at: string;
};

export interface CachedSession {
  token: string;
  user?: any;
  hydrationGoal?: number | null;
  lastSuccessfulLoginAt: string;
}

export function hasValidCachedSession(session: any): session is CachedSession {
  return typeof session?.token === 'string' && session.token.trim().length > 0;
}

export async function getCachedSession(): Promise<CachedSession | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!hasValidCachedSession(parsed)) {
      await clearCachedSession();
      return null;
    }
    return {
      ...parsed,
      token: parsed.token.trim(),
      user: parsed.user ?? null,
      lastSuccessfulLoginAt: parsed.lastSuccessfulLoginAt || '',
    };
  } catch {
    await clearCachedSession();
    return null;
  }
}

type SessionInput = {
  token: string;
  user?: any;
  hydrationGoal?: number | null;
};

export async function saveCachedSession(token: string, user: any): Promise<void>;
export async function saveCachedSession(session: SessionInput): Promise<void>;
export async function saveCachedSession(sessionOrToken: SessionInput | string, user?: any): Promise<void> {
  try {
    const session: SessionInput =
      typeof sessionOrToken === 'string'
        ? { token: sessionOrToken, user }
        : sessionOrToken;
    const current = await getCachedSession();
    const token = session.token?.trim();
    if (!token) return;
    const next: CachedSession = {
      token,
      user: session.user ?? current?.user ?? null,
      hydrationGoal: session.hydrationGoal ?? current?.hydrationGoal ?? null,
      lastSuccessfulLoginAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(next));
  } catch {
    // Cached sessions improve offline startup, but storage failures should not block online auth.
  }
}

export async function clearCachedSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SESSION_CACHE_KEY);
  } catch {
    // Sign-out should remain best effort if device storage is unavailable.
  }
}

export async function updateCachedUser(user: any, token?: string): Promise<void> {
  try {
    const current = await getCachedSession();
    const sessionToken = token || current?.token;
    if (!sessionToken) return;
    const next: CachedSession = {
      token: sessionToken,
      user,
      hydrationGoal: current?.hydrationGoal ?? null,
      lastSuccessfulLoginAt: current?.lastSuccessfulLoginAt || new Date().toISOString(),
    };
    await AsyncStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(next));
  } catch {
    // Keep profile cache failures non-fatal.
  }
}

export async function updateCachedHydrationGoal(hydrationGoal: number, token?: string): Promise<void> {
  try {
    const current = await getCachedSession();
    const sessionToken = token || current?.token;
    if (!sessionToken) return;
    const next: CachedSession = {
      token: sessionToken,
      user: current?.user ?? null,
      hydrationGoal,
      lastSuccessfulLoginAt: current?.lastSuccessfulLoginAt || new Date().toISOString(),
    };
    await AsyncStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(next));
  } catch {
    // Hydration goal cache failures should not stop the local UI update.
  }
}

export async function readHydrationCache<T = any>(): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(HYDRATION_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function writeHydrationCache(data: any): Promise<void> {
  try {
    await AsyncStorage.setItem(HYDRATION_CACHE_KEY, JSON.stringify(data));
    const goal = Number(data?.goal ?? data?.daily_goal_ml ?? data?.hydration_goal ?? 0);
    if (Number.isFinite(goal) && goal > 0) {
      await updateCachedHydrationGoal(goal);
    }
  } catch {
    // Screens can still operate from in-memory state if a cache write fails.
  }
}

export async function readOfflineCache<T = any>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function writeOfflineCache(key: string, data: any): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Offline caches are best-effort and should never block the visible action.
  }
}

export async function readProfileCache<T = any>() {
  return readOfflineCache<T>(PROFILE_CACHE_KEY);
}

export async function writeProfileCache(data: any) {
  await writeOfflineCache(PROFILE_CACHE_KEY, data);
  await updateCachedUser(data);
}

export async function readSettingsCache<T = any>() {
  return readOfflineCache<T>(SETTINGS_CACHE_KEY);
}

export async function writeSettingsCache(data: any) {
  await writeOfflineCache(SETTINGS_CACHE_KEY, data);
}

export async function readNotificationsCache<T = any>() {
  return readOfflineCache<T>(NOTIFICATIONS_CACHE_KEY);
}

export async function writeNotificationsCache(data: any) {
  await writeOfflineCache(NOTIFICATIONS_CACHE_KEY, data);
}

function normalizeCachePart(value: string | number) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9@._-]+/g, '_');
}

export function getCacheOwner(user?: any | null): CacheOwner {
  return {
    owner_id: user?.id ?? user?.user_id ?? null,
    owner_email: typeof user?.email === 'string' ? user.email.trim().toLowerCase() : null,
  };
}

export function getUserCacheIdentifier(user?: any | null) {
  const owner = getCacheOwner(user);
  if (owner.owner_id !== null && owner.owner_id !== undefined && String(owner.owner_id).trim()) {
    return normalizeCachePart(owner.owner_id);
  }
  if (owner.owner_email) {
    return normalizeCachePart(owner.owner_email);
  }
  return null;
}

export function getMedicationCacheKey(userIdOrEmail?: string | number | null) {
  const owner = userIdOrEmail ? normalizeCachePart(userIdOrEmail) : 'unknown';
  return `@intakesync:user:${owner}:medications`;
}

export function getMedicationHistoryCacheKey(userIdOrEmail?: string | number | null) {
  const owner = userIdOrEmail ? normalizeCachePart(userIdOrEmail) : 'unknown';
  return `@intakesync:user:${owner}:med_history`;
}

export function getMedicationClearedHistoryCacheKey(userIdOrEmail?: string | number | null) {
  const owner = userIdOrEmail ? normalizeCachePart(userIdOrEmail) : 'unknown';
  return `@intakesync:user:${owner}:med_history_cleared_keys`;
}

export function cacheOwnerMatches(payload: any, user?: any | null) {
  const owner = getCacheOwner(user);
  if (!payload || !owner) return false;
  const cachedId = payload.owner_id;
  const cachedEmail = typeof payload.owner_email === 'string' ? payload.owner_email.trim().toLowerCase() : null;
  if (owner.owner_id !== null && owner.owner_id !== undefined && cachedId !== null && cachedId !== undefined) {
    return String(cachedId) === String(owner.owner_id);
  }
  if (owner.owner_email && cachedEmail) {
    return cachedEmail === owner.owner_email;
  }
  return false;
}

export async function readOwnedOfflineCache<T = any>(key: string, user?: any | null): Promise<OwnedCachePayload<T> | null> {
  const payload = await readOfflineCache<OwnedCachePayload<T>>(key);
  return cacheOwnerMatches(payload, user) ? payload : null;
}

export async function writeOwnedOfflineCache<T = any>(key: string, user: any | null | undefined, data: T): Promise<void> {
  const owner = getCacheOwner(user);
  if (!owner.owner_id && !owner.owner_email) return;
  await writeOfflineCache(key, {
    ...owner,
    data,
    saved_at: new Date().toISOString(),
  });
}

export async function readMedicationCache<T = any[]>(user?: any | null): Promise<T | null> {
  const ownerKey = getUserCacheIdentifier(user);
  if (!ownerKey) return null;
  const payload = await readOwnedOfflineCache<T>(getMedicationCacheKey(ownerKey), user);
  return payload?.data ?? null;
}

export async function writeMedicationCache(user: any | null | undefined, data: any[]): Promise<void> {
  const ownerKey = getUserCacheIdentifier(user);
  if (!ownerKey) return;
  await writeOwnedOfflineCache(getMedicationCacheKey(ownerKey), user, data);
}

export async function readMedicationHistoryCache<T = any[]>(user?: any | null): Promise<T | null> {
  const ownerKey = getUserCacheIdentifier(user);
  if (!ownerKey) return null;
  const payload = await readOwnedOfflineCache<T>(getMedicationHistoryCacheKey(ownerKey), user);
  return payload?.data ?? null;
}

export async function writeMedicationHistoryCache(user: any | null | undefined, data: any[]): Promise<void> {
  const ownerKey = getUserCacheIdentifier(user);
  if (!ownerKey) return;
  await writeOwnedOfflineCache(getMedicationHistoryCacheKey(ownerKey), user, data);
}
