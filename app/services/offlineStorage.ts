import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import {
  emitHydrationUpdated,
  emitMedicationHistoryUpdated,
  emitMedicationUpdated,
  emitNotificationsUpdated,
  emitProfileUpdated,
} from './homeEvents';

export const SESSION_CACHE_KEY = 'intakesync.cached_session';
export const STARTUP_SPLASH_SEEN_KEY = '@intakesync_has_seen_startup_splash';
export const HYDRATION_CACHE_KEY = 'hydration';
export const PROFILE_CACHE_KEY = '@intakesync:profile';
export const SETTINGS_CACHE_KEY = '@intakesync:settings';
export const NOTIFICATIONS_CACHE_KEY = '@intakesync:notifications';
export const OTC_SEARCH_CACHE_KEY = '@intakesync:otc_search_cache:v1';
export const OTC_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const OTC_SEARCH_CACHE_MAX_ITEMS = 200;
const OTC_SEARCH_CACHE_MAX_QUERIES = 30;
export const ONBOARDING_COMPLETE_KEY_PREFIX = '@intakesync:onboarding_complete:';
export const ONBOARDING_PROGRESS_KEY_PREFIX = '@intakesync:onboarding_progress:';

export type CacheOwner = {
  id?: string | number | null;
  email?: string | null;
  owner_id?: string | number | null;
  owner_email?: string | null;
};

export type OwnedCachePayload<T = any> = CacheOwner & {
  data: T;
  saved_at: string;
};

type OtcCacheEntry = {
  saved_at: string;
  source: 'backend' | 'bundled';
  data: any[];
};

type OtcSearchCachePayload = OtcCacheEntry & {
  queries?: Record<string, OtcCacheEntry>;
};

export interface CachedSession {
  token: string;
  user?: any;
  hydrationGoal?: number | null;
  lastSuccessfulLoginAt: string;
}

export type LocalAvatarData =
  | { type: 'built_in'; avatar_key: string }
  | { type: 'custom'; avatar_uri: string };

export function getSessionUserIdentifier(user?: any | null): string | null {
  const id = user?.id ?? user?.user_id;
  if (id !== null && id !== undefined && String(id).trim()) return String(id).trim();
  if (typeof user?.email === 'string' && user.email.trim()) return user.email.trim().toLowerCase();
  return null;
}

export function hasValidCachedSession(session: any): session is CachedSession {
  return typeof session?.token === 'string' && session.token.trim().length > 0 && !!getSessionUserIdentifier(session?.user);
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
    const userWithLocalAvatar = await mergeLocalAvatarIntoUser(session.user ?? current?.user ?? null);
    const next: CachedSession = {
      token,
      user: userWithLocalAvatar,
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

export async function clearUserScopedLocalData(user?: any | null): Promise<void> {
  const owner = getCacheOwner(user);
  if (!owner.owner_id && !owner.owner_email) return;
  try {
    const prefix = getUserScopedKey(owner, '');
    const keys = await AsyncStorage.getAllKeys();
    const scopedKeys = keys.filter((key) => key.startsWith(prefix));
    if (scopedKeys.length > 0) await AsyncStorage.multiRemove(scopedKeys);
  } catch {
    // Account deletion should continue with other local cleanup steps.
  }
}

export async function hasSeenStartupSplash(): Promise<boolean> {
  try {
    return await AsyncStorage.getItem(STARTUP_SPLASH_SEEN_KEY) === 'true';
  } catch {
    return false;
  }
}

export async function markStartupSplashSeen(): Promise<void> {
  await AsyncStorage.setItem(STARTUP_SPLASH_SEEN_KEY, 'true');
}

export async function updateCachedUser(user: any, token?: string): Promise<void> {
  try {
    const current = await getCachedSession();
    const sessionToken = token || current?.token;
    if (!sessionToken) return;
    const mergedUser = await mergeLocalAvatarIntoUser({ ...(current?.user || {}), ...(user || {}) });
    const next: CachedSession = {
      token: sessionToken,
      user: mergedUser,
      hydrationGoal: current?.hydrationGoal ?? null,
      lastSuccessfulLoginAt: current?.lastSuccessfulLoginAt || new Date().toISOString(),
    };
    await AsyncStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(next));
    emitProfileUpdated();
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

function normalizeCachePart(value: string | number) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9@._-]+/g, '_');
}

export function getUserOnboardingId(user?: any | null): string | null {
  const id = user?.id ?? user?.user_id;
  if (id !== null && id !== undefined && String(id).trim()) return normalizeCachePart(id);
  if (typeof user?.email === 'string' && user.email.trim()) {
    return normalizeCachePart(user.email.trim().toLowerCase());
  }
  return null;
}

export function getOnboardingCompleteKey(userId: string | number): string {
  return `${ONBOARDING_COMPLETE_KEY_PREFIX}${normalizeCachePart(userId)}`;
}

export function getOnboardingProgressKey(userId: string | number): string {
  return `${ONBOARDING_PROGRESS_KEY_PREFIX}${normalizeCachePart(userId)}`;
}

export async function hasCompletedOnboarding(user?: any | null): Promise<boolean> {
  const userId = getUserOnboardingId(user);
  if (!userId) return false;
  try {
    const completed = await AsyncStorage.getItem(getOnboardingCompleteKey(userId));
    if (completed === 'true') return true;
    if (user?.onboarding_completed === true) {
      await AsyncStorage.setItem(getOnboardingCompleteKey(userId), 'true');
      return true;
    }
    return false;
  } catch {
    return user?.onboarding_completed === true;
  }
}

export async function markOnboardingComplete(user?: any | null): Promise<boolean> {
  const userId = getUserOnboardingId(user);
  if (!userId) return false;
  try {
    await AsyncStorage.setItem(getOnboardingCompleteKey(userId), 'true');
    await AsyncStorage.removeItem(getOnboardingProgressKey(userId));
    return true;
  } catch {
    return false;
  }
}

export async function readOnboardingProgress(user?: any | null): Promise<number | null> {
  const userId = getUserOnboardingId(user);
  if (!userId) return null;
  try {
    const raw = await AsyncStorage.getItem(getOnboardingProgressKey(userId));
    if (!raw) return null;
    const step = Number(raw);
    return Number.isInteger(step) && step >= 0 ? step : null;
  } catch {
    return null;
  }
}

export async function writeOnboardingProgress(user: any | null | undefined, step: number): Promise<void> {
  const userId = getUserOnboardingId(user);
  if (!userId || !Number.isInteger(step) || step < 0) return;
  try {
    await AsyncStorage.setItem(getOnboardingProgressKey(userId), String(step));
  } catch {
    // Onboarding progress is a convenience cache; failed writes should not block navigation.
  }
}

export function normalizeOtcSearchQuery(query: string) {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

export const BUNDLED_OTC_MEDICINES = [
  {
    id: 'otc_acetaminophen',
    name: 'Acetaminophen',
    generic_name: 'Paracetamol',
    category: 'Pain reliever',
    common_use: 'Pain relief and fever reducer',
    dosage_text: 'Follow the label. Common adult dose is every 4 to 6 hours as needed.',
    interval_hours: 6,
    max_daily_doses: 4,
    warnings: 'Do not exceed the label maximum. Avoid combining with other acetaminophen-containing products.',
  },
  {
    id: 'otc_ibuprofen',
    name: 'Ibuprofen',
    category: 'NSAID pain reliever',
    common_use: 'Pain, fever, and inflammation',
    dosage_text: 'Follow the label. Common adult dose is every 6 to 8 hours as needed.',
    interval_hours: 8,
    max_daily_doses: 3,
    warnings: 'Avoid if advised not to take NSAIDs. Take with food or milk if stomach upset occurs.',
  },
  {
    id: 'otc_loratadine',
    name: 'Loratadine',
    category: 'Antihistamine',
    common_use: 'Allergy symptoms',
    dosage_text: 'Follow the label. Common adult dose is once daily.',
    interval_hours: 24,
    max_daily_doses: 1,
    warnings: 'Use only as directed. Ask a healthcare professional if symptoms persist.',
  },
  {
    id: 'otc_cetirizine',
    name: 'Cetirizine',
    category: 'Antihistamine',
    common_use: 'Allergy symptoms',
    dosage_text: 'Follow the label. Common adult dose is once daily.',
    interval_hours: 24,
    max_daily_doses: 1,
    warnings: 'May cause drowsiness. Use only as directed.',
  },
  {
    id: 'otc_diphenhydramine',
    name: 'Diphenhydramine',
    category: 'Antihistamine',
    common_use: 'Allergy symptoms and occasional sleeplessness',
    dosage_text: 'Follow the label. Common adult dose is every 4 to 6 hours as needed.',
    interval_hours: 6,
    max_daily_doses: 4,
    warnings: 'May cause marked drowsiness. Avoid alcohol and driving until you know how it affects you.',
  },
  {
    id: 'otc_loperamide',
    name: 'Loperamide',
    category: 'Antidiarrheal',
    common_use: 'Diarrhea symptom relief',
    dosage_text: 'Follow the label after each loose stool. Do not exceed the label maximum.',
    interval_hours: 6,
    max_daily_doses: 4,
    warnings: 'Stop use and seek medical advice if symptoms persist or fever/bloody stool occurs.',
  },
  {
    id: 'otc_omeprazole',
    name: 'Omeprazole',
    category: 'Acid reducer',
    common_use: 'Frequent heartburn',
    dosage_text: 'Follow the label. Common adult dose is once daily before a meal.',
    interval_hours: 24,
    max_daily_doses: 1,
    warnings: 'Use only as directed. Ask a healthcare professional if symptoms continue.',
  },
  {
    id: 'otc_calcium_carbonate',
    name: 'Calcium carbonate',
    category: 'Antacid',
    common_use: 'Heartburn and acid indigestion',
    dosage_text: 'Follow the label as symptoms occur.',
    interval_hours: 4,
    max_daily_doses: 4,
    warnings: 'Do not exceed the label maximum.',
  },
];

function getOtcSearchableText(item: any) {
  return [
    item?.name,
    item?.generic_name,
    item?.brand,
    item?.category,
    item?.description,
    item?.common_use,
    item?.dosage,
    item?.dosage_text,
    item?.frequency,
    item?.timing_instructions,
  ].filter(Boolean).join(' ').toLowerCase();
}

function getOtcCacheId(item: any) {
  return String(item?.id ?? item?.name ?? JSON.stringify(item));
}

function isUserMedicationRecord(item: any) {
  return (
    Array.isArray(item?.times) ||
    item?.reminder !== undefined ||
    item?.start_date !== undefined ||
    item?.end_date !== undefined ||
    item?.sync_status !== undefined ||
    item?.local_id !== undefined ||
    item?.server_id !== undefined ||
    item?.client_uuid !== undefined ||
    item?.otc_metadata !== undefined
  );
}

function isOtcReferenceRecord(item: any) {
  return !!item?.name && !isUserMedicationRecord(item);
}

export function filterOtcReferenceMedicines(items: any[]) {
  return (Array.isArray(items) ? items : []).filter(isOtcReferenceRecord);
}

function dedupeOtcResults(items: any[]) {
  const byId = new Map<string, any>();
  filterOtcReferenceMedicines(items).forEach((item) => byId.set(getOtcCacheId(item), item));
  return Array.from(byId.values()).slice(0, OTC_SEARCH_CACHE_MAX_ITEMS);
}

function isOtcCacheStale(savedAt?: string | null) {
  if (!savedAt) return true;
  const savedTime = new Date(savedAt).getTime();
  return !Number.isFinite(savedTime) || Date.now() - savedTime > OTC_CACHE_MAX_AGE_MS;
}

export async function readOtcSearchCache(): Promise<OtcSearchCachePayload | null> {
  const payload = await readOfflineCache<any>(OTC_SEARCH_CACHE_KEY);
  if (!payload || typeof payload !== 'object') return null;

  if (Array.isArray(payload.data)) {
    const queries: Record<string, OtcCacheEntry> = {};
    if (payload.queries && typeof payload.queries === 'object') {
      Object.entries(payload.queries).forEach(([query, entry]: [string, any]) => {
        queries[query] = {
          saved_at: entry?.saved_at || payload.saved_at || new Date(0).toISOString(),
          source: entry?.source === 'bundled' ? 'bundled' : 'backend',
          data: dedupeOtcResults(Array.isArray(entry?.data) ? entry.data : []),
        };
      });
    }
    return {
      saved_at: payload.saved_at || new Date(0).toISOString(),
      source: 'backend',
      data: dedupeOtcResults(payload.data),
      queries,
    };
  }

  if (payload.data && typeof payload.data === 'object') {
    const queries: Record<string, OtcCacheEntry> = {};
    Object.entries(payload.data).forEach(([query, results]) => {
      queries[query] = {
        saved_at: payload.saved_at || new Date(0).toISOString(),
        source: 'backend',
        data: dedupeOtcResults(Array.isArray(results) ? results : []),
      };
    });
    return {
      saved_at: payload.saved_at || new Date(0).toISOString(),
      source: 'backend',
      data: dedupeOtcResults(Object.values(queries).flatMap((entry) => entry.data)),
      queries,
    };
  }

  return null;
}

export async function writeOtcSearchCache(query: string, results: any[]): Promise<void> {
  const normalizedQuery = normalizeOtcSearchQuery(query);
  if (!normalizedQuery) return;
  const current = await readOtcSearchCache();
  const now = new Date().toISOString();
  const safeResults = dedupeOtcResults(Array.isArray(results) ? results : []);
  const queries = {
    ...(current?.queries || {}),
    [normalizedQuery]: {
      saved_at: now,
      source: 'backend' as const,
      data: safeResults,
    },
  };
  const recentQueries = Object.fromEntries(
    Object.entries(queries)
      .sort(([, a], [, b]) => new Date(b.saved_at).getTime() - new Date(a.saved_at).getTime())
      .slice(0, OTC_SEARCH_CACHE_MAX_QUERIES)
  );
  await writeOfflineCache(OTC_SEARCH_CACHE_KEY, {
    saved_at: now,
    source: 'backend',
    data: dedupeOtcResults([...(current?.data || []), ...safeResults]),
    queries: recentQueries,
  });
}

export async function searchCachedOtcMedicinesWithMeta(query: string): Promise<{ results: any[]; isStale: boolean; savedAt: string | null; hasCache: boolean }> {
  const normalizedQuery = normalizeOtcSearchQuery(query);
  if (!normalizedQuery) return { results: [], isStale: false, savedAt: null, hasCache: false };
  const cache = await readOtcSearchCache();
  const terms = normalizedQuery.split(' ').filter(Boolean);
  if (!cache) {
    return {
      results: [],
      isStale: false,
      savedAt: null,
      hasCache: false,
    };
  }

  const exact = cache.queries?.[normalizedQuery];
  const exactResults = dedupeOtcResults(exact?.data || []);
  if (exact && exactResults.length > 0) {
    return {
      results: exactResults,
      isStale: isOtcCacheStale(exact.saved_at),
      savedAt: exact.saved_at,
      hasCache: true,
    };
  }

  const byId = new Map<string, any>();
  cache.data.forEach((item: any) => {
    const text = getOtcSearchableText(item);
    if (terms.every((term) => text.includes(term))) {
      byId.set(getOtcCacheId(item), item);
    }
  });
  return {
    results: Array.from(byId.values()).slice(0, OTC_SEARCH_CACHE_MAX_ITEMS),
    isStale: isOtcCacheStale(cache.saved_at),
    savedAt: cache.saved_at,
    hasCache: cache.data.length > 0,
  };
}

export async function searchCachedOtcMedicines(query: string): Promise<any[]> {
  return (await searchCachedOtcMedicinesWithMeta(query)).results;
}

export function normalizeOwnerKey(owner: CacheOwner): string {
  const id = owner?.id ?? owner?.owner_id;
  const email = owner?.email ?? owner?.owner_email;
  if (id !== null && id !== undefined && String(id).trim()) return `id:${normalizeCachePart(id)}`;
  if (typeof email === 'string' && email.trim()) return `email:${normalizeCachePart(email.trim().toLowerCase())}`;
  return 'anonymous';
}

export function getUserScopedKey(owner: CacheOwner, resource: string): string {
  return `@intakesync:user:${normalizeOwnerKey(owner)}:${resource}`;
}

export async function getCurrentCacheOwner() {
  const session = await getCachedSession();
  return {
    id: session?.user?.id ?? session?.user?.user_id ?? null,
    email: typeof session?.user?.email === 'string' ? session.user.email.trim().toLowerCase() : null,
  };
}

export function getCacheOwner(user?: any | null): CacheOwner {
  return {
    id: user?.id ?? user?.user_id ?? null,
    email: typeof user?.email === 'string' ? user.email.trim().toLowerCase() : null,
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

function normalizeLocalAvatarData(value: any): LocalAvatarData | null {
  if (!value || typeof value !== 'object') return null;
  if (value.type === 'built_in' && typeof value.avatar_key === 'string' && value.avatar_key.trim()) {
    return { type: 'built_in', avatar_key: value.avatar_key.trim() };
  }
  if (value.type === 'preset' && typeof value.id === 'string' && value.id.trim()) {
    return { type: 'built_in', avatar_key: value.id.trim() };
  }
  if (value.type === 'custom') {
    const uri = typeof value.avatar_uri === 'string' ? value.avatar_uri : value.uri;
    if (typeof uri === 'string' && uri.trim()) return { type: 'custom', avatar_uri: uri.trim() };
  }
  return null;
}

function avatarDataToUserFields(avatar: LocalAvatarData | null) {
  if (!avatar) return {};
  if (avatar.type === 'custom') {
    return {
      local_avatar_type: 'custom',
      avatar_uri: avatar.avatar_uri,
      selected_avatar: { type: 'custom', uri: avatar.avatar_uri },
    };
  }
  return {
    local_avatar_type: 'built_in',
    avatar_key: avatar.avatar_key,
    selected_avatar: { type: 'preset', id: avatar.avatar_key },
  };
}

export function getUserAvatarKey(user?: any | null): string | null {
  const owner = getCacheOwner(user);
  if (!owner.owner_id && !owner.owner_email) return null;
  return getUserScopedKey(owner, 'avatar');
}

export async function getLocalAvatarForUser(user?: any | null): Promise<LocalAvatarData | null> {
  try {
    const key = getUserAvatarKey(user);
    if (!key) return null;
    const raw = await AsyncStorage.getItem(key);
    return raw ? normalizeLocalAvatarData(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export async function saveLocalAvatarForUser(user: any, avatarData: any): Promise<LocalAvatarData | null> {
  const key = getUserAvatarKey(user);
  if (!key) return null;
  const normalized = normalizeLocalAvatarData(avatarData);
  if (!normalized) return null;

  let next = normalized;
  if (normalized.type === 'custom') {
    const ownerId = getUserCacheIdentifier(user) || 'local';
    const documentDirectory = FileSystem.documentDirectory;
    const avatarDir = documentDirectory ? `${documentDirectory}avatars/` : null;
    if (avatarDir && !normalized.avatar_uri.startsWith(avatarDir)) {
      await FileSystem.makeDirectoryAsync(avatarDir, { intermediates: true }).catch(() => undefined);
      const extMatch = /\.(jpe?g|png|webp|heic)(?:\?|$)/i.exec(normalized.avatar_uri);
      const ext = extMatch?.[1]?.toLowerCase() || 'jpg';
      const destination = `${avatarDir}user_${ownerId}.${ext}`;
      await FileSystem.copyAsync({ from: normalized.avatar_uri, to: destination });
      next = { type: 'custom', avatar_uri: destination };
    }
  }

  await AsyncStorage.setItem(key, JSON.stringify(next));
  await updateCachedUser({ ...(user || {}), ...avatarDataToUserFields(next) });
  return next;
}

export async function removeLocalAvatarForUser(user: any): Promise<void> {
  const avatar = await getLocalAvatarForUser(user);
  const key = getUserAvatarKey(user);
  if (key) await AsyncStorage.removeItem(key);
  if (avatar?.type === 'custom' && FileSystem.documentDirectory && avatar.avatar_uri.startsWith(FileSystem.documentDirectory)) {
    await FileSystem.deleteAsync(avatar.avatar_uri, { idempotent: true }).catch(() => undefined);
  }
  await updateCachedUser({
    ...(user || {}),
    local_avatar_type: null,
    avatar_key: null,
    avatar_uri: null,
    selected_avatar: null,
  });
}

export async function mergeLocalAvatarIntoUser<T = any>(user: T): Promise<T> {
  if (!user) return user;
  const avatar = await getLocalAvatarForUser(user);
  if (!avatar) return user;
  return { ...(user as any), ...avatarDataToUserFields(avatar) };
}

export function getUserSelectedAvatar(user?: any | null) {
  const selected = user?.selected_avatar;
  if (selected?.type === 'custom' && typeof selected.uri === 'string' && selected.uri.trim()) {
    return { type: 'custom' as const, uri: selected.uri.trim() };
  }
  if (selected?.type === 'preset' && typeof selected.id === 'string' && selected.id.trim()) {
    return { type: 'preset' as const, id: selected.id.trim() };
  }
  if (typeof user?.avatar_uri === 'string' && user.avatar_uri.trim()) {
    return { type: 'custom' as const, uri: user.avatar_uri.trim() };
  }
  if (typeof user?.avatar_key === 'string' && user.avatar_key.trim()) {
    return { type: 'preset' as const, id: user.avatar_key.trim() };
  }
  return null;
}

export function getUserRemoteAvatarUri(user?: any | null): string | null {
  const fields = [
    user?.avatar_url,
    user?.avatar,
    user?.photo,
    user?.picture,
    user?.profile_photo_url,
    user?.photo_url,
  ];
  const uri = fields.find((value) => typeof value === 'string' && value.trim());
  return typeof uri === 'string' ? uri.trim() : null;
}

export function getMedicationCacheKey(userIdOrEmail?: string | number | null) {
  return getUserScopedKey({ id: userIdOrEmail || null }, 'medications');
}

export function getMedicationHistoryCacheKey(userIdOrEmail?: string | number | null) {
  return getUserScopedKey({ id: userIdOrEmail || null }, 'medication_history');
}

export function getMedicationClearedHistoryCacheKey(userIdOrEmail?: string | number | null) {
  return getUserScopedKey({ id: userIdOrEmail || null }, 'medication_history_cleared_keys');
}

export function getDeletedMedicationTombstonesCacheKey(userIdOrEmail?: string | number | null) {
  return getUserScopedKey({ id: userIdOrEmail || null }, 'deleted_medication_tombstones');
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
  await AsyncStorage.setItem(key, JSON.stringify({
    ...owner,
    data,
    saved_at: new Date().toISOString(),
  }));
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
  emitMedicationUpdated();
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
  emitMedicationHistoryUpdated();
}

export async function readDeletedMedicationTombstones(user?: any | null): Promise<string[]> {
  const ownerKey = getUserCacheIdentifier(user);
  if (!ownerKey) return [];
  const payload = await readOwnedOfflineCache<string[]>(getDeletedMedicationTombstonesCacheKey(ownerKey), user);
  return Array.isArray(payload?.data) ? payload.data.filter(Boolean).map(String) : [];
}

export async function writeDeletedMedicationTombstones(user: any | null | undefined, keys: string[]): Promise<void> {
  const ownerKey = getUserCacheIdentifier(user);
  if (!ownerKey) return;
  await writeOwnedOfflineCache(
    getDeletedMedicationTombstonesCacheKey(ownerKey),
    user,
    Array.from(new Set(keys.filter(Boolean).map(String))),
  );
}

export async function readHydrationCache<T = any>(): Promise<T | null> {
  try {
    const session = await getCachedSession();
    const user = session?.user ?? null;
    const owner = getCacheOwner(user);
    if (!owner.owner_id && !owner.owner_email) return null;
    const payload = await readOwnedOfflineCache<T>(getUserScopedKey(owner, 'hydration_cache'), user);
    return payload?.data ?? null;
  } catch {
    return null;
  }
}

export async function writeHydrationCache(data: any): Promise<void> {
  const session = await getCachedSession();
  const user = session?.user ?? null;
  const owner = getCacheOwner(user);
  if (!owner.owner_id && !owner.owner_email) return;
  await writeOwnedOfflineCache(getUserScopedKey(owner, 'hydration_cache'), user, data);
  emitHydrationUpdated();
  const goal = Number(data?.goal ?? data?.daily_goal_ml ?? data?.hydration_goal ?? 0);
  if (Number.isFinite(goal) && goal > 0) {
    await updateCachedHydrationGoal(goal);
  }
}

export async function readProfileCache<T = any>(user?: any | null) {
  const session = user ? null : await getCachedSession();
  const currentUser = user ?? session?.user ?? null;
  const owner = getCacheOwner(currentUser);
  if (!owner.owner_id && !owner.owner_email) return null;
  const payload = await readOwnedOfflineCache<T>(getUserScopedKey(owner, 'profile'), currentUser);
  return payload?.data ?? null;
}

export async function writeProfileCache(data: any, user?: any | null) {
  const session = user ? null : await getCachedSession();
  const currentUser = user ?? session?.user ?? null;
  const owner = getCacheOwner(currentUser);
  if (!owner.owner_id && !owner.owner_email) return;
  await writeOwnedOfflineCache(getUserScopedKey(owner, 'profile'), currentUser, data);
  await updateCachedUser(data);
  emitProfileUpdated();
}

export async function readSettingsCache<T = any>(user?: any | null) {
  const session = user ? null : await getCachedSession();
  const currentUser = user ?? session?.user ?? null;
  const owner = getCacheOwner(currentUser);
  if (!owner.owner_id && !owner.owner_email) return null;
  const payload = await readOwnedOfflineCache<T>(getUserScopedKey(owner, 'settings'), currentUser);
  return payload?.data ?? null;
}

export async function writeSettingsCache(data: any, user?: any | null) {
  const session = user ? null : await getCachedSession();
  const currentUser = user ?? session?.user ?? null;
  const owner = getCacheOwner(currentUser);
  if (!owner.owner_id && !owner.owner_email) return;
  await writeOwnedOfflineCache(getUserScopedKey(owner, 'settings'), currentUser, data);
}

export async function readNotificationsCache<T = any>(user?: any | null) {
  const session = user ? null : await getCachedSession();
  const currentUser = user ?? session?.user ?? null;
  const owner = getCacheOwner(currentUser);
  if (!owner.owner_id && !owner.owner_email) return null;
  const payload = await readOwnedOfflineCache<T>(getUserScopedKey(owner, 'notifications'), currentUser);
  return payload?.data ?? null;
}

export async function writeNotificationsCache(data: any, user?: any | null) {
  const session = user ? null : await getCachedSession();
  const currentUser = user ?? session?.user ?? null;
  const owner = getCacheOwner(currentUser);
  if (!owner.owner_id && !owner.owner_email) return;
  await writeOwnedOfflineCache(getUserScopedKey(owner, 'notifications'), currentUser, data);
  emitNotificationsUpdated();
}
