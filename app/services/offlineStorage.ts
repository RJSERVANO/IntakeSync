import AsyncStorage from '@react-native-async-storage/async-storage';

export const SESSION_CACHE_KEY = 'intakesync.cached_session';
export const HYDRATION_CACHE_KEY = 'hydration';

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
