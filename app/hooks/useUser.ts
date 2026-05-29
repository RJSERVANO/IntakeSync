import { useState, useEffect } from 'react';
import api from '../app/api';
import { captureAuthSessionContext, isAuthSessionContextCurrent } from '../services/authSession';
import { getCachedSession, mergeLocalAvatarIntoUser, readProfileCache, updateCachedUser } from '../services/offlineStorage';

interface NormalizedUser {
  [key: string]: any;
}

export default function useUser(token?: string) {
  const [user, setUser] = useState<NormalizedUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      if (!token) {
        const cached = await getCachedSession();
        const cachedUser = await mergeLocalAvatarIntoUser(cached?.user ?? null);
        setUser(cachedUser);
        return;
      }
      const context = await captureAuthSessionContext(token);
      if (!(await isAuthSessionContextCurrent(context))) return;
      const cached = await getCachedSession();
      const cachedProfile = await readProfileCache<any>(cached?.user ?? null);
      if (cached?.user) {
        const cachedUser = await mergeLocalAvatarIntoUser(cachedProfile || cached.user);
        setUser(cachedUser);
        setLoading(false);
      }
      const data: any = await api.get('/me', token as string);
      if (!(await isAuthSessionContextCurrent(context))) return;
      // Return the raw data but also add normalized/camelCase aliases
      const merged: any = {
        ...(data || {}),
        phone: data.phone || data.mobile || undefined,
        dateOfBirth: data.date_of_birth || data.dateOfBirth || undefined,
        emergencyContact: data.emergency_contact || data.emergencyContact || undefined,
      };
      const profileTime = new Date(cachedProfile?.local_updated_at || cachedProfile?.updated_at || 0).getTime();
      const remoteTime = new Date(merged?.updated_at || 0).getTime();
      if (Number.isFinite(profileTime) && profileTime > 0 && (!Number.isFinite(remoteTime) || profileTime > remoteTime)) {
        const localProfile = await mergeLocalAvatarIntoUser(cachedProfile);
        if (!(await isAuthSessionContextCurrent(context))) return;
        setUser(localProfile);
        return;
      }
      const withLocalAvatar = await mergeLocalAvatarIntoUser(merged);
      if (!(await isAuthSessionContextCurrent(context))) return;
      setUser(withLocalAvatar);
      await updateCachedUser(withLocalAvatar, token);
    } catch (err) {
      console.warn('useUser: failed to load user', err);
      if (api.isStaleSessionError(err)) return;
      if (api.isAuthError(err)) {
        const context = await captureAuthSessionContext(token);
        if (await isAuthSessionContextCurrent(context)) setUser(null);
        return;
      }
      const cached = await getCachedSession();
      const cachedUser = await mergeLocalAvatarIntoUser(cached?.user ?? null);
      setUser(cachedUser);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return { user, setUser, loading, reload: load };
}
